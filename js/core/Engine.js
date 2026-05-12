/**
 * Engine.js — Simulation engine orchestrator.
 *
 * Redesigned based on Logisim-Evolution's Simulator + Propagator architecture.
 *
 * Key architectural changes from the old engine:
 *
 * 1. **Delegation to Propagator**: The heavy lifting of event scheduling,
 *    timestamped propagation, and oscillation detection is now handled by
 *    the Propagator class. Engine is the high-level orchestrator.
 *
 * 2. **CircuitState for signal values**: Signal values are now stored in
 *    a CircuitState object (keyed by node ID), not directly on component
 *    input/output objects. Components still have local .value properties
 *    for backward compatibility, but CircuitState is the source of truth.
 *
 * 3. **Centralized clock management**: Clocks are toggled by the Propagator,
 *    not by individual Clock components running setInterval. This ensures
 *    synchronous ticking and eliminates timing race conditions.
 *
 * 4. **Logisim-style simulation modes**:
 *    - Auto-propagate: Run until stable after each change
 *    - Single-step: Process one delta cycle at a time
 *    - Auto-tick: Automatically toggle clocks at configured frequency
 *
 * 5. **No more monkey-patching**: Components no longer have their
 *    computeOutput() wrapped. The engine explicitly calls components
 *    to propagate via the Propagator's dirty component processing.
 */
import { Circuit } from './Circuit.js';
import { CircuitState } from './simulation/CircuitState.js';
import { Propagator } from './simulation/Propagator.js';
import { Value } from './simulation/Value.js';
import { PropagationPoints } from './simulation/PropagationPoints.js';

export class Engine {
  constructor() {
    /** @type {Circuit} Circuit data model */
    this.circuit = new Circuit();

    /** @type {CircuitState} Simulation state */
    this.circuitState = new CircuitState(this.circuit);

    /** @type {Propagator} The propagation engine */
    this.propagator = new Propagator(this.circuitState, this.circuit, this.circuit.components);

    /** @type {boolean} Whether the simulation is running (auto-ticking) */
    this.running = false;

    /** @type {number} Simulation speed in ms per tick */
    this.speed = 200;

    /** @type {number|null} setInterval ID for auto-tick */
    this.intervalId = null;

    /** @type {Function|null} Callback after each propagation cycle */
    this.onUpdate = null;

    /** @type {Set<Component>} Set of clock components (for backward compat) */
    this.clocks = new Set();

    /** @type {Map<string, Component>} Node ID → Component index */
    this._nodeIndex = new Map();

    /** @type {number} Step counter */
    this._stepCount = 0;

    /** @type {boolean} Whether oscillation was detected */
    this._oscillationDetected = false;

    /** @type {boolean} Whether auto-propagation is enabled */
    this.autoPropagating = true;

    /** @type {boolean} Whether auto-ticking is enabled */
    this.autoTicking = false;

    /** @type {PropagationPoints} Points for single-step visualization */
    this.stepPoints = new PropagationPoints();

    /** @type {Set<string>} Component IDs currently in oscillation error */
    this._oscillationComponents = new Set();
  }

  get components() {
    return this.circuit.components;
  }
  get wires() {
    return this.circuit.wires;
  }

  // ── Component management ───────────────────────────────────────────

