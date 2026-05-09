/**
 * CanvasWiring.js — Wire Lifecycle Manager
 *
 * Orchestrates wire creation, removal, re-routing, and visual updates.
 * Uses the new Router (Direct / Manhattan / Manual) instead of
 * the old A* / Grid / WireManager stack.
 */

import { Wire } from '../../core/Wire.js';
import { WireCrossingDetector } from '../../core/WireCrossingDetector.js';
import { Router } from '../../routing/Router.js';
import { generateId } from '../../utils/IdGenerator.js';
import { ConnectWireCommand, DisconnectWireCommand } from '../../utils/UndoManager.js';
import { GRID_SIZE } from '../../config.js';

export class CanvasWiring {
  constructor(engine, eventBus, undoManager, core, positionCache, canvas) {
    this.engine        = engine;
    this.eventBus      = eventBus;
    this.undoManager   = undoManager;
    this.core          = core;
    this.positionCache = positionCache;
    this.canvas        = canvas;
    this.wires         = [];
    this.wiring        = null;      // active wiring state during creation
    this._redrawRequested  = false;
    this._redrawCallback   = null;

    // ─── Router: clean routing engine ───
    this._router = new Router({
      gridSize: core.gridSize || GRID_SIZE,
      stepBack: 1
    });
    this._lastChannelMap = null;

    // Throttle for preview (50 ms)
    this._previewThrottleTimer    = null;
    this._previewThrottleInterval = 50;

    // Stable wire routing mode
    this._stableMode = true;

    // Auto-reroute on component drop
    this._autoRerouteOnDrop = true;

    // Wire edit handler
    this._wireEditHandler = null;

    // Wire crossing detector
    this._crossingDetector = new WireCrossingDetector();
  }

  getWires() { return this.wires; }

  /* ─── Color-only update (no path change) ─── */

  updateWireColorsOnly() {
    // Track which components have floating inputs for visual feedback
    const floatingInputNodes = new Set();

    this.wires.forEach(wire => {
      const sourceComp = this.engine._findComponentByNode(wire.fromNode.nodeId);
      if (sourceComp) {
        const outNode = sourceComp.outputs.find(o => o.id === wire.fromNode.nodeId);
        if (outNode) wire.updateColor(outNode.value);
      }
    });

    // Detect floating inputs (inputs not connected to any wire)
    for (const comp of this._getComponents()) {
      for (const inp of comp.inputs) {
        if (!inp.connectedTo) {
          floatingInputNodes.add(inp.id);
        }
      }
    }

    // Update floating input connector visual state
    for (const comp of this._getComponents()) {
      if (!comp.element) continue;
      const inputConnectors = comp.element.querySelectorAll('.connector.input');
      inputConnectors.forEach(dot => {
        const nodeId = dot.dataset.node;
        if (floatingInputNodes.has(nodeId)) {
          dot.classList.add('floating');
        } else {
          dot.classList.remove('floating');
        }
      });
    }
  }

  /* ─── Properties ─── */

  get stableMode()       { return this._stableMode; }
  set stableMode(val)    { this._stableMode = val; }
  get autoRerouteOnDrop()   { return this._autoRerouteOnDrop; }
  set autoRerouteOnDrop(val){ this._autoRerouteOnDrop = val; }

  setWireEditHandler(handler) { this._wireEditHandler = handler; }

  /* ─── Legacy compat: obstacle cache (no-op now) ─── */

  getObstacleCache() {
    return { componentGrid: new Map(), rebuildComponentGrid(){}, version: 0 };
  }

  rebuildObstacleCache() {
    // No-op: the new Router has no grid to rebuild
  }

  updateObstacleCacheForComponent() {
    // No-op
  }

  /* ─── Router accessor ─── */

  /**
   * Return the Router instance.
   * Used by CanvasEvents for preview paths and by Wire.render().
   */
  _getRouter() {
    return this._router;
  }

  /* ================================================================
   *  Wire Lifecycle
   * ================================================================ */

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

  /* ─── Component-aware wire updates ─── */

