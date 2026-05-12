import { Component } from './Component.js';
import { ComponentRenderer } from './ComponentRenderer.js';
import { Value } from './simulation/Value.js';

/**
 * Shared base for all logic gates.
 * Subclasses must implement _computeGateLogic() and provide
 * static label. They can also override getProperties() / setProperty().
 *
 * Bus-aware: When bitWidth > 1, the gate operates on multi-bit Value
 * objects using bitwise operations. When bitWidth = 1 (default),
 * legacy boolean behavior is preserved exactly.
 */
export class GateBase extends Component {

  constructor(id, type, inputsCount = 2, outputsCount = 1) {
    super(id, type, inputsCount, outputsCount);
    // Feature 4: Per-input inversion bitmask
    // Bit i set means input i is inverted (active-low)
    this.negatedInputs = 0;
    // bitWidth is inherited from Component (default 1)
  }

  /**
   * @param {HTMLElement} container – DOM element where the gate will be appended
   * @param {string} bodyText – label displayed inside the gate (e.g. 'AND')
   */
  render(container, bodyText = 'GATE') {
    const extraClasses = [`gate`, `${this.type.toLowerCase()}-gate`];
    // Add bus indicator class when bitWidth > 1
    if (this.bitWidth > 1) {
      extraClasses.push('bus-gate');
    }
    ComponentRenderer.renderLabeledBox(this, container, {
      labelText: this.bitWidth > 1 ? `${bodyText}/${this.bitWidth}` : bodyText,
      extraClasses
    });
  }

  /* ================================================================
   *  Feature 4: Per-Input Pin Inversion
   * ================================================================ */

  /**
   * Toggle the inversion state of a specific input pin.
   * @param {number} inputIndex
   */
  toggleInputInversion(inputIndex) {
    if (inputIndex < 0 || inputIndex >= this.inputs.length) return;
    this.negatedInputs ^= (1 << inputIndex);
    // Re-render to show/hide inversion bubble
    this.rerender();
    // Re-evaluate outputs since input inversion changed
    if (this._engine) {
      this._engine._propagateFrom(this);
    }
  }

  /**
   * Check if a specific input pin is inverted.
   * @param {number} inputIndex
   * @returns {boolean}
   */
  isInputNegated(inputIndex) {
    if (inputIndex < 0 || inputIndex >= this.inputs.length) return false;
    return !!(this.negatedInputs & (1 << inputIndex));
  }

  /**
   * Override computeNextState to dispatch between legacy single-bit
   * and bus-aware multi-bit computation.
   */
  computeNextState() {
    if (this.bitWidth > 1) {
      // Bus-aware computation path
      return this._computeBusGateLogic();
    }

    // Legacy single-bit computation (unchanged)
    const originalValues = this.inputs.map(inp => inp.value);
    for (let i = 0; i < this.inputs.length; i++) {
      if (this.isInputNegated(i)) {
        this.inputs[i].value = !this.inputs[i].value;
      }
    }
    const result = this._computeGateLogic();
    for (let i = 0; i < this.inputs.length; i++) {
      this.inputs[i].value = originalValues[i];
    }
    return result;
  }

  /**
   * Gate-specific logic method for single-bit mode. Subclasses must override
   * this instead of computeNextState(). The input values have already been
   * inverted if needed.
   * @returns {{ outputs: boolean[] }}
   */
  _computeGateLogic() {
    // Default: pass-through (same as Component.computeNextState)
    return { outputs: this.outputs.map(o => o.value) };
  }

  /* ================================================================
   *  Bus-Aware Gate Logic (bitWidth > 1)
   * ================================================================ */

  /**
   * Compute gate logic for bus-width inputs/outputs.
   * Reads input Values, applies inversion, delegates to _applyBusOperation,
   * and returns the result as a Value output array.
   * @returns {{ outputs: Value[] }}
   */
  _computeBusGateLogic() {
    // Read input Values — convert booleans to Value if needed
    const inputValues = this.inputs.map(inp => {
      const v = inp.value;
      return (v instanceof Value) ? v : Value.fromBoolean(v);
    });

    // Apply inversion for negated inputs
    for (let i = 0; i < inputValues.length; i++) {
      if (this.isInputNegated(i)) {
        inputValues[i] = inputValues[i].not();
      }
    }

    // Apply gate operation — subclass specifies the operation type
    const result = this._applyBusOperation(inputValues);

    return { outputs: [result] };
  }

  /**
   * Apply the bus-width gate operation on the input Values.
   * Default implementation: AND all inputs together.
   * Subclasses override this to provide their specific logic.
   *
   * @param {Value[]} inputValues - Array of input Values (already inverted if needed)
   * @returns {Value} Result Value
   */
  _applyBusOperation(inputValues) {
    let result = inputValues[0] || Value.createUnknown(this.bitWidth);
    for (let i = 1; i < inputValues.length; i++) {
      result = result.and(inputValues[i]);
    }
    return result;
  }

