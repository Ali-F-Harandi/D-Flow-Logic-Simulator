import { ConnectorRenderer } from '../../utils/ConnectorRenderer.js';

/**
 * Mixin that adds a standard gate rendering method.
 * @param {class} Base - The base class (must be Component or a subclass)
 * @returns {class} - A class that inherits from Base with render() added.
 */
export const GateRendererMixin = (Base) => class extends Base {
  /**
   * Renders the gate component inside a container.
   * @param {HTMLElement} container
   * @param {string} bodyText - label shown in the gate
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
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', `${bodyText} gate`);

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
      el.appendChild(ConnectorRenderer.createBlock(this, this.inputs[i], true, `I${i}`, (i + 1) * this.GRID));
    }
    // Output connector
    const outY = Math.floor(H / (2 * this.GRID)) * this.GRID;
    el.appendChild(ConnectorRenderer.createBlock(this, this.outputs[0], false, 'O0', outY));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
};