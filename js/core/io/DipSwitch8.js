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
        const isOn = this.outputs[bit].value;
        sq.style.background = isOn
          ? 'var(--color-accent)'
          : 'var(--color-surface-alt)';
        // Update the sliding knob position
        const knob = sq.querySelector('.dip-knob');
        if (knob) {
          knob.style.left = isOn ? '11px' : '1px';
        }
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
    body.className = 'dip8-body';
    body.textContent = 'DIP8';
    body.style.position = 'absolute';
    body.style.top = '10px';
    body.style.left = '50%';
    body.style.transform = 'translateX(-50%)';
    el.appendChild(body);

    // Connectors & toggle switches (bit7 top)
    for (let idx = 0; idx < 8; idx++) {
      const bit = 7 - idx;
      const yCenter = (idx + 1) * this.GRID;

      // Output connector on the RIGHT side inside the box
      el.appendChild(
        this._createConnectorBlock(this.outputs[bit], false, `O${bit}`, yCenter)
      );

      // DIP toggle switch on the LEFT side — looks like a real DIP switch
      // with a sliding toggle indicator inside a rectangular track
      const switchTrack = document.createElement('div');
      switchTrack.className = 'dip-bit';
      switchTrack.dataset.bit = bit;
      switchTrack.style.position = 'absolute';
      switchTrack.style.left = '8px';
      switchTrack.style.top = `${yCenter - 6}px`;
      switchTrack.style.width = '20px';
      switchTrack.style.height = '12px';
      switchTrack.style.borderRadius = '2px';
      switchTrack.style.border = '1px solid #666';
      switchTrack.style.cursor = 'pointer';
      switchTrack.style.boxSizing = 'border-box';
      switchTrack.style.overflow = 'hidden';
      switchTrack.style.transition = 'background 0.15s';
      switchTrack.style.background = this.outputs[bit].value
        ? 'var(--color-accent)'
        : 'var(--color-surface-alt)';
      // Larger touch target for mobile — invisible padding
      switchTrack.style.padding = '4px';
      switchTrack.style.marginTop = '-4px';
      switchTrack.style.marginLeft = '-2px';

      // Sliding toggle knob inside the track
      const knob = document.createElement('div');
      knob.className = 'dip-knob';
      knob.style.width = '8px';
      knob.style.height = '8px';
      knob.style.borderRadius = '1px';
      knob.style.background = '#fff';
      knob.style.position = 'absolute';
      knob.style.top = '1px';
      knob.style.transition = 'left 0.15s';
      knob.style.left = this.outputs[bit].value ? '11px' : '1px';
      knob.style.boxShadow = '0 1px 2px rgba(0,0,0,0.3)';
      switchTrack.appendChild(knob);

      switchTrack.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleBit(parseInt(switchTrack.dataset.bit));
      });
      // Touch support for DIP8 bit toggles on mobile
      switchTrack.addEventListener('touchend', (e) => {
        e.stopPropagation();
        e.preventDefault(); // Prevent duplicate click
        this.toggleBit(parseInt(switchTrack.dataset.bit));
      });
      el.appendChild(switchTrack);
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