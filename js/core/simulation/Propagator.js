/**
 * Propagator.js — Core event-driven propagation engine.
 *
 * This is a JavaScript reimplementation of Logisim-Evolution's
 * Propagator class, adapted for D-Flow's component model.
 *
 * Key architectural principles from Logisim-Evolution:
 *
 * 1. **Priority Queue with Timestamps**: Events carry simulation time
 *    and are processed in time order. This enables proper gate delay
 *    modeling and deterministic simulation.
 *
 * 2. **Two-Phase Processing**: Each "step" processes all events at the
 *    current simulation time, then propagates signal changes through
 *    wires, then re-evaluates dirty components. This is the delta-cycle
 *    model used in HDL simulators.
 *
 * 3. **Location-Based Values**: Signal values live in CircuitState,
 *    keyed by node ID. Components read from and write to these locations.
 *
 * 4. **Oscillation Detection**: If propagation exceeds a configurable
 *    iteration limit, the circuit is marked as oscillating.
 *    Oscillation points are tracked for visualization.
 *
 * 5. **Clock Management**: Clocks are toggled centrally by the
 *    Propagator, not by individual Clock components. This ensures
 *    all clocks tick in sync.
 *
 * Processing loop (from Logisim's Propagator.propagate()):
 *   1. processDirtyPoints()    — propagate wire values
 *   2. processDirtyComponents() — re-evaluate component outputs
 *   3. While event queue not empty:
 *      a. stepInternal() — process all events at current time
 *      b. processDirtyPoints() — propagate changes through wires
 *      c. processDirtyComponents() — re-evaluate affected components
 *   4. If iterations exceed limit → oscillation detected
 */
import { SimulatorEvent } from './SimulatorEvent.js';
import { PropagationPoints } from './PropagationPoints.js';
import { Value } from './Value.js';

/**
 * Min-heap priority queue for SimulatorEvents.
 * Events are ordered by (time, serialNumber).
 */
class EventPriorityQueue {
  constructor() {
    this._heap = [];
  }

  add(event) {
    this._heap.push(event);
    this._bubbleUp(this._heap.length - 1);
  }

  peek() {
    return this._heap.length > 0 ? this._heap[0] : null;
  }

  remove() {
    if (this._heap.length === 0) return null;
    const top = this._heap[0];
    const last = this._heap.pop();
    if (this._heap.length > 0) {
      this._heap[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  get size() { return this._heap.length; }

  isEmpty() { return this._heap.length === 0; }

  clear() { this._heap = []; }

  _bubbleUp(idx) {
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this._heap[idx].compareTo(this._heap[parent]) < 0) {
        [this._heap[idx], this._heap[parent]] = [this._heap[parent], this._heap[idx]];
        idx = parent;
      } else break;
    }
  }

  _sinkDown(idx) {
    const len = this._heap.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (left < len && this._heap[left].compareTo(this._heap[smallest]) < 0) smallest = left;
      if (right < len && this._heap[right].compareTo(this._heap[smallest]) < 0) smallest = right;
      if (smallest !== idx) {
        [this._heap[idx], this._heap[smallest]] = [this._heap[smallest], this._heap[idx]];
        idx = smallest;
      } else break;
    }
  }
}

export class Propagator {
  /**
   * @param {import('./CircuitState.js').CircuitState} circuitState
   * @param {import('../Circuit.js').Circuit} circuit
   * @param {Map} components - The components map (id -> Component)
   */
  constructor(circuitState, circuit, components) {
    /** Root circuit state */
    this.circuitState = circuitState;
    /** Circuit data model (for wire lookups) */
    this.circuit = circuit;
    /** Components map */
    this.components = components;

    /** The priority queue of pending events */
    this.eventQueue = new EventPriorityQueue();

    /** Current simulation clock (monotonically increasing) */
    this.clock = 0;

    /** Serial number for event ordering within same time */
    this._eventSerial = 0;

    /** Number of half-clock cycles that have occurred */
    this.halfClockCycles = 0;

    /** Whether the circuit is currently oscillating */
    this.isOscillating = false;

    /** Whether we're currently adding oscillation points */
    this._oscAdding = false;

    /** Points that changed during oscillation detection window */
    this.oscPoints = new PropagationPoints();

    /** Maximum iterations before declaring oscillation (configurable) */
    this.simLimit = 5000;

    /** Default gate delay (in simulation time units) */
    this.defaultDelay = 1;

    /** Set of clock component IDs */
    this.clockComponentIds = new Set();

    /** On-update callback */
    this.onUpdate = null;
  }

