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
    this._stepCount = 0;
    this._oscillationDetected = false;
    this._lastStateHash = null;
    this._repeatCount = 0;
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
    // FIX (Bug #6): Store engine reference so GateBase.setProperty()
    // can disconnect orphan wires when reducing input count.
    component._engine = this;
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
    if (!fromComp || !toComp) {
      console.warn(`Engine.connect: Node not found (from=${fromNodeId}, to=${toNodeId})`);
      return null;
    }

    if (fromComp.id === toComp.id) {
      document.dispatchEvent(new CustomEvent('simulation-error', { detail: 'Cannot connect a component to itself!' }));
      return null;
    }

    const toInput = toComp.inputs.find(inp => inp.id === toNodeId);
    if (!toInput) {
      console.warn(`Engine.connect: Input node not found (${toNodeId})`);
      return null;
    }
    const fromOutput = fromComp.outputs.find(o => o.id === fromNodeId);
    if (!fromOutput) {
      console.warn(`Engine.connect: From node is not an output (${fromNodeId})`);
      return null;
    }

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
                // Z state (null) propagation: when a tri-state buffer outputs Z,
                // the downstream input should NOT be driven. It retains its
                // previous value from other sources (or stays false if no
                // other source drives it). Only non-null values propagate.
                if (out.value !== null) {
                  targetComp.inputs[inputIndex].value = out.value;
                }
                // Always queue the target for re-evaluation since
                // the wire color needs updating even for Z state
                this.queue.add(targetComp);
              }
            }
          }
        }
      }
      iterations++;
    }

    if (iterations >= maxIterations) {
      console.warn('Propagation loop detected – circuit may be unstable.');
      this.queue.clear();
      this._oscillationDetected = true;
      document.dispatchEvent(new CustomEvent('simulation-error', { detail: 'Infinite Loop Detected! Circuit Unstable.' }));
      // Set error state on all components involved in the loop
      for (const comp of this.components.values()) {
        if (this._isInOscillation(comp)) {
          comp.setErrorState(true);
        }
      }
    }

    this._processing = false;

    if (this.onUpdate) this.onUpdate();
  }

  step() {
    this._stepCount++;
    this._processQueue();
  }

  /**
   * Check if a component is likely involved in an oscillation loop
   * by checking if it has both inputs and outputs connected to
   * components that also changed state in recent iterations.
   */
  _isInOscillation(comp) {
    const hasConnectedInput = comp.inputs.some(inp => inp.connectedTo);
    const hasConnectedOutput = comp.outputs.some(out => {
      return this.wires.some(w => w.from.nodeId === out.id);
    });
    return hasConnectedInput && hasConnectedOutput;
  }

  /**
   * Get simulation statistics for the footer display.
   */
  getStats() {
    return {
      componentCount: this.components.size,
      wireCount: this.wires.length,
      stepCount: this._stepCount,
      isRunning: this.running,
      oscillationDetected: this._oscillationDetected
    };
  }

  run() {
    if (this.running) return;
    this.running = true;
    this._oscillationDetected = false;
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
    this._stepCount = 0;
    this._oscillationDetected = false;
    // FIX (Bug #5 Medium): Use resetState() which preserves user-set
    // input values (DipSwitch positions, Clock states) while still
    // resetting sequential component internal state (flip-flop _state,
    // _prevClk). Input components override resetState() as a no-op.
    for (const comp of this.components.values()) {
      comp.resetState();
      comp.setErrorState(false); // Clear error states on reset
    }
    // FIX: Re-propagate from all components to restore consistent state.
    // After reset, input components may still output HIGH but downstream
    // gates had their inputs cleared. This re-propagates signals so wire
    // colors and component states match the actual logic.
    for (const comp of this.components.values()) {
      this.queue.add(comp);
    }
    this._processQueue();
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

  /**
   * Re-index a component's nodes in the _nodeIndex.
   * Must be called after setProperty() rebuilds the inputs/outputs arrays
   * so that wire connections and signal propagation work with the new node IDs.
   * @param {Component} comp
   */
  reindexComponent(comp) {
    // Remove ALL old entries that point to this component
    for (const [nodeId, c] of this._nodeIndex) {
      if (c === comp) this._nodeIndex.delete(nodeId);
    }
    // Re-add current inputs and outputs
    this._indexComponent(comp);
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
      comp._engine = this;  // CRITICAL: Set engine reference for setProperty
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