  /* ================================================================
   *  Properties — bitWidth support
   * ================================================================ */

  // M-1: Shared property accessors for all multi-input gates.
  // Previously duplicated across 6 gate classes.
  getProperties() {
    const props = [...super.getProperties()];

    // Always show bitWidth for gates (allows user to configure bus width)
    // Remove the auto-added bitWidth from Component.getProperties() since
    // we want it always visible and with our own placement
    const filtered = props.filter(p => p.name !== 'bitWidth');

    // Add bitWidth property first
    filtered.unshift({
      name: 'bitWidth', label: 'Bit Width', type: 'number',
      value: this.bitWidth, min: 1, max: 32
    });

    // Only show 'inputs' count when bitWidth = 1 (bus gates always have 2 inputs)
    // and when the gate has more than 1 input (i.e., NOT NotGate and BufferGate)
    if (this.bitWidth === 1 && this.inputs.length > 1) {
      filtered.push({ name: 'inputs', label: 'Inputs', type: 'number', value: this.inputs.length, min: 2, max: 8 });
    }

    return filtered;
  }

  setProperty(name, value) {
    if (name === 'bitWidth') {
      const newWidth = parseInt(value, 10);
      if (isNaN(newWidth) || newWidth === this.bitWidth || newWidth < 1 || newWidth > 32) return false;
      this.bitWidth = newWidth;

      // Disconnect all wires on this component
      if (this._engine) {
        const wiresToRemove = this._engine.wires.filter(w =>
          w.from.componentId === this.id || w.to.componentId === this.id
        );
        wiresToRemove.forEach(w => {
          this._engine.disconnect(w.id);
          document.dispatchEvent(new CustomEvent('wire-removed', { detail: { wireId: w.id } }));
        });
      }

      // Rebuild ports with new width
      this._rebuildPorts();

      // Re-index in engine
      if (this._engine) {
        this._engine.reindexComponent(this);
      }

      this.rerender();
      if (this._engine) this._engine._propagateFrom(this);
      return true;
    }

    if (super.setProperty(name, value)) return true;

    if (name === 'inputs') {
      const newCount = parseInt(value, 10);
      if (isNaN(newCount) || newCount === this.inputs.length || newCount < 2 || newCount > 8) return false;
      const old = this.inputs;

      // Disconnect wires for inputs that are being removed
      if (newCount < old.length) {
        for (let i = newCount; i < old.length; i++) {
          const inp = old[i];
          if (inp.connectedTo) {
            if (this._engine) {
              const wire = this._engine.wires.find(w => w.to.nodeId === inp.id);
              if (wire) {
                this._engine.disconnect(wire.id);
                document.dispatchEvent(new CustomEvent('wire-removed', { detail: { wireId: wire.id } }));
              }
            }
            document.dispatchEvent(new CustomEvent('component-inputs-changed', {
              detail: { componentId: this.id, inputIndex: i, removed: true }
            }));
          }
        }
      }

      this.inputs = [];
      for (let i = 0; i < newCount; i++) {
        this.inputs.push({
          id: `${this.id}.input.${i}`,
          value: (old[i] ? old[i].value : false),
          width: (old[i] ? old[i].width : 1) || 1,
          connectedTo: (i < old.length && old[i].connectedTo) ? old[i].connectedTo : null
        });
      }

      // CRITICAL: Re-index the component's nodes in the engine so that
      // wire connections and signal propagation work with the new node IDs.
      if (this._engine) {
        this._engine.reindexComponent(this);
      }

      this.rerender();
      return true;
    }
    return false;
  }

  /**
   * Rebuild input and output ports based on current bitWidth.
   * When bitWidth > 1, bus gates always have exactly 2 inputs (like digitaljs).
   * When bitWidth = 1, the number of inputs is preserved.
   */
  _rebuildPorts() {
    const oldInputs = this.inputs;
    const inputCount = this.bitWidth === 1 ? (oldInputs.length || 2) : 2;

    this.inputs = [];
    for (let i = 0; i < inputCount; i++) {
      this.inputs.push({
        id: `${this.id}.input.${i}`,
        value: this.bitWidth > 1 ? Value.createUnknown(this.bitWidth) : false,
        width: this.bitWidth,
        connectedTo: null
      });
    }

    this.outputs = [];
    this.outputs.push({
      id: `${this.id}.output.0`,
      value: this.bitWidth > 1 ? Value.createKnown(this.bitWidth, 0) : false,
      width: this.bitWidth
    });
  }
}
