import { Component } from '../Component.js';

export class DFlipFlop extends Component {
  static label = 'D Flip-Flop';
  constructor(id) {
    super(id, 'D', 2, 2);
    this._prevClk = false;
    this._state = { Q: false, nQ: true };
  }

  computeOutput() {
    const d = this.inputs[0].value;
    const clk = this.inputs[1].value;
    if (clk && !this._prevClk) {
      this._state.Q = d;
      this._state.nQ = !d;
    }
    this._prevClk = clk;
    this.outputs[0].value = this._state.Q;
    this.outputs[1].value = this._state.nQ;
    this._updateConnectorStates();
    return this.outputs;
  }

  getProperties() { return []; }

  render(container) {
    const H = 4 * this.GRID;  // 80
    const el = document.createElement('div');
    el.className = 'component flipflop d-ff';
    el.style.width = `${4 * this.GRID}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'ff-body';
    body.textContent = 'D';
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    el.appendChild(body);

    el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'D',   1*this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[1], true, 'CLK', 2*this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'Q',  1*this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[1], false, '!Q', 3*this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
  }
}