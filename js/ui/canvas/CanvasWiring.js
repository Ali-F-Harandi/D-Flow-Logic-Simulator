import { Wire } from '../../core/Wire.js';
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
  }

  getWires() { return this.wires; }

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
      this.wires = this.wires.filter(w => w.engineId !== engineId);
      this._updateJunctions();
    }
  }

  reconnectWire(engineId, fromNodeId, toNodeId) {
    this.addVisualWire(engineId, fromNodeId, toNodeId);
  }

  updateWiresForComponent(comp) {
    const prefix = comp.id + '.';
    const busY = this.core.getBusBarY(this._getComponents());
    this.wires.forEach(wire => {
      if (wire.fromNode.nodeId.startsWith(prefix) || wire.toNode.nodeId.startsWith(prefix)) {
        wire.updatePath((nodeId) => this.positionCache.getPosition(nodeId), busY);
      }
    });
  }

  performRedraw(components) {
    const busY = this.core.getBusBarY(components);
    this.wires.forEach(wire => {
      wire.updatePath((nodeId) => this.positionCache.getPosition(nodeId), busY);
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

  cancelWiring() {
    if (this.wiring) {
      if (this.wiring.tempPath) this.wiring.tempPath.remove();
      this.wiring = null;
    }
  }

  completeConnection(fromNodeId, toNodeId) {
    const cmd = new ConnectWireCommand(this.engine, this.canvas, fromNodeId, toNodeId);
    return this.undoManager.execute(cmd);
  }

  _renderWire(wire) {
    wire.render(
      this.core.svgLayer,
      (nodeId) => this.positionCache.getPosition(nodeId),
      this.core.getBusBarY(this._getComponents())
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