import { Component } from '../Component.js';

export class JKFlipFlop extends Component {
  static label = 'JK Flip-Flop';
  constructor(id) {
    super(id, 'JK', 3, 2);
    this._prevClk = false;
    this._state = { Q: false, nQ: true };
  }

  computeNextState() {
    const j = this.inputs[0].value;
    const k = this.inputs[1].value;
    const clk = this.inputs[2].value;
    let nextQ = this._state.Q;
    let nextNQ = this._state.nQ;
    if (clk && !this._prevClk) {
      if (j && !k) { nextQ = true; nextNQ = false; }
      else if (!j && k) { nextQ = false; nextNQ = true; }
      else if (j && k) {
        // Toggle: nQ must be the complement of nextQ
        nextQ = !this._state.Q;
        nextNQ = this._state.Q;
      }
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

  getProperties() { return []; }

  render(container) {
    const H = 5 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component flipflop jk-ff';
    el.style.width = `${4 * this.GRID}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'ff-body';
    body.textContent = 'JK';
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    el.appendChild(body);

    el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'J',   1*this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[1], true, 'K',   2*this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[2], true, 'CLK', 3*this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'Q',  1*this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[1], false, '!Q', 4*this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}