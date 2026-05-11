import { Component } from '../Component.js';
import { ComponentRenderer } from '../ComponentRenderer.js';

/**
 * Subcircuit — a custom component that wraps an inner circuit.
 * Users can select components, right-click "Create Subcircuit",
 * and those components become the internal circuit of a new Subcircuit instance.
 *
 * The subcircuit exposes external input/output connectors that map to
 * the inner circuit's input/output components.
 */
export class Subcircuit extends Component {
  /**
   * @param {string} id - Component ID
   * @param {string} [name='Subcircuit'] - Display name
   * @param {Object} [innerCircuit] - Serialized circuit data for the inner circuit
   * @param {Array} [inputLabels] - Labels for input ports
   * @param {Array} [outputLabels] - Labels for output ports
   */
  constructor(id, name = 'Subcircuit', innerCircuit = null, inputLabels = [], outputLabels = []) {
    super(id, 'Subcircuit', inputLabels.length || 1, outputLabels.length || 1);
    this._name = name;
    this._innerCircuit = innerCircuit;
    this._inputLabels = inputLabels;
    this._outputLabels = outputLabels;
    // Internal state for simulation
    this._internalOutputs = new Array(this.outputs.length).fill(false);
  }

  static label = 'Subcircuit';

  getProperties() {
    return [
      { name: 'name', value: this._name, type: 'text' },
      { name: 'inputs', value: this.inputs.length, type: 'number', min: 1, max: 16 },
      { name: 'outputs', value: this.outputs.length, type: 'number', min: 1, max: 16 }
    ];
  }

  setProperty(name, value) {
    if (name === 'name') {
      this._name = String(value);
      if (this.element) {
        const body = this.element.querySelector('.component-body-centered');
        if (body) body.textContent = this._name;
      }
      return true;
    }
    if (name === 'inputs') {
      const count = Math.max(1, Math.min(16, parseInt(value) || 1));
      if (count === this.inputs.length) return false;
      // Store old inputs
      const oldInputs = [...this.inputs];
      this.inputs = [];
      for (let i = 0; i < count; i++) {
        if (oldInputs[i]) {
          this.inputs.push(oldInputs[i]);
        } else {
          this.inputs.push({ id: `${this.id}.input.${i}`, value: false, connectedTo: null });
        }
      }
      this._inputLabels = this._inputLabels.slice(0, count);
      while (this._inputLabels.length < count) this._inputLabels.push(`I${this._inputLabels.length}`);
      this.rerender();
      return true;
    }
    if (name === 'outputs') {
      const count = Math.max(1, Math.min(16, parseInt(value) || 1));
      if (count === this.outputs.length) return false;
      const oldOutputs = [...this.outputs];
      this.outputs = [];
      for (let i = 0; i < count; i++) {
        if (oldOutputs[i]) {
          this.outputs.push(oldOutputs[i]);
        } else {
          this.outputs.push({ id: `${this.id}.output.${i}`, value: false });
        }
      }
      this._outputLabels = this._outputLabels.slice(0, count);
      while (this._outputLabels.length < count) this._outputLabels.push(`O${this._outputLabels.length}`);
      this._internalOutputs = new Array(count).fill(false);
      this.rerender();
      return true;
    }
    return false;
  }

  /**
   * For a basic subcircuit, compute output based on a truth table
   * derived from the inner circuit. In this basic version, we do
   * simple pass-through with customizable logic via setOutputFunction.
   */
  computeNextState() {
    // Default: pass inputs to outputs (identity for matched count)
    // Can be overridden by setting _outputFunction
    if (this._outputFunction) {
      const inputValues = this.inputs.map(inp => inp.value);
      const results = this._outputFunction(inputValues);
      return { outputs: results };
    }

    // Simple pass-through: output[i] = input[i] if available, else false
    const outputs = this.outputs.map((_, i) => {
      return i < this.inputs.length ? this.inputs[i].value : false;
    });
    return { outputs };
  }

  /**
   * Set a custom output function for this subcircuit.
   * @param {Function} fn - (inputValues: boolean[]) => boolean[]
   */
  setOutputFunction(fn) {
    this._outputFunction = fn;
  }

  render(container) {
    const el = ComponentRenderer.renderLabeledBox(this, container, {
      labelText: this._name,
      extraClasses: ['subcircuit-component']
    });

    // Add a small circuit icon indicator
    if (el) {
      el.style.borderLeft = '3px solid var(--color-accent)';
      // Update connector labels
      const connectors = el.querySelectorAll('.connector-label');
      connectors.forEach(label => {
        const isInput = label.parentElement.querySelector('.connector')?.classList.contains('input');
        const idx = parseInt(label.textContent.replace('I', '').replace('O', ''));
        if (isInput && this._inputLabels[idx]) {
          label.textContent = this._inputLabels[idx];
        } else if (!isInput && this._outputLabels[idx]) {
          label.textContent = this._outputLabels[idx];
        }
      });
    }
  }
}
