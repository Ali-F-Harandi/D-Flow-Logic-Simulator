import { Component } from '../Component.js';

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
    this.inputs.forEach(i => i.value = false);
    this._updateDisplay();
    this._updateConnectorStates();
  }

  render(container) {
    const H = 3 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component probe';
    el.style.width = `${3 * this.GRID}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const indicator = document.createElement('div');
    indicator.className = 'probe-indicator component-body-centered';
    indicator.textContent = '?';
    indicator.style.fontSize = '24px';
    indicator.style.fontWeight = 'bold';
    el.appendChild(indicator);

    el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'I0', this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateDisplay();
  }

  _updateDisplay() {
    if (!this.element) return;
    const inp = this.inputs[0]?.value;
    const indicator = this.element.querySelector('.probe-indicator');
    if (!indicator) return;
    const style = getComputedStyle(document.documentElement);
    const highColor = style.getPropertyValue('--probe-high').trim() || '#4ec9b0';
    const lowColor = style.getPropertyValue('--probe-low').trim() || '#f44747';
    const zColor = style.getPropertyValue('--probe-z').trim() || '#888';
    if (inp === true) { indicator.textContent = '1'; indicator.style.color = highColor; }
    else if (inp === false) { indicator.textContent = '0'; indicator.style.color = lowColor; }
    else { indicator.textContent = 'Z'; indicator.style.color = zColor; }
  }
}