import { Component } from './Component.js';
import { ComponentRenderer } from './ComponentRenderer.js';

/**
 * Shared base for all logic gates.
 * Subclasses must implement computeNextState() and provide
 * static label. They can also override getProperties() / setProperty().
 */
export class GateBase extends Component {

  constructor(id, type, inputsCount = 2, outputsCount = 1) {
    super(id, type, inputsCount, outputsCount);
    // Feature 4: Per-input inversion bitmask
    // Bit i set means input i is inverted (active-low)
    this.negatedInputs = 0;
  }

  /**
   * @param {HTMLElement} container – DOM element where the gate will be appended
   * @param {string} bodyText – label displayed inside the gate (e.g. 'AND')
   */
  render(container, bodyText = 'GATE') {
    const extraClasses = [`gate`, `${this.type.toLowerCase()}-gate`];
    ComponentRenderer.renderLabeledBox(this, container, {
      labelText: bodyText,
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
   * Override computeNextState to apply input inversion before gate logic.
   * Subclasses call super.computeNextState() or this automatically wraps.
   * The inversion is applied by temporarily flipping the input values,
   * calling the subclass _computeGateLogic(), then restoring them.
   */
  computeNextState() {
    // Save original input values and apply inversion
    const originalValues = this.inputs.map(inp => inp.value);
    for (let i = 0; i < this.inputs.length; i++) {
      if (this.isInputNegated(i)) {
        this.inputs[i].value = !this.inputs[i].value;
      }
    }
    // Call the gate-specific logic
    const result = this._computeGateLogic();
    // Restore original input values
    for (let i = 0; i < this.inputs.length; i++) {
      this.inputs[i].value = originalValues[i];
    }
    return result;
  }

  /**
   * Gate-specific logic method. Subclasses must override this instead of
   * computeNextState(). The input values have already been inverted if needed.
   * @returns {{ outputs: boolean[] }}
   */
  _computeGateLogic() {
    // Default: pass-through (same as Component.computeNextState)
    return { outputs: this.outputs.map(o => o.value) };
  }

  // M-1: Shared property accessors for all multi-input gates.
  // Previously duplicated across 6 gate classes.
  getProperties() {
    return [{ name: 'inputs', label: 'Inputs', type: 'number', value: this.inputs.length, min: 2, max: 8 }];
  }

  setProperty(name, value) {
    if (name === 'inputs') {
      const newCount = parseInt(value, 10);
      if (isNaN(newCount) || newCount === this.inputs.length || newCount < 2 || newCount > 8) return false;
      const old = this.inputs;

      // Disconnect wires for inputs that are being removed
      // before rebuilding the inputs array, to prevent orphan wires in the engine.
      if (newCount < old.length) {
        for (let i = newCount; i < old.length; i++) {
          const inp = old[i];
          if (inp.connectedTo) {
            // Emit event for UI to handle disconnection, decoupling from engine
            if (this._engine) {
              const wire = this._engine.wires.find(w => w.to.nodeId === inp.id);
              if (wire) {
                this._engine.disconnect(wire.id);
                document.dispatchEvent(new CustomEvent('wire-removed', { detail: { wireId: wire.id } }));
              }
            }
            // Also emit a higher-level event for other listeners
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
}