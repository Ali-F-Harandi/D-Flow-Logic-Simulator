import { Component } from '../Component.js';
import { Value } from '../simulation/Value.js';
import { BUS_MAX_WIDTH } from '../../config.js';

/**
 * BusProbe — Displays the current value of an N-bit bus in hex, decimal, and binary.
 *
 * Constructor params:
 *   id       — unique component id
 *   bitWidth — bit width of the input bus (1–32, default 8)
 *
 * Ports:
 *   1 input — N-bit bus
 *   0 outputs
 */
export class BusProbe extends Component {
  static label = 'Bus Probe';

  constructor(id, bitWidth = 8) {
    bitWidth = Math.max(1, Math.min(BUS_MAX_WIDTH, parseInt(bitWidth, 10) || 8));
    super(id, 'BusProbe', 1, 0, [bitWidth]);
    this.bitWidth = bitWidth;

    // Initialize input
    this.inputs[0].value = Value.createUnknown(bitWidth);
  }

  computeNextState() {
    // No outputs to compute, just reads and displays input value
    return { outputs: [] };
  }

  applyNextState(nextState) {
    this._updateDisplay();
    this._updateConnectorStates();
  }

  setInputValue(index, value) {
    if (this.inputs[index]) {
      this.inputs[index].value = value;
      this._updateDisplay();
      this._updateConnectorStates();
    }
  }

  reset() {
    this.inputs[0].value = Value.createUnknown(this.bitWidth);
    this._updateDisplay();
    this._updateConnectorStates();
  }

  _updateDisplay() {
    if (!this.element) return;
    const inp = this.inputs[0]?.value;
    const val = (inp instanceof Value) ? inp : Value.fromBoolean(inp);

    const hexEl = this.element.querySelector('.probe-hex');
    const decEl = this.element.querySelector('.probe-dec');
    const binEl = this.element.querySelector('.probe-bin');

    if (hexEl) {
      hexEl.textContent = val.toHexString();
      hexEl.title = `Hex: ${val.toHexString()}\nDec: ${val.toDecimalString()}\nBin: ${val.toBinaryString()}`;
    }
    if (decEl) decEl.textContent = val.toDecimalString();
    if (binEl) {
      // Show compact binary with space every 4 bits
      const binStr = val.toBinaryString();
      binEl.textContent = binStr.length > 8
        ? binStr.replace(/(.{4})/g, '$1 ').trim()
        : binStr;
    }

    // Update component border based on value state
    if (val.error) {
      this.element.style.borderColor = 'var(--bus-wire-error-color, #ff4444)';
    } else if (val.unknown) {
      this.element.style.borderColor = 'var(--bus-wire-unknown-color, #ff9800)';
    } else if (val.isFullyDefined() && val.value !== 0) {
      this.element.style.borderColor = 'var(--bus-wire-active-color, #7ec8e3)';
    } else {
      this.element.style.borderColor = 'var(--bus-component-border, #5b9bd5)';
    }
  }

  render(container) {
    const H = 4 * this.GRID;
    const W = 5 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component bus-probe';
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
    body.style.gap = '1px';
    body.style.padding = '2px';
    body.style.fontSize = '10px';
    body.style.fontFamily = 'monospace';

    const titleLabel = document.createElement('span');
    titleLabel.textContent = `PROBE/${this.bitWidth}`;
    titleLabel.style.fontSize = '8px';
    titleLabel.style.fontWeight = 'bold';
    titleLabel.style.color = 'var(--bus-indicator-color, #5b9bd5)';
    body.appendChild(titleLabel);

    const hexEl = document.createElement('span');
    hexEl.className = 'probe-hex bus-probe-value';
    hexEl.style.fontWeight = 'bold';
    hexEl.style.fontSize = '13px';
    hexEl.style.color = 'var(--bus-component-border, #5b9bd5)';
    body.appendChild(hexEl);

    const decEl = document.createElement('span');
    decEl.className = 'probe-dec';
    decEl.style.opacity = '0.8';
    decEl.style.fontSize = '9px';
    body.appendChild(decEl);

    const binEl = document.createElement('span');
    binEl.className = 'probe-bin';
    binEl.style.fontSize = '7px';
    binEl.style.opacity = '0.7';
    binEl.style.wordBreak = 'break-all';
    binEl.style.maxWidth = `${W - 10}px`;
    body.appendChild(binEl);

    el.appendChild(body);

    // Input connector
    const inputY = Math.round(H / 2 / this.GRID) * this.GRID;
    el.appendChild(this._createConnectorBlock(this.inputs[0], true, `${this.bitWidth}`, inputY));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateDisplay();
    this._updateConnectorStates();
  }
}
