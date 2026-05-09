import { Wire } from '../../core/Wire.js';
import { AStarRouter, ObstacleCache } from '../../core/AStarRouter.js';
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
  }

  getWires() { return this.wires; }

  /**
   * Get the obstacle cache instance.
   */
  getObstacleCache() { return this._obstacleCache; }

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
  }

  removeVisualWireByEngineId(engineId) {
    const wire = this.wires.find(w => w.engineId === engineId);
    if (wire) {
      if (wire.element) wire.element.remove();
      wire.occupiedCells.clear();
      this.wires = this.wires.filter(w => w.engineId !== engineId);
      this._updateJunctions();
    }
  }

  reconnectWire(engineId, fromNodeId, toNodeId) {
    this.addVisualWire(engineId, fromNodeId, toNodeId);
  }

  updateWiresForComponent(comp) {
    const prefix = comp.id + '.';
    const components = this._getComponents();
    const busY = this.core.getBusBarY(components);
    const topY = this.core.getTopClearY(components);
    const router = this._getRouter();
    this.wires.forEach(wire => {
      if (wire.fromNode.nodeId.startsWith(prefix) || wire.toNode.nodeId.startsWith(prefix)) {
        wire.updatePath((nodeId) => this.positionCache.getPosition(nodeId), busY, router);
      }
    });
  }

  performRedraw(components) {
    const busY = this.core.getBusBarY(components);
    const topY = this.core.getTopClearY(components);

    // Rebuild obstacle cache before redrawing all wires
    this._obstacleCache.rebuildComponentGrid(components);

    const router = this._getRouter();
    this.wires.forEach(wire => {
      wire.updatePath((nodeId) => this.positionCache.getPosition(nodeId), busY, router);
      const sourceComp = this.engine._findComponentByNode(wire.fromNode.nodeId);
      if (sourceComp) {
        const outNode = sourceComp.outputs.find(o => o.id === wire.fromNode.nodeId);
        if (outNode) wire.updateColor(outNode.value);
      }
    });
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

  _getComponents() { return []; }   // injected by Canvas
}
