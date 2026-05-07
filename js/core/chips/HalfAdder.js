import { Component } from '../Component.js';

export class HalfAdder extends Component {
  static label = 'Half Adder';
  static category = 'Chips';

  constructor(id) {
    super(id, 'HalfAdder', 2, 2);   // A, B → Sum, Carry
  }

  computeNextState() {
    const a = this.inputs[0].value;
    const b = this.inputs[1].value;
    const sum = Boolean(a ^ b);
    const carry = Boolean(a && b);
    return { outputs: [sum, carry] };
  }

  getProperties() { return []; }
  setProperty(name, value) { return false; }

  render(container) {
    const H = 4 * this.GRID;   // 80px
    const W = 5 * this.GRID;   // 100px (wider for labels)
    const el = document.createElement('div');
    el.className = 'component gate half-adder';
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'gate-body';
    body.textContent = 'HA';
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    el.appendChild(body);

    // Input connectors on left: A at y=1grid, B at y=2grid
    el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'A', 1 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[1], true, 'B', 2 * this.GRID));
    // Output connectors on right: Sum at y=1grid, Cout at y=2grid (aligned with inputs)
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'Sum', 1 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[1], false, 'Cout', 3 * this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}