  addComponent(component) {
    this.circuit.addComponent(component);
    this._indexComponent(component);

    // Register clock with propagator
    if (component.type === 'Clock') {
      this.clocks.add(component);
      this.propagator.clockComponentIds.add(component.id);
    }

    // Store engine reference (needed by GateBase.setProperty for wire cleanup)
    component._engine = this;

    // Wrap computeOutput() for backward compat with UI toggles etc.
    // In the new Logisim-style engine, the wrapper simply marks the
    // component as dirty and lets the Propagator handle evaluation.
    // This avoids double-evaluation (origCompute + Propagator both
    // calling computeNextState/applyNextState).
    if (!component.isWrapped) {
      component.computeOutput = () => {
        // Mark dirty and let Propagator evaluate + propagate changes.
        // Input components (ToggleSwitch, Clock, etc.) already set their
        // output values before calling computeOutput(), so the Propagator
        // will detect the change vs CircuitState and schedule events.
        this.schedulePropagation(component);
        return component.outputs;
      };
      component.isWrapped = true;
    }

    // Initialize signal values in CircuitState for all nodes
    for (const inp of component.inputs) {
      const initValue = inp.width > 1 ? Value.createUnknown(inp.width) : Value.fromBoolean(inp.value);
      this.circuitState.setValue(inp.id, initValue);
    }
    for (const out of component.outputs) {
      const initValue = out.width > 1 ? Value.createKnown(out.width, 0) : Value.fromBoolean(out.value);
      this.circuitState.setValue(out.id, initValue);
    }

    // Mark the new component as dirty so it gets evaluated
    this.circuitState.markComponentDirty(component.id);
  }

  _indexComponent(comp) {
    comp.inputs.forEach(inp => this._nodeIndex.set(inp.id, comp));
    comp.outputs.forEach(out => this._nodeIndex.set(out.id, comp));
  }

  removeComponent(compId) {
    const comp = this.components.get(compId);
    if (!comp) return;

    // Un-index
    comp.inputs.forEach(inp => this._nodeIndex.delete(inp.id));
    comp.outputs.forEach(out => this._nodeIndex.delete(out.id));

    if (comp.type === 'Clock') {
      comp.stop();
      this.clocks.delete(comp);
      this.propagator.clockComponentIds.delete(compId);
    }

    // Remove connected wires
    const wiresToRemove = this.wires.filter(w =>
      w.from.componentId === compId || w.to.componentId === compId
    );
    wiresToRemove.forEach(w => this.disconnect(w.id));

    // Clean up circuit state
    comp.inputs.forEach(inp => this.circuitState.values.delete(inp.id));
    comp.outputs.forEach(out => this.circuitState.values.delete(out.id));
    this.circuitState.componentData.delete(compId);

    this.circuit.removeComponent(compId);
  }

  // ── Wire management ────────────────────────────────────────────────

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

    // Width validation
    if (fromOutput.width !== toInput.width) {
      document.dispatchEvent(new CustomEvent('simulation-error', {
        detail: `Width mismatch: output is ${fromOutput.width}-bit, input is ${toInput.width}-bit`
      }));
      return null;
    }

    // Disconnect existing wire to this input
    if (toInput.connectedTo) {
      const oldWire = this.circuit.getWireByToNode(toNodeId);
      if (oldWire) {
        this.circuit.removeWire(oldWire.id);
        document.dispatchEvent(new CustomEvent('wire-removed', { detail: { wireId: oldWire.id } }));
      }
    }

    // Create new wire
    toInput.connectedTo = { componentId: fromComp.id, nodeId: fromNodeId };
    const wireId = forceWireId || `wire_${Date.now()}_${Math.random()}`;
    const wire = {
      id: wireId,
      from: { componentId: fromComp.id, nodeId: fromNodeId },
      to: { componentId: toComp.id, nodeId: toNodeId }
    };
    this.circuit.addWire(wire);

    // Propagate the current output value through the new wire to the input
    const sourceValue = this.circuitState.getValue(fromNodeId);
    if (sourceValue && !sourceValue.equals(Value.UNKNOWN)) {
      if (toInput.width > 1) {
        toInput.value = sourceValue;
      } else {
        toInput.value = sourceValue.toBoolean();
      }
      this.circuitState.setValue(toNodeId, sourceValue);
      this.circuitState.markComponentDirty(toComp.id);
    }

