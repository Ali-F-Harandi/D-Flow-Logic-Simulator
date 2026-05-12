import { Component } from '../Component.js';
import { Value } from '../simulation/Value.js';

/**
 * Logic Probe — displays the logic state of a signal.
 * When connected to a bus (width > 1), shows the hex value.
 */
export class LogicProbe extends Component {
  static label = 'Probe';
  constructor(id) {
    super(id, 'Probe', 1, 0);
  }

  computeNextState() {
    // No outputs to compute, but we need to signal that display should update
    return { outputs: [] };
  }

  applyNextState(nextState) {
    // No outputs to apply, but update visual based on current input values
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
    if (this.inputs[0]?.width > 1) {
      this.inputs[0].value = Value.createUnknown(this.inputs[0].width);
    } else {
      this.inputs.forEach(i => i.value = false);
    }
    this._updateDisplay();
    this._updateConnectorStates();
  }

  render(container) {
    const inpWidth = this.inputs[0]?.width || 1;
    const isBus = inpWidth > 1;
    const H = isBus ? 4 * this.GRID : 3 * this.GRID;
    const W = isBus ? 4 * this.GRID : 3 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component probe' + (isBus ? ' bus-component' : '');
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const indicator = document.createElement('div');
    indicator.className = 'probe-indicator component-body-centered';
    indicator.textContent = '?';
    indicator.style.fontSize = isBus ? '14px' : '24px';
    indicator.style.fontWeight = 'bold';
    indicator.style.fontFamily = 'monospace';
    el.appendChild(indicator);

    el.appendChild(this._createConnectorBlock(
      this.inputs[0], true, isBus ? `I/${inpWidth}` : 'I0', this.GRID
    ));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateDisplay();
  }

  _updateDisplay() {
    if (!this.element) return;
    const inp = this.inputs[0]?.value;
    const isBus = this.inputs[0]?.width > 1;
    const indicator = this.element.querySelector('.probe-indicator');
    if (!indicator) return;
    const style = getComputedStyle(document.documentElement);
    const highColor = style.getPropertyValue('--probe-high').trim() || '#4ec9b0';
    const lowColor = style.getPropertyValue('--probe-low').trim() || '#f44747';
    const zColor = style.getPropertyValue('--probe-z').trim() || '#888';

    if (isBus && inp instanceof Value) {
      // Bus display
      if (inp.error) {
        indicator.textContent = 'ERR';
        indicator.style.color = '#ff4444';
      } else if (inp.unknown) {
        indicator.textContent = 'X';
        indicator.style.color = zColor;
      } else {
        indicator.textContent = inp.toHexString();
        indicator.style.color = inp.value !== 0 ? highColor : lowColor;
      }
    } else {
      // Single-bit display (unchanged)
      if (inp === true) { indicator.textContent = '1'; indicator.style.color = highColor; }
      else if (inp === false) { indicator.textContent = '0'; indicator.style.color = lowColor; }
      else { indicator.textContent = 'Z'; indicator.style.color = zColor; }
    }
  }
}
