import { Component } from '../Component.js';
import { Value } from '../simulation/Value.js';

/**
 * 2:1 Multiplexer — selects between two inputs based on a select signal.
 * When enabled (S=0): output = A
 * When enabled (S=1): output = B
 *
 * Bus support: When bitWidth > 1, inputs A and B and the output
 * are bus-width. The select input is always 1-bit.
 */
export class Multiplexer extends Component {
  static label = 'MUX 2:1';
  static category = 'Chips';

  constructor(id) {
    super(id, 'Multiplexer', 3, 1);   // A, B, Sel → Out
  }

  computeNextState() {
    const sel = this.inputs[2].value;

    if (this.bitWidth > 1) {
      // Bus mode: select between two bus Values
      const aValue = this.inputs[0].value;
      const bValue = this.inputs[1].value;
      const aVal = (aValue instanceof Value) ? aValue : Value.fromBoolean(aValue);
      const bVal = (bValue instanceof Value) ? bValue : Value.fromBoolean(bValue);
      return { outputs: [sel ? bVal : aVal] };
    }

    // Legacy single-bit mode (unchanged)
    const out = Boolean(sel ? this.inputs[1].value : this.inputs[0].value);
    return { outputs: [out] };
  }

  getProperties() {
    const props = [
      { name: 'bitWidth', label: 'Bit Width', type: 'number', value: this.bitWidth, min: 1, max: 32 },
      ...super.getProperties().filter(p => p.name !== 'bitWidth')
    ];
    return props;
  }

  setProperty(name, value) {
    if (name === 'bitWidth') {
      const w = parseInt(value, 10);
      if (isNaN(w) || w < 1 || w > 32 || w === this.bitWidth) return false;

      // Disconnect wires
      if (this._engine) {
        const wiresToRemove = this._engine.wires.filter(wr =>
          wr.from.componentId === this.id || wr.to.componentId === this.id
        );
        wiresToRemove.forEach(wr => {
          this._engine.disconnect(wr.id);
          document.dispatchEvent(new CustomEvent('wire-removed', { detail: { wireId: wr.id } }));
        });
      }

      this.bitWidth = w;

      // Rebuild ports - A, B and output at bus width, S always 1-bit
      this.inputs = [
        { id: `${this.id}.input.0`, value: w > 1 ? Value.createUnknown(w) : false, width: w, connectedTo: null },
        { id: `${this.id}.input.1`, value: w > 1 ? Value.createUnknown(w) : false, width: w, connectedTo: null },
        { id: `${this.id}.input.2`, value: false, width: 1, connectedTo: null }
      ];
      this.outputs = [
        { id: `${this.id}.output.0`, value: w > 1 ? Value.createKnown(w, 0) : false, width: w }
      ];

      if (this._engine) this._engine.reindexComponent(this);
      this.rerender();
      if (this._engine) this._engine._propagateFrom(this);
      return true;
    }

    if (super.setProperty(name, value)) return true;
    return false;
  }

  render(container) {
    const isBus = this.bitWidth > 1;
    const H = 4 * this.GRID;
    const W = 5 * this.GRID;    // wider for labels
    const el = document.createElement('div');
    el.className = 'component gate mux' + (isBus ? ' bus-component' : '');
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'gate-body';
    body.textContent = isBus ? `MUX/${this.bitWidth}` : 'MUX';
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    el.appendChild(body);

    el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'A', 1 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[1], true, 'B', 2 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[2], true, 'S', 3 * this.GRID));
    // Output centered vertically
    const outY = 2 * this.GRID;
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'Out', outY));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}
