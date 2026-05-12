import { Component } from '../Component.js';
import { Value } from '../simulation/Value.js';
import { BUS_MAX_WIDTH } from '../../config.js';

/**
 * Register — An N-bit D register with clock input.
 * This is the bus-aware version of DFlipFlop.
 *
 * Constructor params:
 *   id       — unique component id
 *   bitWidth — bit width of the data bus (1–32, default 8)
 *
 * Ports:
 *   D input   — N-bit bus (width = bitWidth)
 *   CLK input — 1-bit clock
 *   Q output  — N-bit bus (width = bitWidth)
 */
export class Register extends Component {
  static label = 'Register';

  constructor(id, bitWidth = 8) {
    bitWidth = Math.max(1, Math.min(BUS_MAX_WIDTH, parseInt(bitWidth, 10) || 8));
    super(id, 'Register', 2, 1, [bitWidth, 1], [bitWidth]);
    this.bitWidth = bitWidth;

    // Internal state
    this._stateValue = Value.createKnown(bitWidth, 0);
    this._prevClk = false;

    // Initialize ports
    this.inputs[0].value = Value.createUnknown(bitWidth);  // D
    this.inputs[1].value = Value.FALSE;                     // CLK
    this.outputs[0].value = Value.createKnown(bitWidth, 0); // Q
  }

  computeNextState() {
    const dVal = this.inputs[0].value;
    const clk = this.inputs[1].value;
    const d = (dVal instanceof Value) ? dVal : Value.fromBoolean(dVal);

    let nextQ = this._stateValue;
    if (this._isRisingEdge(clk)) {
      nextQ = d.width === this.bitWidth ? d : Value.createKnown(this.bitWidth, d.value);
    }

    return {
      outputs: [nextQ],
      prevClk: clk,
      stateValue: nextQ
    };
  }

  applyNextState(nextState) {
    this._stateValue = nextState.stateValue;
    this._prevClk = nextState.prevClk;
    const { outputs } = nextState;
    for (let i = 0; i < this.outputs.length; i++) {
      this.outputs[i].value = outputs[i];
    }
    this._updateConnectorStates();
  }

  _isRisingEdge(clk) {
    const clkVal = (clk instanceof Value) ? clk.toBoolean() : clk;
    return clkVal === true && this._prevClk === false;
  }

  reset() {
    this._stateValue = Value.createKnown(this.bitWidth, 0);
    this._prevClk = false;
    this.outputs[0].value = Value.createKnown(this.bitWidth, 0);
    this.inputs[0].value = Value.createUnknown(this.bitWidth);
    this.inputs[1].value = Value.FALSE;
    this._updateConnectorStates();
  }

  getProperties() {
    return [
      ...super.getProperties()
    ];
  }

  setProperty(name, value) {
    if (super.setProperty(name, value)) return true;
    return false;
  }

  render(container) {
    const H = 4 * this.GRID;
    const W = 5 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component flipflop register';
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.style.borderColor = 'var(--bus-component-border, #5b9bd5)';
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'ff-body';
    body.textContent = `REG/${this.bitWidth}`;
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    body.style.fontSize = '11px';
    body.style.fontWeight = 'bold';
    body.style.color = 'var(--bus-indicator-color, #5b9bd5)';
    el.appendChild(body);

    el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'D', 1 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[1], true, 'CLK', 2 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, `Q[${this.bitWidth}]`, 1 * this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}
