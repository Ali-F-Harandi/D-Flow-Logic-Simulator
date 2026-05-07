import { Component } from '../Component.js';

export class Multiplexer extends Component {
  static label = 'MUX 2:1';
  static category = 'Chips';

  constructor(id) {
    super(id, 'Multiplexer', 3, 1);   // A, B, Sel → Out
  }

  computeNextState() {
    const sel = this.inputs[2].value;
    const out = Boolean(sel ? this.inputs[1].value : this.inputs[0].value);
    return { outputs: [out] };
  }

  getProperties() { return []; }
  setProperty(name, value) { return false; }

  render(container) {
    const H = 4 * this.GRID;
    const W = 5 * this.GRID;    // wider for labels
    const el = document.createElement('div');
    el.className = 'component gate mux';
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'gate-body';
    body.textContent = 'MUX';
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