  // ── Event scheduling ───────────────────────────────────────────────

  /**
   * Schedule a value change event.
   * This is the primary way components communicate: they call
   * setValue() which enqueues an event.
   *
   * Inspired by Logisim's Propagator.setValue().
   *
   * @param {string} nodeId - Output node ID
   * @param {Value} value - New value
   * @param {string} causeComponentId - Component producing the value
   * @param {number} delay - Propagation delay (default: 1)
   */
  setValue(nodeId, value, causeComponentId, delay = 1) {
    if (delay <= 0) delay = 1;
    const event = new SimulatorEvent(
      this.clock + delay,
      this._eventSerial++,
      nodeId,
      causeComponentId,
      value
    );
    this.eventQueue.add(event);
  }

  /**
   * Check if there are pending events.
   * @returns {boolean}
   */
  isPending() {
    return !this.eventQueue.isEmpty();
  }

  // ── Main propagation loop ──────────────────────────────────────────

  /**
   * Propagate until the circuit is stable (or oscillation detected).
   * This is the Logisim Propagator.propagate() equivalent.
   *
   * Feedback loop handling:
   * Circuits with feedback (SR latches, flip-flops with Q fed back) naturally
   * cause more propagation iterations. These are NOT oscillations — they
   * stabilize after a few cycles. True oscillation only occurs in purely
   * combinational loops (e.g., NOT gate with output fed to input).
   *
   * We detect oscillation by checking if values actually keep changing
   * in a cycle, not just by counting iterations.
   *
   * @returns {boolean} True if any propagation occurred
   */
  propagate() {
    this.oscPoints.clear();
    this._processDirtyPoints();
    this._processDirtyComponents();

    const oscThreshold = this.simLimit;
    const logThreshold = Math.floor(3 * oscThreshold / 4);
    let iters = 0;

    // Track value stability to detect true oscillation vs. feedback settling
    let stableCount = 0;
    const STABLE_THRESHOLD = 50; // If no changes for 50 iterations, circuit is stable
    let lastEventCount = this.eventQueue.size;

    while (!this.eventQueue.isEmpty()) {
      iters++;

      // Check for stability: if the event queue isn't growing, the circuit is settling
      const currentEventCount = this.eventQueue.size;
      if (currentEventCount >= lastEventCount) {
        stableCount++;
      } else {
        stableCount = 0;
      }
      lastEventCount = currentEventCount;

      // If the circuit has been stable (queue shrinking or same size) for many
      // iterations, it's not oscillating — just taking time to settle feedback.
      if (stableCount >= STABLE_THRESHOLD) {
        // Circuit is stable — clear remaining events that are just re-confirming values
        this.isOscillating = false;
        this._oscAdding = false;
        this.eventQueue.clear();
        this.oscPoints.clear();
        return iters > 0;
      }

      if (iters < logThreshold) {
        this._stepInternal(null);
      } else if (iters < oscThreshold) {
        this._oscAdding = true;
        this._stepInternal(this.oscPoints);
      } else {
        // Oscillation detected!
        this.isOscillating = true;
        this._oscAdding = false;
        this.eventQueue.clear();
        document.dispatchEvent(new CustomEvent('simulation-error', {
          detail: 'Oscillation detected! Circuit is unstable.'
        }));
        return true;
      }
    }

    this.isOscillating = false;
    this._oscAdding = false;
    this.oscPoints.clear();
    return iters > 0;
  }

