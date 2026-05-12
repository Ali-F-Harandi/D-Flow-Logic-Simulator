import { Component } from '../Component.js';
import { Value } from '../simulation/Value.js';

/**
 * Single-pole toggle switch — outputs HIGH or LOW.
 * Renamed from DipSwitch (the old single-switch component).
 * Type string changed from 'DipSwitch' to 'ToggleSwitch'.
 *
 * Bus output mode: When bitWidth > 1, the output is a multi-bit Value.
 * Clicking cycles through values from 0 to (2^bitWidth - 1).
 * The outputValue property sets the numeric output value directly.
 */
export class ToggleSwitch extends Component {
  static label = 'Toggle Switch';
  constructor(id) {
    super(id, 'ToggleSwitch', 0, 1);
    this._label = '';
    this.outputs[0].value = false;
    // bitWidth inherited from Component (default 1)
    this._outputValue = 0; // for bus mode: the current numeric value
  }

  toggle() {
    if (this.bitWidth > 1) {
      // Bus mode: cycle through values 0..(2^bitWidth - 1)
      const maxVal = (1 << this.bitWidth) - 1;
      this._outputValue = (this._outputValue + 1) & maxVal;
      this.outputs[0].value = Value.createKnown(this.bitWidth, this._outputValue);
    } else {
      this.outputs[0].value = !this.outputs[0].value;
    }
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
    if (this.bitWidth > 1) {
      this._outputValue = 0;
      this.outputs[0].value = Value.createKnown(this.bitWidth, 0);
    } else {
      this.outputs[0].value = false;
    }
    this._updateAppearance();
    this._updateConnectorStates();
  }

  resetState() {
    this._updateAppearance();
    this._updateConnectorStates();
  }

  _updateAppearance() {
    if (this.element) {
      const isOn = this.bitWidth > 1
        ? this._outputValue !== 0
        : this.outputs[0].value === true;
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

      // Update bus value display
      const valueLabel = this.element.querySelector('.bus-value-label');
      if (valueLabel && this.bitWidth > 1) {
        valueLabel.textContent = '0x' + this._outputValue.toString(16).toUpperCase().padStart(Math.ceil(this.bitWidth / 4), '0');
      }
    }
  }

  getProperties() {
    const props = [
      { name: 'bitWidth', label: 'Bit Width', type: 'number', value: this.bitWidth, min: 1, max: 32 },
    ];
    if (this.bitWidth > 1) {
      const maxVal = (1 << this.bitWidth) - 1;
      props.push({ name: 'outputValue', label: 'Output Value', type: 'number', value: this._outputValue, min: 0, max: maxVal });
    }
    props.push(
      { name: 'label', label: 'Label', type: 'text', value: this._label || '' },
      ...super.getProperties().filter(p => p.name !== 'bitWidth')
    );
    return props;
  }

  setProperty(name, value) {
    if (name === 'bitWidth') {
      const w = parseInt(value, 10);
      if (isNaN(w) || w < 1 || w > 32 || w === this.bitWidth) return false;

      // Disconnect wires
      if (this._engine) {
        const wiresToRemove = this._engine.wires.filter(wr =>
          wr.from.componentId === this.id || wr.to.componentId === this.id
        );
        wiresToRemove.forEach(wr => {
          this._engine.disconnect(wr.id);
          document.dispatchEvent(new CustomEvent('wire-removed', { detail: { wireId: wr.id } }));
        });
      }

      this.bitWidth = w;
      const maxVal = (1 << w) - 1;
      this._outputValue = this._outputValue & maxVal;

      // Rebuild output port
      this.outputs = [{
        id: `${this.id}.output.0`,
        value: w > 1 ? Value.createKnown(w, this._outputValue) : false,
        width: w
      }];

      if (this._engine) this._engine.reindexComponent(this);
      this.rerender();
      if (this._engine) this._engine._propagateFrom(this);
      return true;
    }
    if (name === 'outputValue') {
      const v = parseInt(value, 10);
      const maxVal = (1 << this.bitWidth) - 1;
      if (isNaN(v) || v < 0 || v > maxVal) return false;
      this._outputValue = v;
      this.outputs[0].value = this.bitWidth > 1 ? Value.createKnown(this.bitWidth, v) : Boolean(v);
      this._updateAppearance();
      this._updateConnectorStates();
      if (this._engine) this._engine._propagateFrom(this);
      return true;
    }
    if (name === 'label') {
      this._label = String(value);
      this.rerender();
      return true;
    }
    if (super.setProperty(name, value)) return true;
    return false;
  }

  render(container) {
    const isBus = this.bitWidth > 1;
    const H = isBus ? 4 * this.GRID : 3 * this.GRID;
    const W = 3 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component dip-switch toggle-switch' + (isBus ? ' bus-component' : '');
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const switchTrack = document.createElement('div');
    switchTrack.className = 'switch-track';
    switchTrack.style.position = 'absolute';
    switchTrack.style.top = isBus ? '6px' : '50%';
    switchTrack.style.left = '50%';
    switchTrack.style.transform = isBus ? 'translateX(-50%)' : 'translate(-50%, -50%)';
    switchTrack.style.width = '28px';
    switchTrack.style.height = '14px';
    switchTrack.style.borderRadius = '7px';
    switchTrack.style.border = '1px solid #666';
    switchTrack.style.cursor = 'pointer';
    switchTrack.style.boxSizing = 'border-box';
    switchTrack.style.transition = 'background 0.2s';
    const isOn = isBus ? this._outputValue !== 0 : this.outputs[0].value;
    switchTrack.style.background = isOn
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
    knob.style.left = isOn ? '15px' : '1px';
    knob.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';
    switchTrack.appendChild(knob);

    el.appendChild(switchTrack);

    // Bus value label
    if (isBus) {
      const valueLabel = document.createElement('div');
      valueLabel.className = 'bus-value-label';
      valueLabel.style.cssText = `
        position: absolute; top: 26px; left: 0; right: 0;
        text-align: center; font-family: monospace; font-size: 10px;
        color: var(--bus-indicator-color, #5b9bd5); font-weight: bold;
        pointer-events: none;
      `;
      valueLabel.textContent = '0x' + this._outputValue.toString(16).toUpperCase().padStart(Math.ceil(this.bitWidth / 4), '0');
      el.appendChild(valueLabel);
    }

    el.appendChild(this._createConnectorBlock(this.outputs[0], false, isBus ? `O/${this.bitWidth}` : 'O0', isBus ? 2 * this.GRID : this.GRID));

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
