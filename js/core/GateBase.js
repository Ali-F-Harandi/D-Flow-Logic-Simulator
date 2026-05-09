import { Component } from './Component.js';
import { ComponentRenderer } from './ComponentRenderer.js';

/**
 * Shared base for all logic gates.
 * Subclasses must implement computeNextState() and provide
 * static label. They can also override getProperties() / setProperty().
 */
export class GateBase extends Component {
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