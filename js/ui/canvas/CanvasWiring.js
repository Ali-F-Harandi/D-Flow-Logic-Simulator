/**
 * CanvasWiring.js — Wire Lifecycle Manager (Segment-by-Segment)
 *
 * Orchestrates wire creation, removal, and visual updates.
 * All wires use Bézier routing by default — smooth cubic curves
 * based on port direction vectors. Users can add waypoints by
 * clicking on wires; segments between co-axial waypoints are
 * rendered as straight lines (enabling manual Manhattan routing).
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

    this.autoRerouteOnDrop = false;

    // Wire edit handler
    this._wireEditHandler = null;

    // ─── Spatial Hash ───
    this._spatialHash = new SpatialHash({ cellSize: SPATIAL_HASH_CELL_SIZE });
  }

  getWires() { return this.wires; }

  /**
   * Component lookup function for facing-aware port directions.
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

  get stableMode()       { return true; }
  set stableMode(val)    { /* no-op */ }
  get isManualDrawing()  { return false; }
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
    return null;
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
    const wire = new Wire(visualId, { nodeId: fromNodeId }, { nodeId: toNodeId });
    wire.engineId = engineId;
    wire.setCompLookup((nodeId) => this._compLookupByNode(nodeId));

    // Set wire width from the source port
    const sourceComp = this.engine._findComponentByNode(fromNodeId);
    if (sourceComp) {
      const outNode = sourceComp.outputs.find(o => o.id === fromNodeId);
      if (outNode && outNode.width > 1) {
        wire.setWidth(outNode.width);
      }
    }

    this._renderWire(wire);
    this.wires.push(wire);
    this._updateJunctions();

    this.eventBus.emit('wire-connected', { engineId, fromNodeId, toNodeId });

    // Update minimap when wire is added
    if (this.canvas?.miniMap) this.canvas.miniMap.scheduleUpdate();
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

      // Update minimap when wire is removed
      if (this.canvas?.miniMap) this.canvas.miniMap.scheduleUpdate();
    }
  }

  reconnectWire(engineId, fromNodeId, toNodeId) {
    this.addVisualWire(engineId, fromNodeId, toNodeId);
  }

  /* ─── Component-aware wire updates ─── */

  updateWiresForComponent(comp) {
    const prefix = comp.id + '.';

    this.wires.forEach(wire => {
      if (wire.fromNode.nodeId.startsWith(prefix) || wire.toNode.nodeId.startsWith(prefix)) {
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
   *  Main Routing: rerouteAllWires
   * ================================================================ */

  /**
   * Recompute all wire paths. Since all wires use segment-by-segment
   * rendering, this just recomputes the paths for each wire.
   */
  rerouteAllWires() {
    const getPosition = (nodeId) => this.positionCache.getPosition(nodeId);

    for (const wire of this.wires) {
      const fromPos = getPosition(wire.sourceNode.nodeId);
      const toPos   = getPosition(wire.targetNode.nodeId);
      if (!fromPos || !toPos) continue;

      // Clear waypoints on full reroute (reset to automatic Bézier)
      wire.waypoints = [];
      wire._sourcePos = { ...fromPos };
      wire._targetPos = { ...toPos };
      wire._recomputeAndApply();
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
    // Validate width compatibility before connecting
    const fromComp = this.engine._findComponentByNode(fromNodeId);
    const toComp = this.engine._findComponentByNode(toNodeId);
    if (fromComp && toComp) {
      const fromOutput = fromComp.outputs.find(o => o.id === fromNodeId);
      const toInput = toComp.inputs.find(i => i.id === toNodeId);
      if (fromOutput && toInput && fromOutput.width !== toInput.width) {
        // Visual flash on the target connector to indicate width mismatch
        const targetConnector = document.querySelector(`.connector[data-node="${toNodeId}"]`);
        if (targetConnector) {
          targetConnector.classList.add('width-mismatch');
          setTimeout(() => targetConnector.classList.remove('width-mismatch'), 1500);
        }

        document.dispatchEvent(new CustomEvent('simulation-error', {
          detail: `Width mismatch: output is ${fromOutput.width}-bit, input is ${toInput.width}-bit`
        }));
        return null;
      }
    }

    const cmd = new ConnectWireCommand(this.engine, this.canvas, fromNodeId, toNodeId);
    return this.undoManager.execute(cmd);
  }

  /* ─── Internal: render a single wire ─── */

  _renderWire(wire) {
    wire.render(
      this.core.svgLayer,
      (nodeId) => this.positionCache.getPosition(nodeId),
      this.core.getBusBarY(this._getComponents()),
      null
    );
  }

  /* ─── Junctions ─── */

  _updateJunctions() {
    // Junction dots are hidden for Bézier-style wires
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

  /* ─── Wire Crossings ─── */

  updateWireCrossings() {
    this._clearIntermediateJunctions();
  }

  setCrossingStyle(style) { /* no-op */ }
  get crossingDetector() { return null; }

  /* ─── Reroute for a specific component ─── */

  rerouteWiresForComponent(comp) {
    this.updateWiresForComponent(comp);
  }

  /**
   * Legacy compat: rerouteWithFanOut() — now just recomputes paths.
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
