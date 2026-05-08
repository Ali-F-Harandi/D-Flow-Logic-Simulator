import { Circuit } from './Circuit.js';

export class Engine {
  constructor() {
    this.circuit = new Circuit();
    this.queue = new Set();
    this.running = false;
    this.speed = 200;
    this.intervalId = null;
    this.onUpdate = null;
    this.clocks = new Set();
    this._processing = false;
    this._nodeIndex = new Map();
  }

  get components() {
    return this.circuit.components;
  }
  get wires() {
    return this.circuit.wires;
  }

  addComponent(component) {
    this.circuit.addComponent(component);
    this._indexComponent(component);
    if (component.type === 'Clock') {
      this.clocks.add(component);
    }
    if (!component.isWrapped) {
      const origCompute = component.computeOutput.bind(component);
      component.computeOutput = () => {
        origCompute();
        this.schedulePropagation(component);
      };
      component.isWrapped = true;
    }
  }

  _indexComponent(comp) {
    comp.inputs.forEach(inp => this._nodeIndex.set(inp.id, comp));
    comp.outputs.forEach(out => this._nodeIndex.set(out.id, comp));
  }

  removeComponent(compId) {
    const comp = this.components.get(compId);
    if (!comp) return;
    // Un-index the component's nodes before removal
    comp.inputs.forEach(inp => this._nodeIndex.delete(inp.id));
    comp.outputs.forEach(out => this._nodeIndex.delete(out.id));
    if (comp.type === 'Clock') {
      comp.stop();
      this.clocks.delete(comp);
    }
    const wiresToRemove = this.wires.filter(w =>
      w.from.componentId === compId || w.to.componentId === compId
    );
    wiresToRemove.forEach(w => this.disconnect(w.id));
    this.circuit.removeComponent(compId);
  }

  connect(fromNodeId, toNodeId, forceWireId = null) {
    const fromComp = this._findComponentByNode(fromNodeId);
    const toComp = this._findComponentByNode(toNodeId);
    if (!fromComp || !toComp) throw new Error('Node not found');

    if (fromComp.id === toComp.id) {
      document.dispatchEvent(new CustomEvent('simulation-error', { detail: 'Cannot connect a component to itself!' }));
      return null;
    }

    const toInput = toComp.inputs.find(inp => inp.id === toNodeId);
    if (!toInput) throw new Error('Input node not found');
    const fromOutput = fromComp.outputs.find(o => o.id === fromNodeId);
    if (!fromOutput) throw new Error('From node is not an output');

    if (toInput.connectedTo) {
      const oldWireIndex = this.wires.findIndex(w => w.to.nodeId === toNodeId);
      if (oldWireIndex !== -1) {
        const oldWire = this.wires[oldWireIndex];
        this.circuit.removeWire(oldWire.id);
        document.dispatchEvent(new CustomEvent('wire-removed', { detail: { wireId: oldWire.id } }));
      }
    }

    toInput.connectedTo = { componentId: fromComp.id, nodeId: fromNodeId };
    const wireId = forceWireId || `wire_${Date.now()}_${Math.random()}`;
    const wire = {
      id: wireId,
      from: { componentId: fromComp.id, nodeId: fromNodeId },
      to: { componentId: toComp.id, nodeId: toNodeId }
    };
    this.circuit.addWire(wire);
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
      if (input) {
        input.connectedTo = null;
        // FIX (critical): Reset the disconnected input's value to false (LOW)
        input.value = false;
      }
    }
    this.circuit.removeWire(wireId);
    // FIX (critical): Re-evaluate the affected component
    if (toComp) {
      this._propagateFrom(toComp);
    }
    return true;
  }

  schedulePropagation(component) {
    this.queue.add(component);
    if (!this.running && !this._processing) this._processQueue();
  }

  _processQueue() {
    this._processing = true;
    const maxIterations = 10000;
    let iterations = 0;

    while (this.queue.size > 0 && iterations < maxIterations) {
      const updates = [];
      for (const comp of this.queue) {
        const nextState = comp.computeNextState();
        updates.push({ comp, nextState });
      }
      this.queue.clear();

      for (const { comp, nextState } of updates) {
        comp.applyNextState(nextState);
        for (let i = 0; i < comp.outputs.length; i++) {
          const out = comp.outputs[i];
          const connectedWires = this.wires.filter(w => w.from.nodeId === out.id);
          for (const w of connectedWires) {
            const targetComp = this.components.get(w.to.componentId);
            if (targetComp) {
              const inputIndex = targetComp.inputs.findIndex(inp => inp.id === w.to.nodeId);
              if (inputIndex >= 0) {
                targetComp.inputs[inputIndex].value = out.value;
                this.queue.add(targetComp);
              }
            }
          }
        }
      }
      iterations++;
    }

    this._processing = false;

    if (iterations >= maxIterations) {
      console.warn('Propagation loop detected – circuit may be unstable.');
      this.queue.clear();
      document.dispatchEvent(new CustomEvent('simulation-error', { detail: 'Infinite Loop Detected! Circuit Unstable.' }));
    }

    if (this.onUpdate) this.onUpdate();
  }

  step() {
    this._processQueue();
  }

  run() {
    if (this.running) return;
    this.running = true;
    for (const clk of this.clocks) clk.start();
    this.intervalId = setInterval(() => this.step(), this.speed);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.intervalId);
    this.intervalId = null;
    for (const clk of this.clocks) clk.stop();
  }

  reset() {
    this.stop();
    this.queue.clear();
    for (const comp of this.components.values()) {
      comp.reset();
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
    return this._nodeIndex.get(nodeId) || null;
  }

  _propagateFrom(comp) {
    this.queue.add(comp);
    if (!this._processing) this._processQueue();
  }

  loadCircuit(circuit) {
    this.stop();
    this.circuit = circuit;
    this.clocks.clear();
    // Rebuild node index
    this._nodeIndex.clear();
    for (const comp of this.components.values()) {
      this._indexComponent(comp);
      if (comp.type === 'Clock') this.clocks.add(comp);
      if (!comp.isWrapped) {
        const origCompute = comp.computeOutput.bind(comp);
        comp.computeOutput = () => {
          origCompute();
          this.schedulePropagation(comp);
        };
        comp.isWrapped = true;
      }
    }
    this.reset();
    this.step();
    if (this.onUpdate) this.onUpdate();
  }
}
