import { Component } from './Component.js';   // ← fixed relative path

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
    const n = this.inputs.length;
    const H = Math.max(3, n + 1) * this.GRID;
    const el = document.createElement('div');
    el.className = `component gate ${this.type.toLowerCase()}-gate`;
    el.style.width = `${4 * this.GRID}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', `${bodyText} gate`);
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'gate-body component-body-centered';
    body.textContent = bodyText;
    el.appendChild(body);

    // Input connectors
    for (let i = 0; i < n; i++) {
      el.appendChild(this._createConnectorBlock(this.inputs[i], true, `I${i}`, (i + 1) * this.GRID));
    }
    // Output connector (vertically centred)
    const outY = Math.floor(H / (2 * this.GRID)) * this.GRID;
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'O0', outY));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
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
            const wire = this._engine?.wires.find(w => w.to.nodeId === inp.id);
            if (wire && this._engine) {
              this._engine.disconnect(wire.id);
              document.dispatchEvent(new CustomEvent('wire-removed', { detail: { wireId: wire.id } }));
            }
          }
        }
      }

      this.inputs = [];
      for (let i = 0; i < newCount; i++) {
        this.inputs.push({
          id: `${this.id}.input.${i}`,
          value: (old[i] ? old[i].value : false),
          connectedTo: (i < old.length && newCount > i && old[i].connectedTo && i < newCount) ? old[i].connectedTo : null
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