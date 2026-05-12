import { Component } from '../Component.js';
import { Value } from '../simulation/Value.js';
import { BUS_MAX_WIDTH } from '../../config.js';

/**
 * ZeroExtend — Pads a narrower bus with zeros to make it wider.
 *
 * Constructor params:
 *   id           — unique component id
 *   inputWidth   — bit width of the input bus (1–31, default 8)
 *   outputWidth  — bit width of the output bus (2–32, default 16)
 *
 * Ports:
 *   1 input  — M-bit bus
 *   1 output — N-bit bus (N > M, upper bits are zero)
 */
export class ZeroExtend extends Component {
  static label = 'Zero Extend';

  constructor(id, inputWidth = 8, outputWidth = 16) {
    inputWidth = Math.max(1, Math.min(BUS_MAX_WIDTH - 1, parseInt(inputWidth, 10) || 8));
    outputWidth = Math.max(inputWidth + 1, Math.min(BUS_MAX_WIDTH, parseInt(outputWidth, 10) || 16));

    super(id, 'ZeroExtend', 1, 1, [inputWidth], [outputWidth]);
    this.bitWidth = outputWidth;
    this._inputWidth = inputWidth;
    this._outputWidth = outputWidth;

    this.inputs[0].value = Value.createUnknown(inputWidth);
    this.outputs[0].value = Value.createUnknown(outputWidth);
  }

  computeNextState() {
    const inpVal = this.inputs[0].value;
    const val = (inpVal instanceof Value) ? inpVal : Value.fromBoolean(inpVal);

    // Zero-extend: keep lower bits, upper bits are 0
    const inputMask = this._inputWidth >= 32 ? 0xFFFFFFFF : (1 << this._inputWidth) - 1;
    const lowerValue = val.value & inputMask;
    const lowerUnknown = val.unknown & inputMask;
    const lowerError = val.error & inputMask;

    return {
      outputs: [new Value(this._outputWidth, lowerError, lowerUnknown, lowerValue)]
    };
  }

  applyNextState(nextState) {
    const { outputs } = nextState;
    for (let i = 0; i < this.outputs.length; i++) {
      this.outputs[i].value = outputs[i];
    }
    this._updateConnectorStates();
  }

  reset() {
    this.inputs[0].value = Value.createUnknown(this._inputWidth);
    this.outputs[0].value = Value.createUnknown(this._outputWidth);
    this._updateConnectorStates();
  }

  getProperties() {
    return [
      ...super.getProperties(),
      {
        name: 'inputWidth',
        label: 'Input Width',
        type: 'number',
        value: this._inputWidth,
        min: 1,
        max: this._outputWidth - 1
      },
      {
        name: 'outputWidth',
        label: 'Output Width',
        type: 'number',
        value: this._outputWidth,
        min: this._inputWidth + 1,
        max: BUS_MAX_WIDTH
      }
    ];
  }

  setProperty(name, value) {
    if (super.setProperty(name, value)) return true;
    if (name === 'inputWidth') {
      const newWidth = parseInt(value, 10);
      if (isNaN(newWidth) || newWidth < 1 || newWidth >= this._outputWidth) return false;
      this._inputWidth = newWidth;
      this.inputs[0].width = newWidth;
      this.inputs[0].value = Value.createUnknown(newWidth);
      if (this._engine) this._engine.reindexComponent(this);
      this.rerender();
      return true;
    }
    if (name === 'outputWidth') {
      const newWidth = parseInt(value, 10);
      if (isNaN(newWidth) || newWidth <= this._inputWidth || newWidth > BUS_MAX_WIDTH) return false;
      this._outputWidth = newWidth;
      this.bitWidth = newWidth;
      this.outputs[0].width = newWidth;
      this.outputs[0].value = Value.createUnknown(newWidth);
      if (this._engine) this._engine.reindexComponent(this);
      this.rerender();
      return true;
    }
    return false;
  }

  render(container) {
    const H = 3 * this.GRID;
    const W = 5 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component zero-extend';
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
    label.textContent = 'ZEXT';
    label.style.fontSize = '11px';
    label.style.fontWeight = 'bold';
    label.style.color = 'var(--bus-indicator-color, #5b9bd5)';
    body.appendChild(label);

    const rangeLabel = document.createElement('span');
    rangeLabel.textContent = `${this._inputWidth}→${this._outputWidth}`;
    rangeLabel.style.fontSize = '8px';
    rangeLabel.style.color = 'var(--bus-indicator-color, #5b9bd5)';
    rangeLabel.style.fontFamily = 'monospace';
    rangeLabel.style.opacity = '0.7';
    body.appendChild(rangeLabel);

    el.appendChild(body);

    el.appendChild(this._createConnectorBlock(this.inputs[0], true, `${this._inputWidth}`, this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, `${this._outputWidth}`, this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}
