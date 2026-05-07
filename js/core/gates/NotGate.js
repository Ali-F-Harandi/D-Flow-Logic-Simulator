import { Component } from '../Component.js';

export class NotGate extends Component {
  static label = 'NOT';
  constructor(id) {
    super(id, 'NOT', 1, 1);
  }

  computeNextState() {
    return { outputs: [!this.inputs[0].value] };
  }

  getProperties() { return []; }

  render(container) {
    const H = 3 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component gate not-gate';
    el.style.width = `${4 * this.GRID}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'gate-body';
    body.textContent = 'NOT';
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    el.appendChild(body);

    el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'I0', this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'O0', this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}
