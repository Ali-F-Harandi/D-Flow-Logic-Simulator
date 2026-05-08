import { Component } from '../Component.js';

/**
 * Single-pole toggle switch — outputs HIGH or LOW.
 * Renamed from DipSwitch (the old single-switch component).
 * Type string changed from 'DipSwitch' to 'ToggleSwitch'.
 */
export class ToggleSwitch extends Component {
  static label = 'Toggle Switch';
  constructor(id) {
    super(id, 'ToggleSwitch', 0, 1);
    this.outputs[0].value = false;
  }

  toggle() {
    this.outputs[0].value = !this.outputs[0].value;
    this._updateAppearance();
    this._updateConnectorStates();
    this.computeOutput();   // triggers engine-wrapped propagation
  }

  computeNextState() {
    return { outputs: [this.outputs[0].value] };
  }

  applyNextState(nextState) {
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

  resetState() {
    this._updateAppearance();
    this._updateConnectorStates();
  }

  _updateAppearance() {
    if (this.element) {
      const isOn = this.outputs[0].value === true;
      this.element.classList.toggle('on', isOn);
      const track = this.element.querySelector('.switch-track');
      if (track) {
        track.style.background = isOn
          ? 'var(--color-accent)'
          : 'var(--color-surface-alt)';
      }
      const knob = this.element.querySelector('.switch-knob');
      if (knob) {
        knob.style.left = isOn ? '15px' : '1px';
      }
    }
  }

  render(container) {
    const H = 3 * this.GRID;
    const W = 3 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component dip-switch toggle-switch';
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

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
      if (e.target.classList.contains('connector') || e.target.closest('.connector')) return;
      if (document.querySelector('.wire-preview')) return;
      // Skip toggle if mouse was dragged (drag-move, not click)
      if (this._dragOccurred) { this._dragOccurred = false; return; }
      this.toggle();
    });

    // Track mouse movement to distinguish click from drag
    el.addEventListener('mousedown', () => { this._dragOccurred = false; });
    el.addEventListener('mousemove', () => { this._dragOccurred = true; });

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateAppearance();
    this._updateConnectorStates();
  }
}
