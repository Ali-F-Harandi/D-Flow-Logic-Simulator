import { Component } from '../Component.js';

export class DipSwitch8 extends Component {
  static label = 'DIP-8';
  constructor(id) {
    super(id, 'DipSwitch8', 0, 8);
    this.outputs.forEach(o => o.value = false);
  }

  toggleBit(bit) {
    this.outputs[bit].value = !this.outputs[bit].value;
    this._updateAppearance();
    this._updateConnectorStates();
    this.computeOutput();   // triggers engine-wrapped propagation
  }

  computeNextState() {
    // Return current output values (already toggled by toggleBit())
    return { outputs: this.outputs.map(o => o.value) };
  }

  applyNextState(nextState) {
    // Apply outputs and update visuals
    for (let i = 0; i < this.outputs.length; i++) {
      this.outputs[i].value = nextState.outputs[i];
    }
    this._updateAppearance();
    this._updateConnectorStates();
  }

  reset() {
    this.outputs.forEach(o => o.value = false);
    this._updateAppearance();
    this._updateConnectorStates();
  }

  /**
   * FIX (Bug #5): resetState() preserves the user's toggle positions.
   * Only sequential component state should be reset, not input positions.
   */
  resetState() {
    this._updateAppearance();
    this._updateConnectorStates();
  }

  /**
   * Alias for _updateAppearance so TruthTablePanel can call either method.
   */
  _updateVisual() {
    this._updateAppearance();
  }

  _updateAppearance() {
    if (this.element) {
      this.element.querySelectorAll('.dip-bit').forEach(sq => {
        const bit = parseInt(sq.dataset.bit);
        sq.style.background = this.outputs[bit].value
          ? 'var(--color-accent)'
          : 'var(--color-surface)';
      });
    }
  }

  render(container) {
    const H = 9 * this.GRID;               // 180px
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
    body.className = 'dip8-body component-body-centered';
    body.textContent = 'DIP8';
    body.style.position = 'absolute';
    body.style.top = '10px';
    body.style.left = '50%';
    body.style.transform = 'translateX(-50%)';
    el.appendChild(body);

    // Connectors & toggle squares (bit7 top)
    for (let idx = 0; idx < 8; idx++) {
      const bit = 7 - idx;
      const yCenter = (idx + 1) * this.GRID;

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
    this._updateAppearance();
  }

  _updateConnectorStates() {
    super._updateConnectorStates();
    // M-13: Removed duplicate _updateAppearance() call here.
    // super._updateConnectorStates() already calls _updateBorderState(),
    // and toggleBit/reset call _updateAppearance() directly.
  }
}