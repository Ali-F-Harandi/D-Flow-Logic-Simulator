import { Component } from '../Component.js';

export class DipSwitch extends Component {
  static label = 'Toggle Switch';
  constructor(id) {
    super(id, 'DipSwitch', 0, 1);
    this.outputs[0].value = false;
  }

  toggle() {
    this.outputs[0].value = !this.outputs[0].value;
    this.computeOutput();   // triggers two‑phase + scheduling
  }

  // Override computeNextState to return current output (no inputs)
  computeNextState() {
    return { outputs: [this.outputs[0].value] };
  }

  render(container) {
    const H = 3 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component dip-switch';
    el.style.width = `${3 * this.GRID}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'switch-body';
    body.textContent = 'SW';
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    body.style.fontWeight = 'bold';
    body.style.transition = 'color 0.2s';
    el.appendChild(body);

    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'O0', this.GRID));

    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('connector')) return;
      this.toggle();
    });

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateAppearance();
    this._updateConnectorStates();
  }

  _updateAppearance() {
    if (this.element) {
      const isOn = this.outputs[0].value === true;
      this.element.classList.toggle('on', isOn);
      const body = this.element.querySelector('.switch-body');
      if (body) {
        body.style.color = isOn ? '#ffffff' : 'var(--color-text)';
      }
    }
  }
}