import { Wire } from '../../core/Wire.js';
import { AStarRouter, ObstacleCache } from '../../core/AStarRouter.js';
import { WireCrossingDetector } from '../../core/WireCrossingDetector.js';
import { generateId } from '../../utils/IdGenerator.js';
import { ConnectWireCommand, DisconnectWireCommand } from '../../utils/UndoManager.js';

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
    // When true, wires keep their paths and only update endpoints when components move.
    // When false (legacy mode), wires are fully re-routed on every change.
    this._stableMode = true;

    // Wire edit handler — manages control point dragging
    this._wireEditHandler = null;

    // Wire crossing detector — detects and renders wire crossings (bridges/jumps)
    this._crossingDetector = new WireCrossingDetector();
  }

  getWires() { return this.wires; }

  /**
   * Update wire colors only — does NOT change wire paths.
   * Called by engine.onUpdate to reflect signal changes without rerouting.
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

  /**
   * Whether stable mode is enabled (wires keep their paths).
   */
  get stableMode() { return this._stableMode; }

  /**
   * Set stable mode on or off.
   */
  set stableMode(val) { this._stableMode = val; }

  /**
   * Get the obstacle cache instance.
   */
  getObstacleCache() { return this._obstacleCache; }

  /**
   * Set the wire edit handler (for control point dragging).
   */
  setWireEditHandler(handler) { this._wireEditHandler = handler; }

  /**
   * Rebuild the component obstacle cache.
   * Should be called when components are added, removed, or after drag ends.
   */
  rebuildObstacleCache() {
    const components = this._getComponents();
    this._obstacleCache.rebuildComponentGrid(components);
    this._router = null;  // Invalidate router so it picks up new cache
  }

  /**
   * Incremental update: remove old component obstacles, add new ones.
   * Used during drag for better performance than full rebuild.
   */
  updateObstacleCacheForComponent(comp, oldPosition) {
    // Remove old position obstacles
    if (oldPosition) {
      const savedPos = comp.position;
      comp.position = oldPosition;
      this._obstacleCache.removeComponentObstacles(comp);
      comp.position = savedPos;
    }
    // Add new position obstacles
    this._obstacleCache.addComponentObstacles(comp);
    this._router = null;  // Invalidate router
  }

  /**
   * Create or get the A* router instance for smart wire routing.
   * Now uses the obstacle cache for fast grid rebuilding.
   */
  _getRouter() {
    // Always create a fresh router with the current obstacle cache
    this._router = new AStarRouter(
      this._obstacleCache,
      this.wires,
      this.positionCache,
      this.engine
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
      // Hide control handles if visible
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
   * In STABLE MODE: Only update endpoints (no full re-route).
   * In LEGACY MODE: Full re-route of affected wires.
   */
  updateWiresForComponent(comp) {
    const prefix = comp.id + '.';

    if (this._stableMode) {
      // STABLE: Only update endpoints, keep intermediate path points
      this.wires.forEach(wire => {
        if (wire.fromNode.nodeId.startsWith(prefix) || wire.toNode.nodeId.startsWith(prefix)) {
          if (wire.isLocked) return;  // Skip locked wires
          const fromPos = this.positionCache.getPosition(wire.fromNode.nodeId);
          const toPos = this.positionCache.getPosition(wire.toNode.nodeId);
          if (fromPos && toPos) {
            wire.updateEndpointsStable(fromPos, toPos);
            wire.refreshControlHandles();
          }
        }
      });
    } else {
      // LEGACY: Full re-route
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
   * In STABLE MODE: Only updates wire colors (paths stay the same).
   * Can be triggered by the "Reroute All" button with forceReroute=true.
   */
  performRedraw(components, forceReroute = false) {
    const busY = this.core.getBusBarY(components);

    if (forceReroute) {
      // Full re-route: rebuild obstacle cache and reroute all wires
      this._obstacleCache.rebuildComponentGrid(components);
      const router = this._getRouter();
      this.wires.forEach(wire => {
        wire.forceReroute(
          (nodeId) => this.positionCache.getPosition(nodeId),
          busY,
          router
        );
        // Update color
        const sourceComp = this.engine._findComponentByNode(wire.fromNode.nodeId);
        if (sourceComp) {
          const outNode = sourceComp.outputs.find(o => o.id === wire.fromNode.nodeId);
          if (outNode) wire.updateColor(outNode.value);
        }
      });
    } else {
      // Just update colors only — don't touch wire paths in stable mode
      this.wires.forEach(wire => {
        const sourceComp = this.engine._findComponentByNode(wire.fromNode.nodeId);
        if (sourceComp) {
          const outNode = sourceComp.outputs.find(o => o.id === wire.fromNode.nodeId);
          if (outNode) wire.updateColor(outNode.value);
        }
      });
    }
  }

  /**
   * Reroute all wires with fan-out awareness.
   * Wires from the same source are routed as a group,
   * with the first wire establishing a trunk path and
   * subsequent wires getting same-net bonuses for bus bundling.
   */
  rerouteWithFanOut() {
    const components = this._getComponents();
    this._obstacleCache.rebuildComponentGrid(components);
    const busY = this.core.getBusBarY(components);
    const topY = this.core.getTopClearY(components);

    // Group wires by sourceNodeId
    const groups = {};
    this.wires.forEach(wire => {
      const srcId = wire.fromNode.nodeId;
      if (!groups[srcId]) groups[srcId] = [];
      groups[srcId].push(wire);
    });

    // Route each group
    for (const [srcId, groupWires] of Object.entries(groups)) {
      // Create a fresh router for each group (picks up updated occupied cells)
      const router = this._getRouter();

      for (const wire of groupWires) {
        wire.forceReroute(
          (nodeId) => this.positionCache.getPosition(nodeId),
          busY,
          router
        );
        // Update color
        const sourceComp = this.engine._findComponentByNode(wire.fromNode.nodeId);
        if (sourceComp) {
          const outNode = sourceComp.outputs.find(o => o.id === wire.fromNode.nodeId);
          if (outNode) wire.updateColor(outNode.value);
        }
      }
    }

    // Update wire crossing bridges
    this.updateWireCrossings();
    this._updateJunctions();
  }

  /**
   * Reroute all wires using A* — called when user clicks "Reroute Wires" button.
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

  /**
   * Compute a preview path using A* routing with throttling.
   * Falls back to simple routing if A* is too slow.
   */
  computePreviewPath(fromPos, toPos) {
    const components = this._getComponents();
    const busY = this.core.getBusBarY(components);
    const topY = this.core.getTopClearY(components);

    // Try A* for preview (with obstacle cache, it should be fast enough)
    try {
      const router = this._getRouter();
      return Wire.computePath(fromPos, toPos, {
        minClearY: busY,
        maxClearY: topY,
        router,
        sourceNodeId: this.wiring?.fromNodeId
      });
    } catch (e) {
      // Fall back to simple routing
      return Wire.computePath(fromPos, toPos, { minClearY: busY, maxClearY: topY });
    }
  }

  /**
   * Throttled version of preview path computation.
   * Only computes A* path every 50ms to maintain smooth preview.
   */
  throttledPreviewUpdate(fromPos, toPos) {
    if (this._previewThrottleTimer) return;  // Already waiting

    this._previewThrottleTimer = setTimeout(() => {
      this._previewThrottleTimer = null;
      if (this.wiring && this.wiring.tempPath) {
        const d = this.computePreviewPath(fromPos, toPos);
        this.wiring.tempPath.setAttribute('d', d);
      }
    }, this._previewThrottleInterval);

    // Immediate simple preview for responsiveness
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
    const router = this._getRouter();
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

  /**
   * Detect and render wire crossings (bridges/jumps).
   * Should be called after rerouting or when wires change.
   */
  updateWireCrossings() {
    this._crossingDetector.detectCrossings(this.wires);
    this._crossingDetector.applyBridges(this.wires);
  }

  /**
   * Set crossing display style.
   * @param {string} style - 'ansi' for bridge arcs, 'iec' for junction dots only
   */
  setCrossingStyle(style) {
    this._crossingDetector.setStyle(style);
    this.updateWireCrossings();
  }

  get crossingDetector() { return this._crossingDetector; }

  /**
   * Reroute only the wires connected to a specific component.
   * More efficient than rerouting all wires.
   */
  rerouteWiresForComponent(comp) {
    const prefix = comp.id + '.';
    const components = this._getComponents();
    this._obstacleCache.rebuildComponentGrid(components);
    const busY = this.core.getBusBarY(components);
    const router = this._getRouter();

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
