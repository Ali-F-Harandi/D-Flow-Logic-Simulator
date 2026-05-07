import { Component } from '../Component.js';

export class TFlipFlop extends Component {
  static label = 'T Flip-Flop';
  constructor(id) {
    super(id, 'T', 2, 2);
    this._prevClk = false;
    this._state = { Q: false, nQ: true };
  }

  computeNextState() {
    const t = this.inputs[0].value;
    const clk = this.inputs[1].value;
    let nextQ = this._state.Q;
    let nextNQ = this._state.nQ;
    if (clk && !this._prevClk && t) {
      // Toggle: nQ must be the complement of nextQ
      nextQ = !this._state.Q;
      nextNQ = this._state.Q;
    }
    return { outputs: [nextQ, nextNQ], prevClk: clk };
  }

  applyNextState(nextState) {
    this._state.Q   = nextState.outputs[0];
    this._state.nQ  = nextState.outputs[1];
    this._prevClk   = nextState.prevClk;
    super.applyNextState(nextState);
  }

  reset() {
    super.reset();
    this._prevClk = false;
    this._state = { Q: false, nQ: true };
    if (this.outputs.length > 1) {
      this.outputs[1].value = true;
    }
    this._updateConnectorStates();
  }

  render(container) {
    const H = 4 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component flipflop t-ff';
    el.style.width = `${4 * this.GRID}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'ff-body';
    body.textContent = 'T';
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    el.appendChild(body);

    el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'T',   1*this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[1], true, 'CLK', 2*this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'Q',  1*this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[1], false, '!Q', 3*this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}
