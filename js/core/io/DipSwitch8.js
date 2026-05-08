import { Component } from '../Component.js';

export class DipSwitch8 extends Component {
  static label = 'DIP Switch';
  constructor(id, switchCount = 8) {
    switchCount = Math.max(2, Math.min(8, parseInt(switchCount, 10) || 8));
    super(id, 'DipSwitch8', 0, switchCount);
    this._switchCount = switchCount;
    this.outputs.forEach(o => o.value = false);
  }

  get switchCount() { return this._switchCount; }

  toggleBit(bit) {
    if (bit < 0 || bit >= this._switchCount) return;
    this.outputs[bit].value = !this.outputs[bit].value;
    this._updateAppearance();
    this._updateConnectorStates();
    this.computeOutput();   // triggers engine-wrapped propagation
  }

  computeNextState() {
    return { outputs: this.outputs.map(o => o.value) };
  }

  applyNextState(nextState) {
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

  resetState() {
    this._updateAppearance();
    this._updateConnectorStates();
  }

  _updateVisual() {
    this._updateAppearance();
  }

  getProperties() {
    return [{ name: 'switches', label: 'Switches', type: 'number', value: this._switchCount, min: 2, max: 8, step: 1 }];
  }

  setProperty(name, value) {
    if (name === 'switches') {
      const newCount = parseInt(value, 10);
      if (newCount === this._switchCount || newCount < 2 || newCount > 8) return false;

      // Disconnect wires for outputs being removed
      if (newCount < this._switchCount) {
        for (let i = newCount; i < this._switchCount; i++) {
          const out = this.outputs[i];
          if (out) {
            const wiresToRemove = this._engine?.wires.filter(w => w.from.nodeId === out.id);
            if (wiresToRemove) {
              wiresToRemove.forEach(w => {
                this._engine.disconnect(w.id);
                document.dispatchEvent(new CustomEvent('wire-removed', { detail: { wireId: w.id } }));
              });
            }
          }
        }
      }

      const oldOutputs = this.outputs.map(o => ({ value: o.value }));
      this._switchCount = newCount;

      // Rebuild outputs array
      this.outputs = [];
      for (let i = 0; i < newCount; i++) {
        this.outputs.push({
          id: `${this.id}.output.${i}`,
          value: i < oldOutputs.length ? oldOutputs[i].value : false
        });
      }

      this.rerender();
      return true;
    }
    return false;
  }

  _updateAppearance() {
    if (this.element) {
      this.element.querySelectorAll('.dip-bit').forEach(sq => {
        const bit = parseInt(sq.dataset.bit);
        if (bit >= this._switchCount) return;
        const isOn = this.outputs[bit].value;
        sq.style.background = isOn
          ? 'var(--color-accent)'
          : 'var(--color-surface-alt)';
        const knob = sq.querySelector('.dip-knob');
        if (knob) {
          knob.style.left = isOn ? '11px' : '1px';
        }
      });
    }
  }

  render(container) {
    const n = this._switchCount;
    const H = (n + 1) * this.GRID;
    const W = 5 * this.GRID;
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
    body.textContent = `DIP${n}`;
    body.style.position = 'absolute';
    body.style.top = '10px';
    body.style.left = '50%';
    body.style.transform = 'translateX(-50%)';
    el.appendChild(body);

    // Connectors & toggle switches (bit n-1 top)
    for (let idx = 0; idx < n; idx++) {
      const bit = (n - 1) - idx;
      const yCenter = (idx + 1) * this.GRID;

      // Output connector on the RIGHT side
      el.appendChild(
        this._createConnectorBlock(this.outputs[bit], false, `O${bit}`, yCenter)
      );

      // DIP toggle switch on the LEFT side
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
      switchTrack.style.padding = '4px';
      switchTrack.style.marginTop = '-4px';
      switchTrack.style.marginLeft = '-2px';

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
      switchTrack.addEventListener('touchend', (e) => {
        e.stopPropagation();
        e.preventDefault();
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
  }
}
