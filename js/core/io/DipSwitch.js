import { Component } from '../Component.js';

export class DipSwitch extends Component {
  static label = 'Toggle Switch';
  constructor(id) {
    super(id, 'DipSwitch', 0, 1);
    this.outputs[0].value = false;
  }

  toggle() {
    this.outputs[0].value = !this.outputs[0].value;
    this._updateAppearance();
    this._updateConnectorStates();
    this.computeOutput();   // triggers engine-wrapped propagation
  }

  computeNextState() {
    // Return the current output value (already toggled by toggle())
    return { outputs: [this.outputs[0].value] };
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
    this.outputs[0].value = false;
    this._updateAppearance();
    this._updateConnectorStates();
  }

  /**
   * FIX (Bug #5): resetState() preserves the user's toggle position.
   * Only sequential component state should be reset, not input positions.
   */
  resetState() {
    // Preserve current switch state – do nothing
    this._updateAppearance();
    this._updateConnectorStates();
  }

  _updateAppearance() {
    if (this.element) {
      const isOn = this.outputs[0].value === true;
      this.element.classList.toggle('on', isOn);
      // Update switch track background
      const track = this.element.querySelector('.switch-track');
      if (track) {
        track.style.background = isOn
          ? 'var(--color-accent)'
          : 'var(--color-surface-alt)';
      }
      // Update knob position
      const knob = this.element.querySelector('.switch-knob');
      if (knob) {
        knob.style.left = isOn ? '15px' : '1px';
      }
    }
  }

  render(container) {
    const H = 3 * this.GRID; // 60
    const W = 3 * this.GRID; // 60
    const el = document.createElement('div');
    el.className = 'component dip-switch';
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    // Switch toggle track — looks like a real toggle switch
    const switchTrack = document.createElement('div');
    switchTrack.className = 'switch-track';
    switchTrack.style.position = 'absolute';
    switchTrack.style.top = '50%';
    switchTrack.style.left = '50%';
    switchTrack.style.transform = 'translate(-50%, -50%)';
    switchTrack.style.width = '28px';
    switchTrack.style.height = '14px';
    switchTrack.style.borderRadius = '7px';
    switchTrack.style.border = '1px solid #666';
    switchTrack.style.cursor = 'pointer';
    switchTrack.style.boxSizing = 'border-box';
    switchTrack.style.transition = 'background 0.2s';
    switchTrack.style.background = this.outputs[0].value
      ? 'var(--color-accent)'
      : 'var(--color-surface-alt)';

    // Sliding toggle knob
    const knob = document.createElement('div');
    knob.className = 'switch-knob';
    knob.style.width = '10px';
    knob.style.height = '10px';
    knob.style.borderRadius = '50%';
    knob.style.background = '#fff';
    knob.style.position = 'absolute';
    knob.style.top = '1px';
    knob.style.transition = 'left 0.2s';
    knob.style.left = this.outputs[0].value ? '15px' : '1px';
    knob.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';
    switchTrack.appendChild(knob);

    el.appendChild(switchTrack);

    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'O0', this.GRID));

    el.addEventListener('click', (e) => {
      // FIX (Bug #12): Skip toggle if clicking on or near a connector,
      // or if a wiring preview path exists (wiring mode is active).
      if (e.target.classList.contains('connector') || e.target.closest('.connector')) return;
      // Also check if there's an active wiring preview on the page
      if (document.querySelector('.wire-preview')) return;
      this.toggle();
    });

    // Note: Touch toggle is now handled by CanvasTouch._onTouchEnd()
    // to avoid double-toggle. CanvasTouch calls e.preventDefault() on
    // touchstart for DipSwitch, then handles toggle in touchend.
    // The click handler above still serves as fallback for mouse users.

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateAppearance();
    this._updateConnectorStates();
  }
}