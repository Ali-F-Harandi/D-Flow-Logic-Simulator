import { Component } from '../Component.js';

export class HighConstant extends Component {
  static label = 'HIGH (1)';
  static category = 'Inputs';

  constructor(id) {
    super(id, 'HighConstant', 0, 1);
    this.outputs[0].value = true;
  }

  computeNextState() {
    return { outputs: [true] };
  }

  applyNextState(nextState) {
    this.outputs[0].value = true;
    this._updateConnectorStates();
  }

  reset() {
    this.outputs[0].value = true;
    this._updateConnectorStates();
  }

  resetState() {
    this.outputs[0].value = true;
    this._updateConnectorStates();
  }

  getProperties() { return []; }

  render(container) {
    const H = 2 * this.GRID;
    const W = 3 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component high-constant';
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'gate-body component-body-centered';
    body.textContent = '1';
    body.style.color = 'var(--color-success)';
    body.style.fontWeight = 'bold';
    body.style.fontSize = '18px';
    el.appendChild(body);

    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'O0', this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}
