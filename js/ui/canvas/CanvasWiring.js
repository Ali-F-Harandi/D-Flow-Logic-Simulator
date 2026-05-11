/**
 * CanvasWiring.js — Wire Lifecycle Manager (Bézier-First)
 *
 * Orchestrates wire creation, removal, and visual updates.
 * All wires use Bézier routing by default — smooth cubic curves
 * based on port direction vectors. This is the only routing mode
 * that works well for this project.
 *
 * Simplified from the original A-star/Manhattan/Manual routing system
 * which was full of bugs. Only Bézier is used now.
 */

import { Wire } from '../../core/Wire.js';
import { SpatialHash } from '../../utils/SpatialHash.js';
import { generateId } from '../../utils/IdGenerator.js';
import { ConnectWireCommand, DisconnectWireCommand } from '../../utils/UndoManager.js';
import {
  GRID_SIZE, WIRE_DRAW_PREVIEW_COLOR, WIRE_PIN_MAGNET_RADIUS, SPATIAL_HASH_CELL_SIZE
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

    // Throttle for preview (50 ms)
    this._previewThrottleTimer    = null;
    this._previewThrottleInterval = 50;

    // Stable wire routing mode
    this._stableMode = true;
    this.autoRerouteOnDrop = true;

    // Wire edit handler
    this._wireEditHandler = null;

    // ─── Spatial Hash ───
    this._spatialHash = new SpatialHash({ cellSize: SPATIAL_HASH_CELL_SIZE });
  }

  getWires() { return this.wires; }

  /**
   * Component lookup function for facing-aware port directions.
   * @param {string} nodeId
   * @returns {Component|null}
   */
  _compLookupByNode(nodeId) {
    return this.engine._findComponentByNode(nodeId);
  }

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
  get isManualDrawing()  { return false; } // Manual drawing removed
  get spatialHash()      { return this._spatialHash; }

  setWireEditHandler(handler) { this._wireEditHandler = handler; }

  /* ─── Legacy compat: obstacle cache ─── */

  getObstacleCache() {
    return { componentGrid: new Map(), rebuildComponentGrid(){}, version: 0 };
  }

  rebuildObstacleCache() {}
  updateObstacleCacheForComponent() {}

  /* ─── Router accessor (kept for compatibility) ─── */

  _getRouter() {
    return null; // No router needed — Bézier doesn't use A*
  }

  /* ─── Spatial Hash Rebuild ─── */

  _rebuildSpatialHash() {
    this._spatialHash.clear();

    for (const comp of this._getComponents()) {
      this._spatialHash.insertComponent(comp);

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
    wire.setCompLookup((nodeId) => this._compLookupByNode(nodeId));
    this._renderWire(wire);
    this.wires.push(wire);
    this._updateJunctions();

    this.eventBus.emit('wire-connected', { engineId, fromNodeId, toNodeId });
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

      this.eventBus.emit('wire-removed', { engineId });
    }
  }

  reconnectWire(engineId, fromNodeId, toNodeId) {
    this.addVisualWire(engineId, fromNodeId, toNodeId);
  }

  /* ─── Component-aware wire updates ─── */

  updateWiresForComponent(comp) {
    const prefix = comp.id + '.';

    // Fast: just update endpoints for Bézier (no pathfinding needed)
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
  }

  /* ─── Redraw scheduling ─── */

  performRedraw(components, forceReroute = false) {
    if (forceReroute) {
      this.rerouteAllWires();
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
   *  Main Routing: rerouteAllWires (Bézier-only)
   * ================================================================ */

  /**
   * Recompute all wire paths. Since all wires use Bézier mode,
   * this just recomputes the Bézier curves for each wire.
   */
  rerouteAllWires() {
    const getPosition = (nodeId) => this.positionCache.getPosition(nodeId);

    for (const wire of this.wires) {
      if (wire.isLocked) continue;

      // Ensure Bézier mode
      if (wire.routingMode !== Wire.MODE_BEZIER) {
        wire.routingMode = Wire.MODE_BEZIER;
        wire.controlPoints = [];
        wire.isAutoRouted = true;
        wire._routedMethod = 'bezier';
        wire._isRoutingFallback = false;
        const visualPath = wire.element?.querySelector('.wire-visual');
        if (visualPath) visualPath.classList.remove('routing-fallback');
      }

      const fromPos = getPosition(wire.sourceNode.nodeId);
      const toPos   = getPosition(wire.targetNode.nodeId);
      if (!fromPos || !toPos) continue;

      const sourceId = wire.sourceNode.nodeId;
      const targetId = wire.targetNode.nodeId;
      const fromDir = Wire.getPortDirection(sourceId, (id) => this._compLookupByNode(id));
      const toDir   = Wire.getPortDirection(targetId, (id) => this._compLookupByNode(id));

      // Compute Bézier path
      const d = Wire.computeBezierPath(fromPos, toPos, fromDir, toDir);

      // Store pathPoints for Bézier
      const dist = Math.hypot(toPos.x - fromPos.x, toPos.y - fromPos.y);
      const controlDist = Math.max(40, Math.min(200, dist * 0.5));
      wire.pathPoints = [
        { x: fromPos.x, y: fromPos.y },
        { x: fromPos.x + fromDir.x * controlDist, y: fromPos.y + fromDir.y * controlDist },
        { x: toPos.x + toDir.x * controlDist, y: toPos.y + toDir.y * controlDist },
        { x: toPos.x, y: toPos.y }
      ];

      if (wire.element) {
        wire.element.querySelector('.wire-visual').setAttribute('d', d);
        wire.element.querySelector('.wire-hitarea').setAttribute('d', d);

        const glowPath = wire.element.querySelector('.wire-glow');
        if (glowPath) glowPath.setAttribute('d', d);

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

    // Update colors
    this.wires.forEach(wire => {
      const sourceComp = this.engine._findComponentByNode(wire.fromNode.nodeId);
      if (sourceComp) {
        const outNode = sourceComp.outputs.find(o => o.id === wire.fromNode.nodeId);
        if (outNode) wire.updateColor(outNode.value);
      }
    });

    this._updateJunctions();

    // Update spatial hash
    this._rebuildSpatialHash();

    if (this.canvas?.toaster) {
      this.canvas.toaster.show('All wires rerouted', 'success');
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
    const fromDir = Wire.getPortDirection(nodeId, (id) => this._compLookupByNode(id));
    path.setAttribute('d', Wire.computeBezierPath(fromPos, fromPos, fromDir, { x: -1, y: 0 }));

    this.core.svgLayer.appendChild(path);
    this.wiring.tempPath = path;
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
      null // No router needed for Bézier
    );
  }

  /* ─── Junctions ─── */

  _updateJunctions() {
    // For Bézier-only mode, junction dots are hidden — they're a Manhattan
    // convention (indicating T-connections at wire overlaps) and don't
    // make sense for smooth curves.
    this.wires.forEach(w => {
      w.hideJunction();
    });

    this._clearIntermediateJunctions();
  }

  _clearIntermediateJunctions() {
    for (const wire of this.wires) {
      if (!wire.element) continue;
      wire.element.querySelectorAll('.wire-junction-intermediate').forEach(dot => dot.remove());
    }
  }

  _detectIntermediateJunctions() {
    // Not needed for Bézier-only mode
    this._clearIntermediateJunctions();
  }

  /* ─── Wire Crossings ─── */

  updateWireCrossings() {
    // Not needed for Bézier-only mode — crossing detection only
    // works with orthogonal (Manhattan) wires.
  }

  setCrossingStyle(style) {
    // No-op for Bézier-only mode
  }

  get crossingDetector() { return null; }

  /* ─── Reroute for a specific component ─── */

  rerouteWiresForComponent(comp) {
    this.updateWiresForComponent(comp);
  }

  /**
   * Legacy compat: rerouteWithFanOut() — now just recomputes Bézier paths.
   * Called from UndoManager and CanvasDrag after component changes.
   */
  rerouteWithFanOut() {
    this.rerouteAllWires();
  }

  /* ─── Component list (injected by Canvas) ─── */

  setComponentProvider(provider) {
    if (typeof provider !== 'function') {
      console.warn('CanvasWiring.setComponentProvider: provider must be a function');
      return;
    }
    this._componentProvider = provider;
  }

  _getComponents() {
    if (this._componentProvider) {
      return this._componentProvider();
    }
    if (this.engine && this.engine.components) {
      return Array.from(this.engine.components.values());
    }
    return [];
  }

  /* ================================================================
   *  Port Direction Helper
   * ================================================================ */

  getPortDirections(sourceNodeId, targetNodeId) {
    const lookup = (id) => this._compLookupByNode(id);
    return {
      fromDir: Wire.getPortDirection(sourceNodeId, lookup),
      toDir:   Wire.getPortDirection(targetNodeId, lookup)
    };
  }
}