    // Propagate signal through the new wire
    this._propagateFrom(fromComp);
    return wireId;
  }

  disconnect(wireId) {
    const wire = this.circuit.getWireById(wireId);
    if (!wire) return false;
    const toComp = this.components.get(wire.to.componentId);
    if (toComp) {
      const input = toComp.inputs.find(inp => inp.id === wire.to.nodeId);
      if (input) {
        input.connectedTo = null;
        // Use proper value type based on port width
        input.value = input.width > 1 ? Value.createUnknown(input.width) : false;
      }
    }
    this.circuit.removeWire(wireId);

    // Clear the input's value in CircuitState with correct width
    const toInput = toComp ? toComp.inputs.find(inp => inp.id === wire.to.nodeId) : null;
    const resetValue = (toInput && toInput.width > 1) ? Value.createUnknown(toInput.width) : Value.FALSE;
    this.circuitState.setValue(wire.to.nodeId, resetValue);

    if (toComp) {
      this._propagateFrom(toComp);
    }
    return true;
  }

  // ── Propagation ────────────────────────────────────────────────────

  /**
   * Schedule a component for propagation.
   * This replaces the old Set-based queue with the Propagator's
   * event-driven approach.
   *
   * @param {Component} component
   */
  schedulePropagation(component) {
    // Mark the component as dirty in CircuitState
    this.circuitState.markComponentDirty(component.id);

    // If not running, process immediately
    if (!this.running && !this.propagator.isPending()) {
      this._runPropagationCycle();
    }
  }

  /**
   * Run a full propagation cycle: propagate until stable.
   * This is the Logisim Simulator.loop() equivalent for
   * auto-propagation mode.
   */
  _runPropagationCycle() {
    // Process any dirty components first (initial evaluation)
    this._evaluateDirtyComponents();

    // Then run the propagator's event-driven loop
    const didPropagate = this.propagator.propagate();

    if (this.propagator.isOscillating) {
      this._oscillationDetected = true;
      this._markOscillationErrors();
    } else {
      this._oscillationDetected = false;
      this._clearOscillationErrors();
    }

    // Sync component output values back from CircuitState
    this._syncComponentValues();

    // Dispatch simulation-step event for panels and listeners
    document.dispatchEvent(new CustomEvent('simulation-step'));

    if (this.onUpdate) this.onUpdate();
  }

  /**
   * Evaluate dirty components: compute their outputs and schedule
   * propagation events for any changed outputs.
   */
  _evaluateDirtyComponents() {
    this.circuitState.swapDirtySets();
    const dirtyComps = this.circuitState.getDirtyComponentsAndClear();

    for (const compId of dirtyComps) {
      const comp = this.components.get(compId);
      if (!comp) continue;
      this._propagateComponent(comp);
    }
  }

  /**
   * Propagate a single component and schedule output events.
   * Handles null (Z-state) values from TriState buffers by mapping
   * them to Value.UNKNOWN in the multi-valued logic system.
   * @param {Component} comp
   */
  _propagateComponent(comp) {
    const nextState = comp.computeNextState();
    comp.applyNextState(nextState);

    // Schedule propagation events for changed outputs
    for (let i = 0; i < comp.outputs.length; i++) {
      const out = comp.outputs[i];
      // Map JS values to Value objects:
      //   true  → Value.TRUE
      //   false → Value.FALSE
      //   null  → Value.UNKNOWN (high-impedance / Z-state)
      const newValue = (out.value instanceof Value) ? out.value : Value.fromBoolean(out.value);
      const oldValue = this.circuitState.getValue(out.id);

      if (!oldValue.equals(newValue)) {
        this.propagator.setValue(out.id, newValue, comp.id, this.propagator.defaultDelay);
      }
    }
  }

  /**
   * Sync component output values from CircuitState back to
   * component objects (for backward compatibility with UI rendering).
   * Also updates display components (LEDs, 7-segment, etc.) whose
   * visual state depends on input values.
   */
  _syncComponentValues() {
    for (const comp of this.components.values()) {
      // Sync output values from CircuitState
      for (const out of comp.outputs) {
        const stateVal = this.circuitState.getValue(out.id);
        if (out.width > 1) {
          // For bus ports, store the full Value object
          if (out.value !== stateVal) {
            out.value = stateVal;
          }
        } else {
          const boolVal = stateVal.toBoolean();
          if (boolVal !== null && out.value !== boolVal) {
            out.value = boolVal;
          }
        }
      }
      comp._updateConnectorStates();
      // Update display components whose visuals depend on input values
      // (e.g., LightBulb LED color, SevenSegment display, LogicProbe indicator)
      if (typeof comp._updateAppearance === 'function') comp._updateAppearance();
      if (typeof comp._updateDisplay === 'function') comp._updateDisplay();
    }
  }

  /**
   * Propagate from a specific component (e.g., after connection change).
   * @param {Component} comp
   */
  _propagateFrom(comp) {
    this.circuitState.markComponentDirty(comp.id);
    this._runPropagationCycle();
  }

  // ── Oscillation handling ───────────────────────────────────────────

  _markOscillationErrors() {
    // Only mark components that own nodes in the oscillation points set.
    // The Propagator tracks which nodes changed during the oscillation
    // detection window (last 25% of iterations before threshold).
    // Only those nodes are actually part of the oscillation loop.
    const oscNodeIds = this.propagator.oscPoints?.changedNodes;
    if (!oscNodeIds || oscNodeIds.size === 0) {
      // Fallback: if no specific oscillation points were tracked,
      // don't mark anything — it's better to miss an oscillation
      // than to flag every connected component as broken.
      return;
    }

    for (const nodeId of oscNodeIds) {
      const comp = this._nodeIndex.get(nodeId);
      if (comp) {
        comp.setErrorState(true);
        this._oscillationComponents.add(comp.id);
      }
    }
  }

  _clearOscillationErrors() {
    for (const compId of this._oscillationComponents) {
      const comp = this.components.get(compId);
      if (comp) comp.setErrorState(false);
    }
    this._oscillationComponents.clear();
  }

  // ── Simulation modes ───────────────────────────────────────────────

  /**
   * Perform a single simulation step.
   * In Logisim, "step" means process one delta cycle (all events
   * at the current simulation time).
   */
  step() {
    this._stepCount++;
    this._runPropagationCycle();
  }

  /**
   * Perform a single delta cycle step (Logisim single-step mode).
   * Processes only the events at the next simulation time.
   * @returns {boolean} True if any events were processed
   */
  singleStep() {
    this.stepPoints.clear();

    // Toggle clocks if auto-ticking and circuit is stable
    if (this.autoTicking && !this.propagator.isPending()) {
      this.propagator.toggleClocks();
    }

    const didStep = this.propagator.step(this.stepPoints);
    if (didStep) {
      this._stepCount++;
      this._syncComponentValues();
      if (this.onUpdate) this.onUpdate();
    }
    return didStep;
  }

  /**
   * Start continuous simulation (auto-tick mode).
   * In Logisim, this starts the SimThread which periodically
   * toggles clocks and propagates.
   */
  run() {
    if (this.running) return;
    this.running = true;
    this._oscillationDetected = false;
    this.autoTicking = true;

    // Use centralized clock ticking instead of individual Clock.setInterval
    this.intervalId = setInterval(() => {
      this._tick();
    }, this.speed);
  }

  /**
   * Perform one simulation tick: toggle clocks, then propagate.
   * This is what the SimThread.loop() does in Logisim.
   */
  _tick() {
    // Toggle all clocks (centralized, like Logisim)
    this.propagator.toggleClocks();

    // Propagate until stable
    this._runPropagationCycle();

    this._stepCount++;
  }

  /**
   * Stop the simulation.
   */
  stop() {
    if (!this.running) return;
    this.running = false;
    this.autoTicking = false;
    clearInterval(this.intervalId);
    this.intervalId = null;
    // Stop individual clocks (for backward compat if they were started)
    for (const clk of this.clocks) clk.stop();
  }

  /**
   * Reset the simulation to initial state.
   */
  reset() {
    this.stop();

    this._stepCount = 0;
    this._oscillationDetected = false;
    this._oscillationComponents.clear();

    // Dispatch simulation-reset event for TimingDiagramPanel
    document.dispatchEvent(new CustomEvent('simulation-reset'));

    // Reset the propagator (clears event queue, clock, etc.)
    this.propagator.reset();

    // Reset all components (preserving user-set input values)
    for (const comp of this.components.values()) {
      comp.resetState();
      comp.setErrorState(false);
    }

    // Re-initialize CircuitState values from component outputs
    this.circuitState.values.clear();
    this.circuitState.dirtyNodes.clear();
    this.circuitState.dirtyComponents.clear();

    for (const comp of this.components.values()) {
      for (const inp of comp.inputs) {
        const initValue = inp.width > 1 ? Value.createUnknown(inp.width) : Value.fromBoolean(inp.value);
        this.circuitState.setValue(inp.id, initValue);
      }
      for (const out of comp.outputs) {
        const initValue = out.width > 1 ? Value.createKnown(out.width, 0) : Value.fromBoolean(out.value);
        this.circuitState.setValue(out.id, initValue);
      }
    }

    // Re-propagate from all components to restore consistent state
    for (const comp of this.components.values()) {
      this.circuitState.markComponentDirty(comp.id);
    }
    this._runPropagationCycle();

    if (this.onUpdate) this.onUpdate();
  }

  /**
   * Set the simulation speed (ms per tick).
   * @param {number} ms
   */
  setSpeed(ms) {
    this.speed = ms;
    if (this.running) {
      this.stop();
      this.run();
    }
  }

  // ── Utility ────────────────────────────────────────────────────────

  _findComponentByNode(nodeId) {
    return this._nodeIndex.get(nodeId) || null;
  }

  reindexComponent(comp) {
    for (const [nodeId, c] of this._nodeIndex) {
      if (c === comp) this._nodeIndex.delete(nodeId);
    }
    this._indexComponent(comp);
  }

  /**
   * Get simulation statistics.
   */
  getStats() {
    return {
      componentCount: this.components.size,
      wireCount: this.wires.length,
      stepCount: this._stepCount,
      isRunning: this.running,
      oscillationDetected: this._oscillationDetected,
      simTime: this.propagator.clock,
      pendingEvents: this.propagator.eventQueue.size,
      halfClockCycles: this.propagator.halfClockCycles
    };
  }

  /**
   * Load a circuit from serialized data.
   * @param {Circuit} circuit
   */
  loadCircuit(circuit) {
    this.stop();
    this.circuit = circuit;
    this.clocks.clear();

    // Rebuild propagator and circuit state
    this.circuitState = new CircuitState(circuit);
    this.propagator = new Propagator(this.circuitState, circuit, circuit.components);

    // Rebuild node index
    this._nodeIndex.clear();
    for (const comp of this.components.values()) {
      this._indexComponent(comp);
      comp._engine = this;
      if (comp.type === 'Clock') {
        this.clocks.add(comp);
        this.propagator.clockComponentIds.add(comp.id);
      }
      // Keep backward compat wrapping (same pattern as addComponent)
      if (!comp.isWrapped) {
        comp.computeOutput = () => {
          this.schedulePropagation(comp);
          return comp.outputs;
        };
        comp.isWrapped = true;
      }
    }

    this.reset();
    this.step();
    if (this.onUpdate) this.onUpdate();
  }

  /**
   * Nudge: re-propagate if something changed (like Logisim's nudge).
   * Called when the user modifies the circuit while running.
   */
  nudge() {
    if (this.autoPropagating) {
      this._runPropagationCycle();
    }
  }
}
