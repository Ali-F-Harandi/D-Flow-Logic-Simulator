import { Component } from '../Component.js';

export class SRFlipFlop extends Component {
  static label = 'SR Flip-Flop';
  constructor(id) {
    super(id, 'SR', 3, 2);
    this._prevClk = false;
    this._state = { Q: false, nQ: true };
    this.outputs[1].value = true;   // nQ starts HIGH
  }

  computeNextState() {
    const s = this.inputs[0].value;
    const r = this.inputs[1].value;
    const clk = this.inputs[2].value;
    let nextQ = this._state.Q;
    let nextNQ = this._state.nQ;
    if (clk && !this._prevClk) {
      if (s && !r) { nextQ = true; nextNQ = false; }
      else if (!s && r) { nextQ = false; nextNQ = true; }
    }
    return { outputs: [nextQ, nextNQ], prevClk: clk };
  }

  applyNextState(nextState) {
    this._state.Q = nextState.outputs[0];
    this._state.nQ = nextState.outputs[1];
    this._prevClk = nextState.prevClk;
    super.applyNextState(nextState);
  }

  getProperties() { return []; }

  render(container) {
    const H = 4 * this.GRID;  // 80
    const el = document.createElement('div');
    el.className = 'component flipflop sr-ff';
    el.style.width = `${4 * this.GRID}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'ff-body';
    body.textContent = 'SR';
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    el.appendChild(body);

    el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'S',   1*this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[1], true, 'R',   2*this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[2], true, 'CLK', 3*this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'Q',  1*this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[1], false, '!Q', 3*this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
  }
}