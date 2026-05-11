/**
 * CanvasWiring.js — Wire Lifecycle Manager (Enhanced)
 *
 * Orchestrates wire creation, removal, re-routing, and visual updates.
 * Now uses the enhanced Router with A* pathfinding, wire nudging,
 * and supports manual wire drawing mode.
 *
 * Enhancements:
 *   - A* routing with obstacle avoidance via OccupancyGrid
 *   - Wire nudging for clean parallel wire bundling
 *   - Manual wire drawing mode (click-to-place bend points)
 *   - Pin highlighting when drawing near connectors
 *   - Improved re-routing on component move (selective A* re-route)
 *   - Spatial hash for efficient hit testing
 */

import { Wire } from '../../core/Wire.js';
import { WireCrossingDetector } from '../../core/WireCrossingDetector.js';
import { Router } from '../../routing/Router.js';
import { SpatialHash } from '../../utils/SpatialHash.js';
import { generateId } from '../../utils/IdGenerator.js';
import { ConnectWireCommand, DisconnectWireCommand } from '../../utils/UndoManager.js';
import {
  GRID_SIZE, WIRE_DRAW_PREVIEW_COLOR, WIRE_PIN_MAGNET_RADIUS, SPATIAL_HASH_CELL_SIZE,
  WIRE_DEFAULT_ROUTING_MODE
} from '../../config.js';

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

    // ─── Router: enhanced routing engine with A* ───
    this._router = new Router({
      gridSize: core.gridSize || GRID_SIZE,
      stepBack: 1,
      useAStar: true,
      useNudging: true
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

    // ─── Spatial Hash (new) ───
    this._spatialHash = new SpatialHash({ cellSize: SPATIAL_HASH_CELL_SIZE });

    // ─── Manual Wire Drawing State (new) ───
    this._manualDrawing = false;
    this._manualDrawPoints = [];
    this._manualDrawPreview = null;
    this._manualDrawSourceNodeId = null;
    this._manualDrawTargetNodeId = null;

    // Track grid rebuild needs
    this._gridNeedsRebuild = true;
  }

  getWires() { return this.wires; }

  /* ─── Color-only update (no path change) ─── */

  updateWireColorsOnly() {
    const floatingInputNodes = new Set();

    this.wires.forEach(wire => {
      const sourceComp = this.engine._findComponentByNode(wire.fromNode.nodeId);
      if (sourceComp) {
        const outNode = sourceComp.outputs.find(o => o.id === wire.fromNode.nodeId);
        if (outNode) wire.updateColor(outNode.value);
      }
    });

    for (const comp of this._getComponents()) {
      for (const inp of comp.inputs) {
        if (!inp.connectedTo) {
          floatingInputNodes.add(inp.id);
        }
      }
    }

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
  get isManualDrawing()  { return this._manualDrawing; }
  get spatialHash()      { return this._spatialHash; }

  setWireEditHandler(handler) { this._wireEditHandler = handler; }

  /* ─── Legacy compat: obstacle cache ─── */

  getObstacleCache() {
    return { componentGrid: new Map(), rebuildComponentGrid(){}, version: 0 };
  }

  rebuildObstacleCache() {
    this._gridNeedsRebuild = true;
  }

  updateObstacleCacheForComponent() {
    this._gridNeedsRebuild = true;
  }

  /* ─── Router accessor ─── */

  _getRouter() {
    return this._router;
  }

  /* ─── Grid Rebuild ─── */

  /**
   * Ensure the occupancy grid is up-to-date before routing.
   * Only rebuilds when needed (lazy rebuild).
   */
  _ensureGridBuilt() {
    if (this._gridNeedsRebuild || !this._router._gridBuilt) {
      const components = this._getComponents();
      const getPosition = (nodeId) => this.positionCache.getPosition(nodeId);
      this._router.rebuildGrid(components, this.wires, getPosition);
      this._gridNeedsRebuild = false;
    }
  }

  /* ─── Spatial Hash Rebuild ─── */

  /**
   * Rebuild the spatial hash with current components and wires.
   */
  _rebuildSpatialHash() {
    this._spatialHash.clear();

    for (const comp of this._getComponents()) {
      this._spatialHash.insertComponent(comp);

      // Insert pins
      const allNodes = [...comp.inputs, ...comp.outputs];
      for (const node of allNodes) {
        const pos = this.positionCache.getPosition(node.id);
        if (pos) {
          this._spatialHash.insertPin({
            id: node.id,
            x: pos.x,
            y: pos.y,
            isOutput: comp.outputs.includes(node),
            compId: comp.id
          });
        }
      }
    }

    for (const wire of this.wires) {
      this._spatialHash.insertWire(wire);
    }
  }

  /* ================================================================
   *  Wire Lifecycle
   * ================================================================ */

  addVisualWire(engineId, fromNodeId, toNodeId) {
    const visualId = generateId('wire');
    const wire = new Wire(visualId, { nodeId: fromNodeId }, { nodeId: toNodeId }, Wire.MODE_BEZIER);
    wire.engineId = engineId;
    this._renderWire(wire);
    this.wires.push(wire);
    this._updateJunctions();
    this.updateWireCrossings();

    // Mark grid for rebuild
    this._gridNeedsRebuild = true;
  }

  removeVisualWireByEngineId(engineId) {
    const wire = this.wires.find(w => w.engineId === engineId);
    if (wire) {
      wire.hideControlHandles();
      wire.setHovered(false);
      if (wire.element) wire.element.remove();
      wire.occupiedCells.clear();
      this.wires = this.wires.filter(w => w.engineId !== engineId);
      this._updateJunctions();
      this.updateWireCrossings();
      this._gridNeedsRebuild = true;
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
   *  Main Routing: rerouteWithFanOut (Enhanced with A*)
   * ================================================================ */

  /**
   * Full re-route of all wires using the enhanced Router.
   *
   * 1. Rebuild occupancy grid (if needed)
   * 2. Assign vertical channels to each source
   * 3. Route each wire using A* (with Manhattan fallback)
   * 4. Nudge overlapping parallel wires
   * 5. Update SVG, colors, crossings, junctions
   */
  rerouteWithFanOut() {
    const components = this._getComponents();
    const getPosition = (nodeId) => this.positionCache.getPosition(nodeId);
    const busY = this.core.getBusBarY(components);
    const topY = this.core.getTopClearY(components);

    // Step 1: Rebuild occupancy grid
    this._ensureGridBuilt();

    // Step 2: Assign channels
    const channelMap = this._router.assignChannels(this.wires, getPosition);
    this._lastChannelMap = channelMap;

    // Step 3: Route each wire
    for (const wire of this.wires) {
      if (wire.isLocked) continue;

      const fromPos = getPosition(wire.sourceNode.nodeId);
      const toPos   = getPosition(wire.targetNode.nodeId);
      if (!fromPos || !toPos) continue;

      const sourceId = wire.sourceNode.nodeId;
      const targetId = wire.targetNode.nodeId;

      // Skip manual wires that haven't been forced to re-route
      if (wire.routingMode === Wire.MODE_MANUAL && wire.controlPoints.length > 0) {
        wire._updateEndpointsOnly(fromPos, toPos);
        continue;
      }

      // Skip Bézier wires — just recompute their curve (fast, no A* needed)
      if (wire.routingMode === Wire.MODE_BEZIER) {
        const fromDir = Wire.getPortDirection(sourceId);
        const toDir   = Wire.getPortDirection(targetId);
        const bezierPoints = this._router.routeBezier(fromPos, toPos, { fromDir, toDir });
        wire.pathPoints = bezierPoints;

        const d = Wire.pointsToSVGPath(bezierPoints, true);

        if (wire.element && bezierPoints.length >= 2) {
          wire.element.querySelector('.wire-visual').setAttribute('d', d);
          wire.element.querySelector('.wire-hitarea').setAttribute('d', d);

          const glowPath = wire.element.querySelector('.wire-glow');
          if (glowPath) glowPath.setAttribute('d', d);

          const junctionDot = wire.element.querySelector('.wire-junction');
          if (junctionDot) {
            junctionDot.setAttribute('cx', fromPos.x);
            junctionDot.setAttribute('cy', fromPos.y);
          }

          const sourceDot = wire.element.querySelector('.wire-endpoint-source');
          if (sourceDot) {
            sourceDot.setAttribute('cx', fromPos.x);
            sourceDot.setAttribute('cy', fromPos.y);
          }
          const targetDot = wire.element.querySelector('.wire-endpoint-target');
          if (targetDot) {
            targetDot.setAttribute('cx', toPos.x);
            targetDot.setAttribute('cy', toPos.y);
          }

          wire.updateOccupiedCells(d);
        }
        continue;
      }

      // Channel is now keyed by wire.id (fan-out fix: each wire gets a distinct channel)
      const opts = {
        channelX: channelMap.get(wire.id),
        busY,
        topY,
        sourceNodeId: sourceId,
        targetNodeId: targetId
      };

      // Use A* for auto-routed wires, Manhattan for direct mode
      const mode = wire.routingMode === Wire.MODE_DIRECT ? 'direct' : 'astar';
      const points = this._router.route(fromPos, toPos, mode, opts);
      wire.pathPoints = points;

      // Track routing method and set fallback visual indicator
      if (wire.isAutoRouted) {
        const method = this._router.getLastStats()?.method || 'manhattan';
        wire._routedMethod = method;
        wire.setRoutingFallback(method === 'fallback');
      }

      const d = Wire.pointsToSVGPath(points);

      if (wire.element && points.length >= 2) {
        wire.element.querySelector('.wire-visual').setAttribute('d', d);
        wire.element.querySelector('.wire-hitarea').setAttribute('d', d);

        const glowPath = wire.element.querySelector('.wire-glow');
        if (glowPath) glowPath.setAttribute('d', d);

        const junctionDot = wire.element.querySelector('.wire-junction');
        if (junctionDot) {
          junctionDot.setAttribute('cx', fromPos.x);
          junctionDot.setAttribute('cy', fromPos.y);
        }

        // Update endpoint markers
        const sourceDot = wire.element.querySelector('.wire-endpoint-source');
        if (sourceDot) {
          sourceDot.setAttribute('cx', fromPos.x);
          sourceDot.setAttribute('cy', fromPos.y);
        }
        const targetDot = wire.element.querySelector('.wire-endpoint-target');
        if (targetDot) {
          targetDot.setAttribute('cx', toPos.x);
          targetDot.setAttribute('cy', toPos.y);
        }

        wire.updateOccupiedCells(d);
      }
    }

    // Step 4: Nudge overlapping wires
    if (this._router.useNudging) {
      this._router.nudgeWires(this.wires);

      // Re-apply path points after nudging
      for (const wire of this.wires) {
        if (wire.element && wire.pathPoints.length >= 2 && !wire.isManualMode) {
          wire._applyPathPointsToSVG();
        }
      }
    }

    // Step 5: Update colors, crossings, junctions
    this.wires.forEach(wire => {
      const sourceComp = this.engine._findComponentByNode(wire.fromNode.nodeId);
      if (sourceComp) {
        const outNode = sourceComp.outputs.find(o => o.id === wire.fromNode.nodeId);
        if (outNode) wire.updateColor(outNode.value);
      }
    });

    this.updateWireCrossings();
    this._updateJunctions();
    this._updateTooltips();

    // Update spatial hash
    this._rebuildSpatialHash();

    // Mark grid for rebuild (wire positions changed)
    this._gridNeedsRebuild = true;
  }

  rerouteAllWires() {
    this._gridNeedsRebuild = true;
    this.rerouteWithFanOut();
    if (this.canvas?.toaster) {
      this.canvas.toaster.show('All wires rerouted (A*)', 'success');
    }
  }

  /* ================================================================
   *  Wire Creation (Interactive - from connector drag)
   * ================================================================ */

  startWiring(comp, nodeId, isOutput) {
    if (this.wiring) return;
    this.wiring = { fromComp: comp, fromNodeId: nodeId, fromIsOutput: isOutput };

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke', WIRE_DRAW_PREVIEW_COLOR);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('pointer-events', 'none');
    path.setAttribute('stroke-dasharray', '6,4');
    path.classList.add('wire-preview');

    const fromPos = this.positionCache.getPosition(nodeId);
    // Use Bézier path for preview
    if (WIRE_DEFAULT_ROUTING_MODE === 'bezier') {
      const fromDir = Wire.getPortDirection(nodeId);
      path.setAttribute('d', Wire.computeBezierPath(fromPos, fromPos, fromDir, { x: -1, y: 0 }));
    } else {
      path.setAttribute('d', Wire.computePath(fromPos, fromPos, {
        minClearY: this.core.getBusBarY(this._getComponents())
      }));
    }

    this.core.svgLayer.appendChild(path);
    this.wiring.tempPath = path;
  }

  computePreviewPath(fromPos, toPos) {
    // Use Bézier routing for preview when in Bézier mode
    if (WIRE_DEFAULT_ROUTING_MODE === 'bezier') {
      const sourceId = this.wiring?.fromNodeId;
      const fromDir = Wire.getPortDirection(sourceId);
      const toDir   = { x: -1, y: 0 }; // Preview target is typically an input pin
      return Wire.computeBezierPath(fromPos, toPos, fromDir, toDir);
    }

    const components = this._getComponents();
    const busY  = this.core.getBusBarY(components);
    const topY  = this.core.getTopClearY(components);
    const sourceId = this.wiring?.fromNodeId;
    // Channel map is now keyed by wire.id; for preview, find the best matching channel
    let channelX = undefined;
    if (this._lastChannelMap) {
      // Look for any wire originating from this source to find its channel
      for (const wire of this.wires) {
        if (wire.fromNode.nodeId === sourceId) {
          channelX = this._lastChannelMap.get(wire.id);
          break;
        }
      }
    }

    // Try A* routing for preview if grid is built
    if (this._router._gridBuilt) {
      try {
        const points = this._router.routeAStar(fromPos, toPos, {
          sourceNodeId: sourceId,
          channelX,
          busY,
          topY
        });
        const svgPath = Wire.pointsToSVGPath(points);
        if (svgPath) return svgPath;
      } catch (_) { /* fallback below */ }
    }

    // Fallback: Manhattan routing
    try {
      const points = this._router.routeManhattan(fromPos, toPos, {
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

    // Immediate update for Bézier (fast computation, no A* overhead)
    if (WIRE_DEFAULT_ROUTING_MODE === 'bezier') {
      const sourceId = this.wiring?.fromNodeId;
      const fromDir = Wire.getPortDirection(sourceId);
      return Wire.computeBezierPath(fromPos, toPos, fromDir, { x: -1, y: 0 });
    }

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
    // Also cancel manual drawing mode
    this.cancelManualDrawing();
  }

  completeConnection(fromNodeId, toNodeId) {
    const cmd = new ConnectWireCommand(this.engine, this.canvas, fromNodeId, toNodeId);
    return this.undoManager.execute(cmd);
  }

  /* ================================================================
   *  Manual Wire Drawing Mode (New)
   * ================================================================ */

  /**
   * Start manual wire drawing mode.
   * User clicks to add bend points, double-clicks to end.
   *
   * @param {{x:number,y:number}} startPos - Starting position
   * @param {string} sourceNodeId - Source node ID (or null for free drawing)
   * @param {boolean} isOutput - Whether source is an output pin
   */
  startManualDrawing(startPos, sourceNodeId = null, isOutput = true) {
    if (this._manualDrawing) return;

    this._manualDrawing = true;
    this._manualDrawSourceNodeId = sourceNodeId;
    this._manualDrawIsOutput = isOutput;
    this._manualDrawPoints = [{
      x: Math.round(startPos.x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(startPos.y / GRID_SIZE) * GRID_SIZE
    }];

    // Create preview path element
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke', WIRE_DRAW_PREVIEW_COLOR);
    path.setAttribute('stroke-width', '3');
    path.setAttribute('fill', 'none');
    path.setAttribute('pointer-events', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.classList.add('wire-manual-preview');

    // Add glow effect
    const glow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    glow.setAttribute('stroke', 'rgba(78, 201, 176, 0.3)');
    glow.setAttribute('stroke-width', '8');
    glow.setAttribute('fill', 'none');
    glow.setAttribute('pointer-events', 'none');
    glow.classList.add('wire-manual-glow');

    const d = `M ${this._manualDrawPoints[0].x} ${this._manualDrawPoints[0].y}`;
    path.setAttribute('d', d);
    glow.setAttribute('d', d);

    this.core.svgLayer.appendChild(glow);
    this.core.svgLayer.appendChild(path);
    this._manualDrawPreview = path;
    this._manualDrawGlow = glow;
  }

  /**
   * Add a bend point during manual wire drawing.
   * @param {{x:number,y:number}} pos
   */
  addManualDrawPoint(pos) {
    if (!this._manualDrawing) return;

    const snapped = {
      x: Math.round(pos.x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(pos.y / GRID_SIZE) * GRID_SIZE
    };

    // Don't add duplicate points
    const last = this._manualDrawPoints[this._manualDrawPoints.length - 1];
    if (last && Math.abs(snapped.x - last.x) < 1 && Math.abs(snapped.y - last.y) < 1) return;

    this._manualDrawPoints.push(snapped);
    this._updateManualDrawPreview(snapped);
  }

  /**
   * Update the preview path during manual drawing.
   * Shows an orthogonal line from the last point to the cursor.
   */
  updateManualDrawPreview(cursorPos) {
    if (!this._manualDrawing || !this._manualDrawPreview) return;

    const snapped = {
      x: Math.round(cursorPos.x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(cursorPos.y / GRID_SIZE) * GRID_SIZE
    };

    this._updateManualDrawPreview(snapped);
  }

  _updateManualDrawPreview(cursorPos) {
    if (!this._manualDrawPreview || this._manualDrawPoints.length === 0) return;

    // Build path from all points + cursor
    let d = `M ${this._manualDrawPoints[0].x} ${this._manualDrawPoints[0].y}`;
    for (let i = 1; i < this._manualDrawPoints.length; i++) {
      d += ` L ${this._manualDrawPoints[i].x} ${this._manualDrawPoints[i].y}`;
    }

    // Add orthogonal segments to cursor
    const last = this._manualDrawPoints[this._manualDrawPoints.length - 1];
    if (cursorPos) {
      // Simple orthogonal routing to cursor: go horizontal first, then vertical
      const dx = Math.abs(cursorPos.x - last.x);
      const dy = Math.abs(cursorPos.y - last.y);

      if (dx >= dy) {
        // Go horizontal first
        d += ` L ${cursorPos.x} ${last.y} L ${cursorPos.x} ${cursorPos.y}`;
      } else {
        // Go vertical first
        d += ` L ${last.x} ${cursorPos.y} L ${cursorPos.x} ${cursorPos.y}`;
      }
    }

    this._manualDrawPreview.setAttribute('d', d);
    if (this._manualDrawGlow) this._manualDrawGlow.setAttribute('d', d);
  }

  /**
   * Complete manual wire drawing by connecting to a target pin.
   * @param {string} targetNodeId - Target node ID (if connected to a pin)
   * @returns {boolean} Whether the connection was successful
   */
  completeManualDrawing(targetNodeId = null) {
    if (!this._manualDrawing) return false;

    // Remove preview elements
    if (this._manualDrawPreview) {
      this._manualDrawPreview.remove();
      this._manualDrawPreview = null;
    }
    if (this._manualDrawGlow) {
      this._manualDrawGlow.remove();
      this._manualDrawGlow = null;
    }

    // Need at least 2 points for a valid wire
    if (this._manualDrawPoints.length < 2) {
      this._manualDrawing = false;
      return false;
    }

    // Try to connect source and target
    let fromNodeId = this._manualDrawSourceNodeId;
    let toNodeId = targetNodeId;

    if (fromNodeId && toNodeId && fromNodeId !== toNodeId) {
      const success = this.completeConnection(fromNodeId, toNodeId);

      // If successful, set the new wire to manual mode with the drawn control points
      if (success) {
        const newWire = this.wires[this.wires.length - 1];
        if (newWire && this._manualDrawPoints.length > 2) {
          // Set control points from manual drawing (exclude endpoints)
          newWire.setRoutingMode(Wire.MODE_MANUAL);
          newWire.controlPoints = this._manualDrawPoints.slice(1, -1).map(p => ({ x: p.x, y: p.y }));
          newWire.pathPoints = [...this._manualDrawPoints];
          newWire._applyPathPointsToSVG();
        }
      }

      this._manualDrawing = false;
      this._manualDrawPoints = [];
      return success;
    }

    this._manualDrawing = false;
    this._manualDrawPoints = [];
    return false;
  }

  /**
   * Cancel manual wire drawing.
   */
  cancelManualDrawing() {
    if (!this._manualDrawing) return;

    if (this._manualDrawPreview) {
      this._manualDrawPreview.remove();
      this._manualDrawPreview = null;
    }
    if (this._manualDrawGlow) {
      this._manualDrawGlow.remove();
      this._manualDrawGlow = null;
    }

    this._manualDrawing = false;
    this._manualDrawPoints = [];
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

    this._detectIntermediateJunctions();
  }

  _clearIntermediateJunctions() {
    for (const wire of this.wires) {
      if (!wire.element) continue;
      wire.element.querySelectorAll('.wire-junction-intermediate').forEach(dot => dot.remove());
    }
  }

  _detectIntermediateJunctions() {
    this._clearIntermediateJunctions();

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

    for (const pt of intermediatePoints) {
      for (const wire of this.wires) {
        if (wire.id === pt.wireId) continue;
        if (!wire.pathPoints || wire.pathPoints.length < 2) continue;

        for (let i = 0; i < wire.pathPoints.length - 1; i++) {
          const p1 = wire.pathPoints[i];
          const p2 = wire.pathPoints[i + 1];

          const isOnSegment = this._isPointOnSegment(pt.x, pt.y, p1.x, p1.y, p2.x, p2.y);
          if (isOnSegment) {
            this._addJunctionDot(pt.x, pt.y, wire);
            break;
          }
        }
      }
    }
  }

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

  _addJunctionDot(x, y, wire) {
    if (!wire.element) return;

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
    this._gridNeedsRebuild = true;
    this.rerouteWithFanOut();
  }

  /* ─── Tooltip Updates ─── */

  _updateTooltips() {
    for (const wire of this.wires) {
      wire._updateTooltip();
    }
  }

  /* ─── Component list (injected by Canvas) ─── */

  /**
   * Set the component provider callback.
   * This is the proper injection point for Canvas to provide
   * its component list to the wiring subsystem.
   *
   * @param {Function} provider - () => Array<Component>
   */
  setComponentProvider(provider) {
    if (typeof provider !== 'function') {
      console.warn('CanvasWiring.setComponentProvider: provider must be a function');
      return;
    }
    this._componentProvider = provider;
  }

  /**
   * Get the current list of components from the canvas.
   * Uses the injected provider if available, otherwise returns empty array.
   *
   * @returns {Array<Component>}
   */
  _getComponents() {
    if (this._componentProvider) {
      return this._componentProvider();
    }
    // Fallback: try to get components from the engine
    if (this.engine && this.engine.components) {
      return Array.from(this.engine.components.values());
    }
    return [];
  }

  /* ================================================================
   *  Port Direction Helper
   * ================================================================ */

  /**
   * Get port direction vectors for a source-target pair.
   * Output pins have direction (1, 0) → wire exits going RIGHT
   * Input pins have direction (-1, 0) → wire arrives from the LEFT
   *
   * @param {string} sourceNodeId
   * @param {string} targetNodeId
   * @returns {{ fromDir: {x:number,y:number}, toDir: {x:number,y:number} }}
   */
  getPortDirections(sourceNodeId, targetNodeId) {
    return {
      fromDir: Wire.getPortDirection(sourceNodeId),
      toDir:   Wire.getPortDirection(targetNodeId)
    };
  }
}
