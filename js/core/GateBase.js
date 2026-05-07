import { Component } from './Component.js';   // ← fixed relative path

/**
 * Shared base for all logic gates.
 * Subclasses must implement computeNextState() and provide
 * static label. They can also override getProperties() / setProperty().
 */
export class GateBase extends Component {
  /**
   * @param {HTMLElement} container – DOM element where the gate will be appended
   * @param {string} bodyText – label displayed inside the gate (e.g. 'AND')
   */
  render(container, bodyText = 'GATE') {
    const n = this.inputs.length;
    const H = Math.max(3, n + 1) * this.GRID;
    const el = document.createElement('div');
    el.className = `component gate ${this.type.toLowerCase()}-gate`;
    el.style.width = `${4 * this.GRID}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'gate-body';
    body.textContent = bodyText;
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    el.appendChild(body);

    // Input connectors
    for (let i = 0; i < n; i++) {
      el.appendChild(this._createConnectorBlock(this.inputs[i], true, `I${i}`, (i + 1) * this.GRID));
    }
    // Output connector (vertically centred)
    const outY = Math.floor(H / (2 * this.GRID)) * this.GRID;
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'O0', outY));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}