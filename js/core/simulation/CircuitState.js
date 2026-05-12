/**
 * CircuitState.js — Manages the simulation state of a circuit.
 *
 * Inspired by Logisim-Evolution's CircuitState class, this holds:
 *   - Signal values at each node (location)
 *   - Dirty lists: nodes and components that need re-evaluation
 *   - Component state data (flip-flop internal state, RAM contents, etc.)
 *   - Substate hierarchy for subcircuits
 *
 * Key design principles from Logisim:
 *   1. Values are stored at NODE LOCATIONS, not in component objects.
 *      Components read from and write to these locations.
 *   2. Dirty points / dirty components are tracked separately.
 *      processDirtyPoints() propagates signal changes through wires.
 *      processDirtyComponents() re-evaluates component outputs.
 *   3. Component-specific state is stored in a separate map,
 *      keyed by component ID.
 */
import { Value } from './Value.js';

export class CircuitState {
  /**
   * @param {import('../Circuit.js').Circuit} circuit - The circuit data model
   */
  constructor(circuit) {
    this.circuit = circuit;

    /**
     * Current signal values at each node, keyed by node ID.
     * This is the single source of truth for all signal values.
     * @type {Map<string, Value>}
     */
    this.values = new Map();

    /**
     * Component-specific state data (e.g., flip-flop Q values, RAM contents).
     * @type {Map<string, Object>}
     */
    this.componentData = new Map();

    /**
     * Dirty nodes — nodes whose values have changed and need to be
     * propagated through wires to downstream components.
     * @type {Set<string>}
     */
    this.dirtyNodes = new Set();

    /**
     * Dirty components — components whose inputs have changed and
     * need to re-evaluate their outputs.
     * @type {Set<string>} component IDs
     */
    this.dirtyComponents = new Set();

    /**
     * Dirty nodes working set (swapped with dirtyNodes during processing).
     * @type {Set<string>}
     */
    this._dirtyNodesWorking = new Set();

    /**
     * Dirty components working set.
     * @type {Set<string>}
     */
    this._dirtyComponentsWorking = new Set();

    /**
     * Whether this state is for a subcircuit.
     * @type {boolean}
     */
    this.isSubstate = false;

    /**
     * Parent CircuitState (for subcircuits).
     * @type {CircuitState|null}
     */
    this.parentState = null;

    /**
     * Parent component ID (the Subcircuit component in parent).
     * @type {string|null}
     */
    this.parentComponentId = null;

    /**
     * Child substates for hierarchical subcircuits.
     * @type {Map<string, CircuitState>}
     */
    this.substates = new Map();
  }

  // ── Value access ───────────────────────────────────────────────────

  /**
   * Get the current value at a node.
   * Returns UNKNOWN if the node has never been driven.
   * @param {string} nodeId
   * @returns {Value}
   */
  getValue(nodeId) {
    const v = this.values.get(nodeId);
    return v !== undefined ? v : Value.UNKNOWN;
  }

  /**
   * Get value as a JS boolean (backward compat).
   * @param {string} nodeId
   * @returns {boolean|null}
   */
  getValueAsBoolean(nodeId) {
    return this.getValue(nodeId).toBoolean();
  }

  /**
   * Set the value at a node.
   * @param {string} nodeId
   * @param {Value} value
   * @returns {boolean} True if the value actually changed
   */
  setValue(nodeId, value) {
    const old = this.values.get(nodeId);
    if (old !== undefined && old.equals(value)) return false;
    this.values.set(nodeId, value);
    this.dirtyNodes.add(nodeId);
    return true;
  }

  // ── Component data ─────────────────────────────────────────────────

  /**
   * Get state data for a component.
   * @param {string} componentId
   * @returns {Object|undefined}
   */
  getData(componentId) {
    return this.componentData.get(componentId);
  }

  /**
   * Set state data for a component.
   * @param {string} componentId
   * @param {Object} data
   */
  setData(componentId, data) {
    this.componentData.set(componentId, data);
  }

  // ── Dirty tracking ─────────────────────────────────────────────────

  /**
   * Mark a component as needing re-evaluation.
   * @param {string} componentId
   */
  markComponentDirty(componentId) {
    this.dirtyComponents.add(componentId);
  }

  /**
   * Mark a node as having a changed value.
   * @param {string} nodeId
   */
  markNodeDirty(nodeId) {
    this.dirtyNodes.add(nodeId);
  }

  /**
   * Mark all components as dirty (used after reset or circuit load).
   */
  markAllComponentsDirty() {
    if (this.circuit && this.circuit.components) {
      for (const [id] of this.circuit.components) {
        this.dirtyComponents.add(id);
      }
    }
  }

  /**
   * Swap dirty sets to working sets (for thread-safe processing).
   * This is the Logisim pattern: swap then process, so new dirty items
   * go into the fresh dirty set during processing.
   */
  swapDirtySets() {
    // Swap nodes
    const tmpNodes = this.dirtyNodes;
    this.dirtyNodes = this._dirtyNodesWorking;
    this._dirtyNodesWorking = tmpNodes;

    // Swap components
    const tmpComps = this.dirtyComponents;
    this.dirtyComponents = this._dirtyComponentsWorking;
    this._dirtyComponentsWorking = tmpComps;
  }

  /**
   * Get and clear the working set of dirty nodes.
   * @returns {Set<string>}
   */
  getDirtyNodesAndClear() {
    const result = this._dirtyNodesWorking;
    this._dirtyNodesWorking = new Set();
    return result;
  }

  /**
   * Get and clear the working set of dirty components.
   * @returns {Set<string>}
   */
  getDirtyComponentsAndClear() {
    const result = this._dirtyComponentsWorking;
    this._dirtyComponentsWorking = new Set();
    return result;
  }

  // ── Reset ──────────────────────────────────────────────────────────

  /**
   * Reset all signal values and component data.
   */
  reset() {
    this.values.clear();
    this.componentData.clear();
    this.dirtyNodes.clear();
    this.dirtyComponents.clear();
    this._dirtyNodesWorking.clear();
    this._dirtyComponentsWorking.clear();
    // Reset substates
    for (const substate of this.substates.values()) {
      substate.reset();
    }
  }

  // ── Subcircuit support ─────────────────────────────────────────────

  /**
   * Create a substate for a subcircuit component.
   * @param {string} componentId - The subcircuit component ID
   * @param {import('../Circuit.js').Circuit} innerCircuit
   * @returns {CircuitState}
   */
  createSubstate(componentId, innerCircuit) {
    const substate = new CircuitState(innerCircuit);
    substate.isSubstate = true;
    substate.parentState = this;
    substate.parentComponentId = componentId;
    this.substates.set(componentId, substate);
    this.componentData.set(componentId, substate);
    return substate;
  }

  /**
   * Get substate for a subcircuit component.
   * @param {string} componentId
   * @returns {CircuitState|undefined}
   */
  getSubstate(componentId) {
    return this.substates.get(componentId);
  }

  /**
   * Remove a substate when a subcircuit is deleted.
   * @param {string} componentId
   */
  removeSubstate(componentId) {
    const sub = this.substates.get(componentId);
    if (sub) {
      sub.reset();
      sub.parentState = null;
      sub.parentComponentId = null;
    }
    this.substates.delete(componentId);
    this.componentData.delete(componentId);
  }
}
