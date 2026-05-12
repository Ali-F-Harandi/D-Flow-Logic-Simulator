import { Component } from '../Component.js';
import { Value } from '../simulation/Value.js';
import { BUS_MAX_WIDTH } from '../../config.js';

/**
 * BusConstant — Outputs a constant N-bit value.
 *
 * Constructor params:
 *   id             — unique component id
 *   bitWidth       — bit width of the output (1–32, default 8)
 *   constantValue  — the numeric value to output (default 0)
 *
 * Ports:
 *   0 inputs
 *   1 output — N-bit bus with the constant value
 */
export class BusConstant extends Component {
  static label = 'Bus Constant';

  constructor(id, bitWidth = 8, constantValue = 0) {
    bitWidth = Math.max(1, Math.min(BUS_MAX_WIDTH, parseInt(bitWidth, 10) || 8));
    constantValue = parseInt(constantValue, 10) || 0;

    super(id, 'BusConstant', 0, 1, [], [bitWidth]);
    this.bitWidth = bitWidth;
    this._constantValue = constantValue;

    // Initialize output with the constant value
    this.outputs[0].value = Value.createKnown(bitWidth, constantValue);
  }

  computeNextState() {
    return { outputs: [Value.createKnown(this.bitWidth, this._constantValue)] };
  }

  applyNextState(nextState) {
    const { outputs } = nextState;
    for (let i = 0; i < this.outputs.length; i++) {
      this.outputs[i].value = outputs[i];
    }
    this._updateConnectorStates();
    this._updateAppearance();
  }

  reset() {
    this.outputs[0].value = Value.createKnown(this.bitWidth, this._constantValue);
    this._updateConnectorStates();
    this._updateAppearance();
  }

  resetState() {
    this._updateConnectorStates();
    this._updateAppearance();
  }

  getProperties() {
    const maxVal = this.bitWidth >= 32 ? 0xFFFFFFFF : (1 << this.bitWidth) - 1;
    return [
      ...super.getProperties(),
      {
        name: 'value',
        label: 'Value',
        type: 'number',
        value: this._constantValue,
        min: 0,
        max: maxVal
      }
    ];
  }

  setProperty(name, value) {
    if (super.setProperty(name, value)) return true;
    if (name === 'value') {
      const newVal = parseInt(value, 10);
      if (isNaN(newVal)) return false;
      const maxVal = this.bitWidth >= 32 ? 0xFFFFFFFF : (1 << this.bitWidth) - 1;
      this._constantValue = Math.max(0, Math.min(maxVal, newVal));
      this.outputs[0].value = Value.createKnown(this.bitWidth, this._constantValue);
      this._updateConnectorStates();
      this._updateAppearance();
      return true;
    }
    return false;
  }

  _updateAppearance() {
    if (!this.element) return;
    const display = this.element.querySelector('.constant-display');
    if (display) {
      const val = Value.createKnown(this.bitWidth, this._constantValue);
      display.textContent = val.toHexString();
    }
  }

  render(container) {
    const H = 3 * this.GRID;
    const W = 4 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component bus-constant';
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.style.borderColor = 'var(--bus-component-border, #5b9bd5)';
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'component-body-centered';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.alignItems = 'center';
    body.style.gap = '2px';

    const label = document.createElement('span');
    label.textContent = `CONST/${this.bitWidth}`;
    label.style.fontSize = '8px';
    label.style.fontWeight = 'bold';
    label.style.color = 'var(--bus-indicator-color, #5b9bd5)';
    label.style.fontFamily = 'monospace';
    body.appendChild(label);

    const display = document.createElement('span');
    display.className = 'constant-display bus-probe-value';
    display.textContent = Value.createKnown(this.bitWidth, this._constantValue).toHexString();
    display.style.fontSize = '13px';
    display.style.fontWeight = 'bold';
    display.style.fontFamily = 'monospace';
    display.style.color = 'var(--bus-component-border, #5b9bd5)';
    body.appendChild(display);

    el.appendChild(body);

    // Output connector
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, `${this.bitWidth}`, this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
    this._updateAppearance();
  }
}