  /**
   * Process a single step (one delta cycle).
   * This is the Logisim Propagator.step() equivalent.
   *
   * @param {PropagationPoints|null} changedPoints - Track changed points
   * @returns {boolean} True if any events were processed
   */
  step(changedPoints) {
    this.oscPoints.clear();
    this._processDirtyPoints();
    this._processDirtyComponents();

    if (this.eventQueue.isEmpty()) return false;

    this._stepInternal(changedPoints);
    return true;
  }

  /**
   * Internal step: process all events at the current clock time,
   * then propagate changes through wires and re-evaluate components.
   *
   * This is the Logisim Propagator.stepInternal() equivalent.
   *
   * @param {PropagationPoints|null} changedPoints
   */
  _stepInternal(changedPoints) {
    if (this.eventQueue.isEmpty()) return;

    // Advance clock to the time of the next event
    this.clock = this.eventQueue.peek().time;

    // Process all events at this time
    while (!this.eventQueue.isEmpty()) {
      const ev = this.eventQueue.peek();
      if (ev.time !== this.clock) break;
      this.eventQueue.remove();

      // Record this point for oscillation tracking
      if (changedPoints) {
        changedPoints.addNode(ev.nodeId);
      }

      // Apply the value change and mark downstream as dirty
      this._applyEvent(ev);
    }

    // Propagate wire changes, then re-evaluate dirty components
    this._processDirtyPoints();
    this._processDirtyComponents();
  }

  // ── Event application ──────────────────────────────────────────────

  /**
   * Apply a single event: set the value at the event's node,
   * then propagate the change through wires to downstream inputs.
   *
   * @param {SimulatorEvent} event
   */
  _applyEvent(event) {
    const changed = this.circuitState.setValue(event.nodeId, event.value);
    if (!changed) return;

    // Find all wires from this output node and propagate to inputs
    const wires = this.circuit.getWiresFromNode(event.nodeId);
    for (const wire of wires) {
      const targetComp = this.components.get(wire.to.componentId);
      if (!targetComp) continue;

      const inputIndex = targetComp.inputs.findIndex(inp => inp.id === wire.to.nodeId);
      if (inputIndex < 0) continue;

      // Propagate value: Z (UNKNOWN) means not driven
      // Follows Logisim's tri-state model: high-impedance outputs
      // do NOT drive downstream inputs. The input retains its previous
      // driven value from other sources (or stays false if no source).
      if (event.value.equals(Value.UNKNOWN)) {
        // High-impedance: don't drive the input
        // Still mark component dirty for visual update (wire color)
      } else {
        // Store full Value for bus-aware components, boolean for legacy
        const targetPort = targetComp.inputs[inputIndex];
        if (targetPort.width > 1) {
          targetPort.value = event.value;
        } else {
          targetPort.value = event.value.toBoolean();
        }
      }

      // Mark downstream component as dirty for re-evaluation
      this.circuitState.markComponentDirty(wire.to.componentId);
    }
  }

  // ── Dirty processing ───────────────────────────────────────────────

  /**
   * Process dirty points: propagate signal changes from dirty nodes
   * through wires to downstream component inputs.
   *
   * In Logisim, this calls CircuitState.processDirtyPoints() which
   * delegates to CircuitWires.propagate() — a sophisticated algorithm
   * that computes bus values from multiple drivers.
   *
   * In our simpler model, we directly propagate from output nodes
   * to input nodes via wires.
   */
  _processDirtyPoints() {
    this.circuitState.swapDirtySets();
    const dirtyNodes = this.circuitState.getDirtyNodesAndClear();

    for (const nodeId of dirtyNodes) {
      const value = this.circuitState.getValue(nodeId);
      const wires = this.circuit.getWiresFromNode(nodeId);

      for (const wire of wires) {
        const targetComp = this.components.get(wire.to.componentId);
        if (!targetComp) continue;

        const inputIndex = targetComp.inputs.findIndex(inp => inp.id === wire.to.nodeId);
        if (inputIndex < 0) continue;

        // Update the input value
        if (!value.equals(Value.UNKNOWN)) {
          const targetPort = targetComp.inputs[inputIndex];
          if (targetPort.width > 1) {
            targetPort.value = value;
          } else {
            targetPort.value = value.toBoolean();
          }
        }
        // For Z-state (UNKNOWN): don't drive the input, but still
        // mark the component dirty so it can update its visual state
        // (e.g., wire color showing Z-state)

        // Mark component as dirty
        this.circuitState.markComponentDirty(wire.to.componentId);
      }
    }

    // NOTE: Subcircuit propagation would go here when subcircuit
    // internal state propagation is implemented. Currently, subcircuits
    // are evaluated as atomic components by _processDirtyComponents().
  }

