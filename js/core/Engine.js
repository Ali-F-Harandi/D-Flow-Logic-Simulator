export class Engine {
  constructor() {
    this.components = new Map();
    this.wires = [];
    this.queue = new Set();
    this.running = false;
    this.speed = 200; // ms per step (default)
    this.intervalId = null;
    this.onUpdate = null;
    this.clocks = new Set();  // track clock components
  }

  addComponent(component) {
    this.components.set(component.id, component);
    if (component.type === 'Clock') {
      this.clocks.add(component);
    }
    const origCompute = component.computeOutput.bind(component);
    component.computeOutput = () => {
      origCompute();
      this.schedulePropagation(component);
    };
  }

  removeComponent(compId) {
    const comp = this.components.get(compId);
    if (!comp) return;
    if (comp.type === 'Clock') {
      comp.stop();
      this.clocks.delete(comp);
    }
    const wiresToRemove = this.wires.filter(w =>
      w.from.componentId === compId || w.to.componentId === compId
    );
    wiresToRemove.forEach(w => this.disconnect(w.id));
    this.components.delete(compId);
  }

  connect(fromNodeId, toNodeId, forceWireId = null) {
    const fromComp = this._findComponentByNode(fromNodeId);
    const toComp = this._findComponentByNode(toNodeId);
    if (!fromComp || !toComp) throw new Error('Node not found');
    const toInput = toComp.inputs.find(inp => inp.id === toNodeId);
    if (!toInput) throw new Error('Input node not found');
    if (toInput.connectedTo) {
      console.warn(`Input ${toNodeId} already connected. Overwriting previous connection.`);
    }
    toInput.connectedTo = { componentId: fromComp.id, nodeId: fromNodeId };
    const wireId = forceWireId || `wire_${Date.now()}_${Math.random()}`;
    const wire = { id: wireId, from: { componentId: fromComp.id, nodeId: fromNodeId },
                  to: { componentId: toComp.id, nodeId: toNodeId } };
    this.wires.push(wire);
    this._propagateFrom(fromComp);
    return wireId;
  }

  disconnect(wireId) {
    const index = this.wires.findIndex(w => w.id === wireId);
    if (index === -1) return false;
    const wire = this.wires[index];
    const toComp = this.components.get(wire.to.componentId);
    if (toComp) {
      const input = toComp.inputs.find(inp => inp.id === wire.to.nodeId);
      if (input) input.connectedTo = null;
    }
    this.wires.splice(index, 1);
    return true;
  }

  schedulePropagation(component) {
    this.queue.add(component);
    if (!this.running) this._processQueue();
  }

  _processQueue() {
    const maxIterations = 10000;
    let iterations = 0;
    while (this.queue.size > 0 && iterations < maxIterations) {
      const comp = this.queue.values().next().value;
      this.queue.delete(comp);
      for (const out of comp.outputs) {
        const connectedWires = this.wires.filter(w => w.from.nodeId === out.id);
        for (const w of connectedWires) {
          const targetComp = this.components.get(w.to.componentId);
          if (targetComp) {
            const inputIndex = targetComp.inputs.findIndex(inp => inp.id === w.to.nodeId);
            if (inputIndex >= 0) {
              targetComp.setInputValue(inputIndex, out.value);
            }
          }
        }
      }
      iterations++;
    }
    if (iterations >= maxIterations) {
      console.warn('Propagation loop detected – circuit may be unstable.');
      this.queue.clear();
      // Dispatch a custom event on the document for UI feedback
      document.dispatchEvent(new CustomEvent('simulation-error', {
        detail: 'Infinite Loop Detected! Circuit Unstable.'
      }));
    }
    if (this.onUpdate) this.onUpdate();
  }

  step() {
    this._processQueue();
  }

  run() {
    if (this.running) return;
    this.running = true;
    for (const clk of this.clocks) {
      clk.start();
    }
    this.intervalId = setInterval(() => this.step(), this.speed);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.intervalId);
    this.intervalId = null;
    for (const clk of this.clocks) {
      clk.stop();
    }
  }

  reset() {
    this.stop();
    this.queue.clear();
    for (const comp of this.components.values()) {
      comp.outputs.forEach(o => o.value = false);
      comp.inputs.forEach(i => i.value = false);
    }
    if (this.onUpdate) this.onUpdate();
  }

  setSpeed(ms) {
    this.speed = ms;
    if (this.running) {
      this.stop();
      this.run();
    }
  }

  _findComponentByNode(nodeId) {
    for (const comp of this.components.values()) {
      if (comp.inputs.some(i => i.id === nodeId) || comp.outputs.some(o => o.id === nodeId))
        return comp;
    }
    return null;
  }

  _propagateFrom(comp) {
    this.queue.add(comp);
    this._processQueue();
  }
}