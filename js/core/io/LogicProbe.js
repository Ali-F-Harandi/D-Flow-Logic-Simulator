import { Component } from '../Component.js';

export class LogicProbe extends Component {
  static label = 'Probe';
  constructor(id) {
    super(id, 'Probe', 1, 0);
  }

  computeOutput() {
    this._updateDisplay();
    return this.outputs;
  }

  setInputValue(index, value) {
    if (this.inputs[index]) {
      this.inputs[index].value = value;
      this._updateDisplay();
    }
  }

  reset() {
    this.inputs.forEach(i => i.value = false);
    this._updateDisplay();
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
    indicator.className = 'probe-indicator';
    indicator.textContent = '?';
    indicator.style.fontSize = '24px';
    indicator.style.fontWeight = 'bold';
    indicator.style.position = 'absolute';
    indicator.style.top = '50%';
    indicator.style.left = '50%';
    indicator.style.transform = 'translate(-50%, -50%)';
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
    if (inp === true) { indicator.textContent = '1'; indicator.style.color = '#4ec9b0'; }
    else if (inp === false) { indicator.textContent = '0'; indicator.style.color = '#f44747'; }
    else { indicator.textContent = 'Z'; indicator.style.color = '#888'; }
  }
}