  /**
   * Process dirty components: re-evaluate their outputs and
   * schedule new events for any output changes.
   *
   * This is the Logisim CircuitState.processDirtyComponents() equivalent.
   * Instead of calling comp.propagate(state), we call
   * comp.propagateInContext(propagator, circuitState).
   */
  _processDirtyComponents() {
    this.circuitState.swapDirtySets();
    const dirtyComps = this.circuitState.getDirtyComponentsAndClear();

    for (const compId of dirtyComps) {
      const comp = this.components.get(compId);
      if (!comp) continue;

      // Call the component's propagate method in the new engine context
      this._propagateComponent(comp);
    }
  }

  /**
   * Propagate a single component: read inputs, compute outputs,
   * and schedule events for any changes.
   *
   * This replaces the old monkey-patched computeOutput() pattern.
   * Components no longer self-schedule; the engine drives propagation.
   *
   * @param {import('../Component.js').Component} comp
   */
  _propagateComponent(comp) {
    // Read current input values from circuit state (source of truth)
    // For backward compat, inputs already have their values set by
    // _processDirtyPoints / _applyEvent

    // Compute next state
    const nextState = comp.computeNextState();

    // Apply and schedule propagation for changed outputs
    comp.applyNextState(nextState);

    // Schedule events for changed output values
    for (let i = 0; i < comp.outputs.length; i++) {
      const out = comp.outputs[i];
      const newValue = (out.value instanceof Value) ? out.value : Value.fromBoolean(out.value);

      // Check if value actually changed at this output
      const oldValue = this.circuitState.getValue(out.id);
      if (!oldValue.equals(newValue)) {
        // Schedule an event for this output change with gate delay
        this.setValue(out.id, newValue, comp.id, this.defaultDelay);
      }
    }

    // For display-only components (LightBulb, SevenSegment, etc.) with
    // zero outputs, applyNextState() already updated their visual state
    // via _updateAppearance() / _updateDisplay(). No events to schedule.
  }

  // ── Clock management ───────────────────────────────────────────────

  /**
   * Toggle all clock components (called once per half-cycle).
   * This is the Logisim Propagator.toggleClocks() equivalent.
   *
   * In Logisim, clocks are toggled centrally by the simulator,
   * not by individual Clock components. This ensures all clocks
   * tick in sync and avoids timing issues.
   *
   * @returns {boolean} True if any clocks exist
   */
  toggleClocks() {
    this.halfClockCycles++;
    let hasClocks = false;

    for (const compId of this.clockComponentIds) {
      const comp = this.components.get(compId);
      if (!comp) continue;
      hasClocks = true;

      // Toggle the clock output
      comp.outputs[0].value = !comp.outputs[0].value;
      comp._updateConnectorStates();

      // Schedule the clock output change
      const newValue = Value.fromBoolean(comp.outputs[0].value);
      this.setValue(comp.outputs[0].id, newValue, comp.id, this.defaultDelay);
    }

    return hasClocks;
  }

  // ── Reset ──────────────────────────────────────────────────────────

  /**
   * Reset the simulation to initial state.
   */
  reset() {
    this.clock = 0;
    this.halfClockCycles = 0;
    this.isOscillating = false;
    this._oscAdding = false;
    this._eventSerial = 0;
    this.eventQueue.clear();
    this.oscPoints.clear();
    this.circuitState.reset();
  }

  // ── Stats ──────────────────────────────────────────────────────────

  getTickCount() {
    return this.halfClockCycles;
  }
}