  updateWiresForComponent(comp) {
    const prefix = comp.id + '.';

    if (this._stableMode) {
      // Fast: just stretch endpoints (full reroute on drop)
      this.wires.forEach(wire => {
        if (wire.fromNode.nodeId.startsWith(prefix) || wire.toNode.nodeId.startsWith(prefix)) {
          if (wire.isLocked) return;
          const fromPos = this.positionCache.getPosition(wire.fromNode.nodeId);
          const toPos   = this.positionCache.getPosition(wire.toNode.nodeId);
          if (fromPos && toPos) {
            wire.updateEndpointsStable(fromPos, toPos);
            wire.refreshControlHandles();
          }
        }
      });
    } else {
      this.rerouteWithFanOut();
    }
  }

  /* ─── Redraw scheduling ─── */

  performRedraw(components, forceReroute = false) {
    if (forceReroute) {
      this.rerouteWithFanOut();
    } else {
      this.updateWireColorsOnly();
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

  /* ================================================================
   *  Main Routing: rerouteWithFanOut
   * ================================================================ */

  /**
   * Full re-route of all wires using the clean Router.
   *
   * 1. Assign vertical channels to each source (prevents overlap)
   * 2. Route each wire through its channel (Manhattan) or control points (Manual)
   * 3. Update SVG, colors, crossings, junctions
   */
  rerouteWithFanOut() {
    const components = this._getComponents();
    const getPosition = (nodeId) => this.positionCache.getPosition(nodeId);
    const busY = this.core.getBusBarY(components);
    const topY = this.core.getTopClearY(components);

    // Assign channels
    const channelMap = this._router.assignChannels(this.wires, getPosition);
    this._lastChannelMap = channelMap;

    // Route each wire
    for (const wire of this.wires) {
      if (wire.isLocked) continue;

      const fromPos = getPosition(wire.sourceNode.nodeId);
      const toPos   = getPosition(wire.targetNode.nodeId);
      if (!fromPos || !toPos) continue;

      const sourceId = wire.sourceNode.nodeId;
      const opts = {
        channelX: channelMap.get(sourceId),
        busY,
        topY
      };

      const points = wire.computePathPoints(fromPos, toPos, this._router, opts);
      const d = Wire.pointsToSVGPath(points);

      if (wire.element && points.length >= 2) {
        wire.element.querySelector('.wire-visual').setAttribute('d', d);
        wire.element.querySelector('.wire-hitarea').setAttribute('d', d);

        const junctionDot = wire.element.querySelector('.wire-junction');
        if (junctionDot) {
          junctionDot.setAttribute('cx', fromPos.x);
          junctionDot.setAttribute('cy', fromPos.y);
        }
        wire.updateOccupiedCells(d);
      }
    }

    // Update colors
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

  rerouteAllWires() {
    this.rerouteWithFanOut();
    if (this.canvas?.toaster) {
      this.canvas.toaster.show('All wires rerouted', 'success');
    }
  }

  /* ================================================================
   *  Wire Creation (Interactive)
   * ================================================================ */

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
    path.setAttribute('d', Wire.computePath(fromPos, fromPos, {
      minClearY: this.core.getBusBarY(this._getComponents())
    }));

    this.core.svgLayer.appendChild(path);
    this.wiring.tempPath = path;
  }

  computePreviewPath(fromPos, toPos) {
    const components = this._getComponents();
    const busY  = this.core.getBusBarY(components);
    const topY  = this.core.getTopClearY(components);
    const sourceId = this.wiring?.fromNodeId;
    const channelX = this._lastChannelMap?.get(sourceId);

    try {
      const points = this._router.route(fromPos, toPos, 'manhattan', {
        channelX,
        busY,
        topY
      });
      const svgPath = Wire.pointsToSVGPath(points);
      if (svgPath) return svgPath;
    } catch (_) { /* fallback below */ }

    return Wire.computePath(fromPos, toPos, { minClearY: busY, maxClearY: topY });
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

  /* ─── Internal: render a single wire ─── */

  _renderWire(wire) {
    wire.render(
      this.core.svgLayer,
      (nodeId) => this.positionCache.getPosition(nodeId),
      this.core.getBusBarY(this._getComponents()),
      this._router
    );
  }

  /* ─── Junctions ─── */

  _updateJunctions() {
    const outputFanout = {};
    this.wires.forEach(w => {
      outputFanout[w.fromNode.nodeId] = (outputFanout[w.fromNode.nodeId] || 0) + 1;
    });
    this.wires.forEach(w => {
      if (outputFanout[w.fromNode.nodeId] > 1) w.showJunction();
      else w.hideJunction();
    });

    // Also detect T-connections at intermediate path points
    // A T-connection occurs when an intermediate path point of one wire
    // lies exactly on a segment of another wire.
    this._detectIntermediateJunctions();
  }

  /**
   * Detect T-connections at intermediate path points.
   * When an intermediate point of one wire lies on a segment of another wire,
   * show a junction dot at that point.
   */
  _detectIntermediateJunctions() {
    // Collect all intermediate path points (not endpoints) from all wires
    const intermediatePoints = [];
    for (const wire of this.wires) {
      if (wire.pathPoints.length < 3) continue;
      for (let i = 1; i < wire.pathPoints.length - 1; i++) {
        intermediatePoints.push({
          x: wire.pathPoints[i].x,
          y: wire.pathPoints[i].y,
          wireId: wire.id,
          pointIndex: i
        });
      }
    }

    // For each intermediate point, check if it lies on any other wire's segment
    for (const pt of intermediatePoints) {
      for (const wire of this.wires) {
        if (wire.id === pt.wireId) continue;
        if (!wire.pathPoints || wire.pathPoints.length < 2) continue;

        for (let i = 0; i < wire.pathPoints.length - 1; i++) {
          const p1 = wire.pathPoints[i];
          const p2 = wire.pathPoints[i + 1];

          // Check if the intermediate point lies on this segment
          const isOnSegment = this._isPointOnSegment(pt.x, pt.y, p1.x, p1.y, p2.x, p2.y);
          if (isOnSegment) {
            // Add junction dot at this point
            this._addJunctionDot(pt.x, pt.y, wire);
            break;
          }
        }
      }
    }
  }

  /**
   * Check if a point lies on a line segment (within tolerance).
   */
  _isPointOnSegment(px, py, x1, y1, x2, y2) {
    const tolerance = 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      return Math.hypot(px - x1, py - y1) < tolerance;
    }

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const nearX = x1 + t * dx;
    const nearY = y1 + t * dy;

    return Math.hypot(px - nearX, py - nearY) < tolerance;
  }

  /**
   * Add a junction dot SVG element at the given position on a wire.
   */
  _addJunctionDot(x, y, wire) {
    if (!wire.element) return;

    // Check if junction dot already exists at this position
    const existingDots = wire.element.querySelectorAll('.wire-junction-intermediate');
    for (const dot of existingDots) {
      const cx = parseFloat(dot.getAttribute('cx'));
      const cy = parseFloat(dot.getAttribute('cy'));
      if (Math.abs(cx - x) < 2 && Math.abs(cy - y) < 2) return;
    }

    const style = getComputedStyle(document.documentElement);
    const neutralColor = style.getPropertyValue('--junction-dot-color').trim() ||
                         style.getPropertyValue('--wire-neutral-color').trim() || '#888';

    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', y);
    dot.setAttribute('r', '3');
    dot.setAttribute('fill', neutralColor);
    dot.setAttribute('pointer-events', 'none');
    dot.classList.add('wire-junction-intermediate');

    wire.element.appendChild(dot);
  }

  /* ─── Wire Crossings ─── */

  updateWireCrossings() {
    this._crossingDetector.detectCrossings(this.wires);
    this._crossingDetector.applyBridges(this.wires);
  }

  setCrossingStyle(style) {
    this._crossingDetector.setStyle(style);
    this.updateWireCrossings();
  }

  get crossingDetector() { return this._crossingDetector; }

  /* ─── Reroute for a specific component ─── */

  rerouteWiresForComponent(comp) {
    // Simple strategy: full reroute (clean and correct)
    this.rerouteWithFanOut();
  }

  /* ─── Component list (injected by Canvas) ─── */

  _getComponents() { return []; }
}
