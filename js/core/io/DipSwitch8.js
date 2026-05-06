// js/core/DipSwitch8.js
import { Component } from '../Component.js';

export class DipSwitch8 extends Component {
  static label = 'DIP-8';
  constructor(id) {
    super(id, 'DipSwitch8', 0, 8);
    this.outputs.forEach(o => o.value = false);
  }

  toggleBit(bit) {
    this.outputs[bit].value = !this.outputs[bit].value;
    this._updateConnectorStates();
    this.computeOutput();
  }

  computeOutput() { return this.outputs; }

  render(container) {
    const H = 9 * this.GRID;               // 160px
    const W = 5 * this.GRID;               // 100px (wider)
    const el = document.createElement('div');
    el.className = 'component dipswitch8';
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'dip8-body';
    body.textContent = 'DIP8';
    body.style.position = 'absolute';
    body.style.top = '10px';
    body.style.left = '50%';
    body.style.transform = 'translateX(-50%)';
    el.appendChild(body);

    // Connectors & toggle squares (bit7 top)
    for (let idx = 0; idx < 8; idx++) {
      const bit = 7 - idx;
      const yCenter = (idx + 1) * this.GRID;   // 20,40,...,160

      // Output connector on the RIGHT side inside the box
      el.appendChild(
        this._createConnectorBlock(this.outputs[bit], false, `O${bit}`, yCenter)
      );

      // Toggle square on the LEFT side
      const square = document.createElement('div');
      square.className = 'dip-bit';
      square.dataset.bit = bit;
      square.style.position = 'absolute';
      square.style.left = '10px';
      square.style.top = `${yCenter - 4}px`;
      square.style.width = '16px';
      square.style.height = '8px';
      square.style.background = this.outputs[bit].value
        ? 'var(--color-accent)'
        : 'var(--color-surface)';
      square.style.border = '1px solid #666';
      square.style.cursor = 'pointer';
      square.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleBit(parseInt(square.dataset.bit));
      });
      el.appendChild(square);
    }

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }

  _updateConnectorStates() {
    super._updateConnectorStates();
    if (this.element) {
      this.element.querySelectorAll('.dip-bit').forEach(sq => {
        const bit = parseInt(sq.dataset.bit);
        sq.style.background = this.outputs[bit].value
          ? 'var(--color-accent)'
          : 'var(--color-surface)';
      });
    }
  }
}