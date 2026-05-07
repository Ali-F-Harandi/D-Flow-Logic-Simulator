import { Component } from '../Component.js';

export class FullAdder extends Component {
  static label = 'Full Adder';
  static category = 'Chips';

  constructor(id) {
    super(id, 'FullAdder', 3, 2);   // A, B, Cin → Sum, Cout
  }

  computeNextState() {
    const a = this.inputs[0].value;
    const b = this.inputs[1].value;
    const cin = this.inputs[2].value;
    const sum = Boolean(a ^ b ^ cin);
    const cout = Boolean((a && b) || (cin && (a ^ b)));
    return { outputs: [sum, cout] };
  }

  getProperties() { return []; }

  render(container) {
    const H = 5 * this.GRID;   // 100px
    const W = 4 * this.GRID;   // 80px
    const el = document.createElement('div');
    el.className = 'component gate full-adder';
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'gate-body';
    body.textContent = 'FA';
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    el.appendChild(body);

    el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'A', 1 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[1], true, 'B', 2 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[2], true, 'Cin', 3 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'Sum', 1 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[1], false, 'Cout', 3 * this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}
