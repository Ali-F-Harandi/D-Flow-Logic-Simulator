import { Wire } from '../../core/Wire.js';
import { AStarRouter, ObstacleCache } from '../../core/AStarRouter.js';
import { WireCrossingDetector } from '../../core/WireCrossingDetector.js';
import { generateId } from '../../utils/IdGenerator.js';
import { ConnectWireCommand, DisconnectWireCommand } from '../../utils/UndoManager.js';
import { GRID_SIZE } from '../../config.js';

export class CanvasWiring {
  constructor(engine, eventBus, undoManager, core, positionCache, canvas) {
    this.engine = engine;
    this.eventBus = eventBus;
    this.undoManager = undoManager;
    this.core = core;
    this.positionCache = positionCache;
    this.canvas = canvas;
    this.wires = [];
    this.wiring = null;
    this._redrawRequested = false;
    this._redrawCallback = null;
    this._router = null;

    // Obstacle cache — avoids rebuilding component grid on every wire routing
    this._obstacleCache = new ObstacleCache(core.gridSize);

    // Throttle for A* preview (50ms interval)
    this._previewThrottleTimer = null;
    this._previewThrottleInterval = 50;

    // --- Stable wire routing mode ---
    this._stableMode = true;

    // --- Auto-reroute on component drop ---
    this._autoRerouteOnDrop = true;

    // Wire edit handler
    this._wireEditHandler = null;

    // Wire crossing detector
    this._crossingDetector = new WireCrossingDetector();
  }

  getWires() { return this.wires; }

  /**
   * Update wire colors only — does NOT change wire paths.
   */
  updateWireColorsOnly() {
    this.wires.forEach(wire => {
      const sourceComp = this.engine._findComponentByNode(wire.fromNode.nodeId);
      if (sourceComp) {
        const outNode = sourceComp.outputs.find(o => o.id === wire.fromNode.nodeId);
        if (outNode) wire.updateColor(outNode.value);
      }
    });
  }

  get stableMode() { return this._stableMode; }
  set stableMode(val) { this._stableMode = val; }

  get autoRerouteOnDrop() { return this._autoRerouteOnDrop; }
  set autoRerouteOnDrop(val) { this._autoRerouteOnDrop = val; }

  getObstacleCache() { return this._obstacleCache; }

  setWireEditHandler(handler) { this._wireEditHandler = handler; }

  /**
   * Rebuild the component obstacle cache.
   */
  rebuildObstacleCache() {
    const components = this._getComponents();
    this._obstacleCache.rebuildComponentGrid(components);
    this._router = null;
  }

  updateObstacleCacheForComponent(comp, oldPosition) {
    if (oldPosition) {
      const savedPos = comp.position;
      comp.position = oldPosition;
      this._obstacleCache.removeComponentObstacles(comp);
      comp.position = savedPos;
    }
    this._obstacleCache.addComponentObstacles(comp);
    this._router = null;
  }

  /**
   * Create or get the A* router instance.
   * @param {Map} [channelMap] - Optional channel assignment map
   */
  _getRouter(channelMap = null) {
    this._router = new AStarRouter(
      this._obstacleCache,
      this.wires,
      this.positionCache,
      this.engine,
      channelMap
    );
    return this._router;
  }

  addVisualWire(engineId, fromNodeId, toNodeId) {
    const visualId = generateId('wire');
    const wire = new Wire(visualId, { nodeId: fromNodeId }, { nodeId: toNodeId });
    wire.engineId = engineId;
    this._renderWire(wire);
    this.wires.push(wire);
    this._updateJunctions();
    this.updateWireCrossings();
  }

  removeVisualWireByEngineId(engineId) {
    const wire = this.wires.find(w => w.engineId === engineId);
    if (wire) {
      wire.hideControlHandles();
      if (wire.element) wire.element.remove();
      wire.occupiedCells.clear();
      this.wires = this.wires.filter(w => w.engineId !== engineId);
      this._updateJunctions();
      this.updateWireCrossings();
    }
  }

  reconnectWire(engineId, fromNodeId, toNodeId) {
    this.addVisualWire(engineId, fromNodeId, toNodeId);
  }

  /**
   * Update wires connected to a specific component.
   */
  updateWiresForComponent(comp) {
    const prefix = comp.id + '.';

    if (this._stableMode) {
      this.wires.forEach(wire => {
        if (wire.fromNode.nodeId.startsWith(prefix) || wire.toNode.nodeId.startsWith(prefix)) {
          if (wire.isLocked) return;
          const fromPos = this.positionCache.getPosition(wire.fromNode.nodeId);
          const toPos = this.positionCache.getPosition(wire.toNode.nodeId);
          if (fromPos && toPos) {
            wire.updateEndpointsStable(fromPos, toPos);
            wire.refreshControlHandles();
          }
        }
      });
    } else {
      const components = this._getComponents();
      const busY = this.core.getBusBarY(components);
      const router = this._getRouter();
      this.wires.forEach(wire => {
        if (wire.fromNode.nodeId.startsWith(prefix) || wire.toNode.nodeId.startsWith(prefix)) {
          wire.updatePath((nodeId) => this.positionCache.getPosition(nodeId), busY, router);
        }
      });
    }
  }

