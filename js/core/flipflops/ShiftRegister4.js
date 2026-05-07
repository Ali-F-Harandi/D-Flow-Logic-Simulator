import { Component } from '../Component.js';

export class ShiftRegister4 extends Component {
  static label = 'Shift Reg 4';
  static category = 'Flip-Flops';

  constructor(id) {
    super(id, 'ShiftRegister4', 2, 4);   // Data, Clock → Q0..Q3
    this._prevClk = false;
    this._state = [false, false, false, false];
  }

  computeNextState() {
    const data = this.inputs[0].value;
    const clk = this.inputs[1].value;
    let newState = this._state;   // default to current state
    if (clk && !this._prevClk) {
      // Shift right: new bit from data, others shift
      newState = [data, this._state[0], this._state[1], this._state[2]];
    }
    return {
      outputs: [...newState],   // output values are the new state
      prevClk: clk,
      newState: newState        // internal state to apply later
    };
  }

  applyNextState(nextState) {
    this._state = nextState.newState;
    this._prevClk = nextState.prevClk;
    super.applyNextState(nextState);
  }

  getProperties() { return []; }

  render(container) {
    const H = 6 * this.GRID;
    const W = 5 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component flipflop shift-reg';
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'ff-body';
    body.textContent = 'SR4';
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    el.appendChild(body);

    el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'D', 1 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[1], true, 'CLK', 2 * this.GRID));
    for (let i = 0; i < 4; i++) {
      el.appendChild(this._createConnectorBlock(this.outputs[i], false, `Q${i}`, (1 + i) * this.GRID));
    }

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}