  /**
   * Perform a full redraw of all wires.
   */
  performRedraw(components, forceReroute = false) {
    const busY = this.core.getBusBarY(components);

    if (forceReroute) {
      this.rerouteWithFanOut();
    } else {
      this.updateWireColorsOnly();
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════
   * CORE ROUTING: Reroute all wires with overlap-free channel allocation.
   *
   * Strategy:
   * 1. Assign unique vertical channels to wires from different sources
   * 2. Route each wire through its assigned channel using A*
   * 3. Detect remaining overlaps and iteratively resolve them
   * 4. Apply wire crossing bridges/jumps
   * ═══════════════════════════════════════════════════════════════
   */
  rerouteWithFanOut() {
    const components = this._getComponents();
    this._obstacleCache.rebuildComponentGrid(components);
    const busY = this.core.getBusBarY(components);
    const topY = this.core.getTopClearY(components);

    // ── Phase 1: Channel Allocation ──
    // Assign unique vertical channels to each source to prevent overlap.
    const channelMap = this._assignVerticalChannels();

    // ── Phase 2: Route all wires using A* with channel guidance ──
    // Group wires by sourceNodeId (fan-out bundling)
    const groups = {};
    this.wires.forEach(wire => {
      const srcId = wire.fromNode.nodeId;
      if (!groups[srcId]) groups[srcId] = [];
      groups[srcId].push(wire);
    });

    // Sort groups: fewer wires first (less likely to block others)
    const sortedGroups = Object.entries(groups).sort((a, b) => a[1].length - b[1].length);

    for (const [srcId, groupWires] of sortedGroups) {
      // Create router with channel map for this group
      const router = this._getRouter(channelMap);

      for (const wire of groupWires) {
        wire.forceReroute(
          (nodeId) => this.positionCache.getPosition(nodeId),
          busY,
          router
        );
      }
    }

    // ── Phase 3: Iterative overlap resolution ──
    // Check for remaining same-direction overlaps and reroute those wires.
    const MAX_OVERLAP_ITERATIONS = 5;
    for (let iteration = 0; iteration < MAX_OVERLAP_ITERATIONS; iteration++) {
      const overlaps = this._detectOverlaps();
      if (overlaps.length === 0) break;

      // Collect wires that need rerouting
      const wiresToReroute = new Set();
      for (const overlap of overlaps) {
        wiresToReroute.add(overlap.wireA);
        wiresToReroute.add(overlap.wireB);
      }

      // Rebuild obstacle cache and reroute overlapping wires
      this._obstacleCache.rebuildComponentGrid(components);

      for (const wire of wiresToReroute) {
        // Clear this wire's path first to remove it from obstacles
        wire.pathPoints = [];
        wire.occupiedCells.clear();

        const router = this._getRouter(channelMap);
        wire.forceReroute(
          (nodeId) => this.positionCache.getPosition(nodeId),
          busY,
          router
        );
      }
    }

    // ── Phase 4: Update colors and crossings ──
    this.wires.forEach(wire => {
      const sourceComp = this.engine._findComponentByNode(wire.fromNode.nodeId);
      if (sourceComp) {
        const outNode = sourceComp.outputs.find(o => o.id === wire.fromNode.nodeId);
        if (outNode) wire.updateColor(outNode.value);
      }
    });

    this.updateWireCrossings();
    this._updateJunctions();
  }

  /**
   * ═══════════════════════════════════════════════════════════════
   * CHANNEL ALLOCATION: Assign unique vertical columns to each source.
   *
   * This is the key mechanism for preventing same-direction overlaps.
   * Each wire source (output connector) gets its own vertical column.
   * Wires from the same source can share a column (fan-out bundling).
   * Wires from different sources MUST use different columns.
   *
   * The channel assignment ensures that vertical segments from different
   * sources never share the same X position, eliminating overlap.
   * ═══════════════════════════════════════════════════════════════
   */
  _assignVerticalChannels() {
    const gs = GRID_SIZE;
    const channelMap = new Map();   // sourceNodeId → channelX (pixel coordinate)
    const usedChannels = new Set(); // Set of used channel grid columns

    // Collect all unique sources and their preferred channel positions
    const sourceInfos = new Map(); // sourceNodeId → { preferredX, minY, maxY }

    for (const wire of this.wires) {
      const srcId = wire.fromNode.nodeId;
      const fromPos = this.positionCache.getPosition(wire.fromNode.nodeId);
      const toPos = this.positionCache.getPosition(wire.toNode.nodeId);
      if (!fromPos || !toPos) continue;

      if (!sourceInfos.has(srcId)) {
        sourceInfos.set(srcId, {
          preferredX: fromPos.x,
          fromX: fromPos.x,
          toX: toPos.x,
          fromY: fromPos.y,
          toY: toPos.y,
          wires: []
        });
      }

      const info = sourceInfos.get(srcId);
      info.wires.push(wire);

      // Update preferred X: the midpoint of the routing region
      const midX = (fromPos.x + toPos.x) / 2;
      // Use the midpoint between source output and nearest destination input
      // as the preferred channel position
      info.preferredX = (info.preferredX + midX) / 2;
    }

    // Sort sources: leftmost sources get assigned first
    // This gives them the most natural channel positions
    const sortedSources = [...sourceInfos.entries()]
      .sort((a, b) => a[1].fromX - b[1].fromX);

    for (const [srcId, info] of sortedSources) {
      // Find a free channel near the preferred position
      let preferredCol = Math.round(info.preferredX / gs);
      let channelCol = preferredCol;
      let offset = 0;

      // Search outward from preferred position for a free column
      while (usedChannels.has(channelCol)) {
        offset++;
        // Try right
        const rightCol = preferredCol + offset;
        if (!usedChannels.has(rightCol)) {
          channelCol = rightCol;
          break;
        }
        // Try left
        const leftCol = preferredCol - offset;
        if (!usedChannels.has(leftCol)) {
          channelCol = leftCol;
          break;
        }
      }

      channelMap.set(srcId, channelCol * gs);
      usedChannels.add(channelCol);
    }

    return channelMap;
  }

  /**
   * ═══════════════════════════════════════════════════════════════
   * OVERLAP DETECTION: Find same-direction overlaps between wires
   * from different sources.
   *
   * Two wires overlap when they share grid cells with the SAME
   * direction (both vertical or both horizontal) but come from
   * different sources. This is the condition the user wants to prevent.
   * ═══════════════════════════════════════════════════════════════
   */
  _detectOverlaps() {
    const gs = GRID_SIZE;
    const overlaps = [];

    for (let i = 0; i < this.wires.length; i++) {
      for (let j = i + 1; j < this.wires.length; j++) {
        const wireA = this.wires[i];
        const wireB = this.wires[j];

        // Skip same-source wires (fan-out allowed)
        if (wireA.fromNode.nodeId === wireB.fromNode.nodeId) continue;

        if (wireA.pathPoints.length < 2 || wireB.pathPoints.length < 2) continue;

        // Build direction-cell maps for both wires
        const cellsA = this._getWireDirectionCells(wireA);
        const cellsB = this._getWireDirectionCells(wireB);

        // Check for same-direction overlaps
        for (const [key, dirA] of cellsA) {
          const dirB = cellsB.get(key);
          if (dirB && dirA === dirB) {
            overlaps.push({ wireA, wireB, cellKey: key, direction: dirA });
          }
        }
      }
    }

    return overlaps;
  }

  /**
   * Get a map of grid cell keys to direction ('h' or 'v') for a wire.
   */
  _getWireDirectionCells(wire) {
    const gs = GRID_SIZE;
    const cells = new Map();

    for (let i = 0; i < wire.pathPoints.length - 1; i++) {
      const p1 = wire.pathPoints[i];
      const p2 = wire.pathPoints[i + 1];
      const isHorizontal = Math.abs(p2.y - p1.y) < 1;
      const isVertical = Math.abs(p2.x - p1.x) < 1;

      if (isHorizontal) {
        const y = Math.round(p1.y / gs);
        const x1 = Math.round(Math.min(p1.x, p2.x) / gs);
        const x2 = Math.round(Math.max(p1.x, p2.x) / gs);
        for (let x = x1; x <= x2; x++) {
          cells.set(`${x},${y}`, 'h');
        }
      } else if (isVertical) {
        const x = Math.round(p1.x / gs);
        const y1 = Math.round(Math.min(p1.y, p2.y) / gs);
        const y2 = Math.round(Math.max(p1.y, p2.y) / gs);
        for (let y = y1; y <= y2; y++) {
          cells.set(`${x},${y}`, 'v');
        }
      }
    }

    return cells;
  }

  /**
   * Reroute all wires — called when user clicks "Reroute Wires" button.
   */
  rerouteAllWires() {
    this.rerouteWithFanOut();
    if (this.canvas?.toaster) {
      this.canvas.toaster.show('All wires rerouted', 'success');
    }
  }

  scheduleRedraw() {
    if (!this._redrawRequested) {
      this._redrawRequested = true;
      requestAnimationFrame(() => {
        if (this._redrawCallback) this._redrawCallback();
        this._redrawRequested = false;
      });
    }
  }

  startWiring(comp, nodeId, isOutput) {
    if (this.wiring) return;
    this.wiring = { fromComp: comp, fromNodeId: nodeId, fromIsOutput: isOutput };
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke', '#4ec9b0');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('pointer-events', 'none');
    path.setAttribute('stroke-dasharray', '6,4');
    path.classList.add('wire-preview');
    const fromPos = this.positionCache.getPosition(nodeId);
    path.setAttribute('d', Wire.computePath(fromPos, fromPos, { minClearY: this.core.getBusBarY(this._getComponents()) }));
    this.core.svgLayer.appendChild(path);
    this.wiring.tempPath = path;
  }

  computePreviewPath(fromPos, toPos) {
    const components = this._getComponents();
    const busY = this.core.getBusBarY(components);
    const topY = this.core.getTopClearY(components);

    try {
      const router = this._getRouter();
      return Wire.computePath(fromPos, toPos, {
        minClearY: busY,
        maxClearY: topY,
        router,
        sourceNodeId: this.wiring?.fromNodeId
      });
    } catch (e) {
      return Wire.computePath(fromPos, toPos, { minClearY: busY, maxClearY: topY });
    }
  }

  throttledPreviewUpdate(fromPos, toPos) {
    if (this._previewThrottleTimer) return;

    this._previewThrottleTimer = setTimeout(() => {
      this._previewThrottleTimer = null;
      if (this.wiring && this.wiring.tempPath) {
        const d = this.computePreviewPath(fromPos, toPos);
        this.wiring.tempPath.setAttribute('d', d);
      }
    }, this._previewThrottleInterval);

    const busY = this.core.getBusBarY(this._getComponents());
    return Wire.computePath(fromPos, toPos, { minClearY: busY });
  }

  cancelWiring() {
    if (this.wiring) {
      if (this.wiring.tempPath) this.wiring.tempPath.remove();
      this.wiring = null;
    }
    if (this._previewThrottleTimer) {
      clearTimeout(this._previewThrottleTimer);
      this._previewThrottleTimer = null;
    }
  }

  completeConnection(fromNodeId, toNodeId) {
    const cmd = new ConnectWireCommand(this.engine, this.canvas, fromNodeId, toNodeId);
    return this.undoManager.execute(cmd);
  }

  _renderWire(wire) {
    const channelMap = this._assignVerticalChannels();
    const router = this._getRouter(channelMap);
    wire.render(
      this.core.svgLayer,
      (nodeId) => this.positionCache.getPosition(nodeId),
      this.core.getBusBarY(this._getComponents()),
      router
    );
  }

  _updateJunctions() {
    const outputFanout = {};
    this.wires.forEach(w => { outputFanout[w.fromNode.nodeId] = (outputFanout[w.fromNode.nodeId] || 0) + 1; });
    this.wires.forEach(w => {
      if (outputFanout[w.fromNode.nodeId] > 1) w.showJunction();
      else w.hideJunction();
    });
  }

  updateWireCrossings() {
    this._crossingDetector.detectCrossings(this.wires);
    this._crossingDetector.applyBridges(this.wires);
  }

  setCrossingStyle(style) {
    this._crossingDetector.setStyle(style);
    this.updateWireCrossings();
  }

  get crossingDetector() { return this._crossingDetector; }

  /**
   * Reroute only the wires connected to a specific component.
   */
  rerouteWiresForComponent(comp) {
    const prefix = comp.id + '.';
    const components = this._getComponents();
    this._obstacleCache.rebuildComponentGrid(components);
    const busY = this.core.getBusBarY(components);

    // Assign channels for all wires
    const channelMap = this._assignVerticalChannels();
    const router = this._getRouter(channelMap);

    this.wires.forEach(wire => {
      if (wire.fromNode.nodeId.startsWith(prefix) || wire.toNode.nodeId.startsWith(prefix)) {
        wire.forceReroute(
          (nodeId) => this.positionCache.getPosition(nodeId),
          busY,
          router
        );
        const sourceComp = this.engine._findComponentByNode(wire.fromNode.nodeId);
        if (sourceComp) {
          const outNode = sourceComp.outputs.find(o => o.id === wire.fromNode.nodeId);
          if (outNode) wire.updateColor(outNode.value);
        }
      }
    });

    this.updateWireCrossings();
    this._updateJunctions();
  }

  _getComponents() { return []; }   // injected by Canvas
}
