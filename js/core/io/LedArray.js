import { Component } from '../Component.js';
import { Value } from '../simulation/Value.js';

/**
 * LED Array — a row of configurable LEDs (2–8, default 8).
 * Each LED has its own input and lights up independently.
 * Useful for visualizing byte values or multi-bit signals
 * without placing many separate LED components.
 *
 * The component displays a compact horizontal row of circular LEDs
 * with a binary value label showing the current numeric value.
 *
 * Bus input mode: When busInput=true, accepts a single N-bit bus
 * input instead of N individual 1-bit inputs. Each LED corresponds
 * to one bit of the bus value.
 */
export class LedArray extends Component {
  static label = 'LED Array';
  static category = 'Outputs';

  constructor(id, ledCount = 8) {
    ledCount = Math.max(2, Math.min(8, parseInt(ledCount, 10) || 8));
    super(id, 'LedArray', ledCount, 0);
    this._ledCount = ledCount;
    this._busInput = false; // default: individual bit inputs
  }

  get ledCount() { return this._ledCount; }
  get busInput() { return this._busInput; }

  computeNextState() {
    // No outputs to compute — this is a display-only component
    return { outputs: [] };
  }

  applyNextState(nextState) {
    this._updateAppearance();
    this._updateConnectorStates();
  }

  setInputValue(index, value) {
    if (this.inputs[index]) {
      this.inputs[index].value = value;
      this._updateAppearance();
      this._updateConnectorStates();
    }
  }

  reset() {
    if (this._busInput && this.inputs.length > 0) {
      this.inputs[0].value = Value.createKnown(this._ledCount, 0);
    } else {
      this.inputs.forEach(i => i.value = false);
    }
    this._updateAppearance();
    this._updateConnectorStates();
  }

  resetState() {
    this._updateAppearance();
    this._updateConnectorStates();
  }

  /**
   * Get the bit value at a specific index, handling both bus and individual modes.
   * @param {number} bitIndex
   * @returns {boolean}
   */
  _getBitValue(bitIndex) {
    if (this._busInput && this.inputs.length > 0) {
      const v = this.inputs[0].value;
      if (v instanceof Value) {
        const bitVal = v.get(bitIndex);
        return bitVal === Value.TRUE;
      }
      return false;
    }
    return this.inputs[bitIndex]?.value === true;
  }

  getProperties() {
    const props = [
      { name: 'leds', label: 'LEDs', type: 'number', value: this._ledCount, min: 2, max: 8, step: 1 },
      { name: 'busInput', label: 'Bus Input', type: 'select', value: this._busInput ? 'true' : 'false', options: ['false', 'true'] },
      ...super.getProperties().filter(p => p.name !== 'bitWidth')
    ];
    return props;
  }

  setProperty(name, value) {
    if (name === 'busInput') {
      const newBusInput = value === 'true' || value === true;
      if (newBusInput === this._busInput) return false;

      // Disconnect all wires on inputs (they will be rebuilt)
      if (this._engine) {
        const wiresToRemove = this._engine.wires.filter(w =>
          w.to.componentId === this.id
        );
        wiresToRemove.forEach(w => {
          this._engine.disconnect(w.id);
          document.dispatchEvent(new CustomEvent('wire-removed', { detail: { wireId: w.id } }));
        });
      }

      this._busInput = newBusInput;

      if (newBusInput) {
        // Single bus input with width = ledCount
        this.inputs = [{
          id: `${this.id}.input.0`,
          value: Value.createKnown(this._ledCount, 0),
          width: this._ledCount,
          connectedTo: null
        }];
        this.bitWidth = this._ledCount;
      } else {
        // Individual 1-bit inputs
        this.inputs = [];
        for (let i = 0; i < this._ledCount; i++) {
          this.inputs.push({
            id: `${this.id}.input.${i}`,
            value: false,
            width: 1,
            connectedTo: null
          });
        }
        this.bitWidth = 1;
      }

      if (this._engine) this._engine.reindexComponent(this);
      this.rerender();
      return true;
    }

    if (name === 'leds') {
      const newCount = parseInt(value, 10);
      if (isNaN(newCount) || newCount === this._ledCount || newCount < 2 || newCount > 8) return false;

      // Disconnect wires for inputs being removed
      if (this._engine) {
        const wiresToRemove = this._engine.wires.filter(w =>
          w.to.componentId === this.id
        );
        wiresToRemove.forEach(w => {
          this._engine.disconnect(w.id);
          document.dispatchEvent(new CustomEvent('wire-removed', { detail: { wireId: w.id } }));
        });
      }

      this._ledCount = newCount;

      // Rebuild inputs array
      if (this._busInput) {
        this.inputs = [{
          id: `${this.id}.input.0`,
          value: Value.createKnown(newCount, 0),
          width: newCount,
          connectedTo: null
        }];
        this.bitWidth = newCount;
      } else {
        this.inputs = [];
        for (let i = 0; i < newCount; i++) {
          this.inputs.push({
            id: `${this.id}.input.${i}`,
            value: false,
            width: 1,
            connectedTo: null
          });
        }
        this.bitWidth = 1;
      }

      if (this._engine) {
        this._engine.reindexComponent(this);
      }

      this.rerender();
      return true;
    }

    if (super.setProperty(name, value)) return true;
    return false;
  }

  _updateAppearance() {
    if (!this.element) return;
    const circles = this.element.querySelectorAll('.led-array-circle');
    circles.forEach(circle => {
      const bit = parseInt(circle.dataset.bit);
      if (bit >= this._ledCount) return;
      const lit = this._getBitValue(bit);
      const style = getComputedStyle(document.documentElement);
      const onFill = style.getPropertyValue('--led-on-fill').trim() || '#ff4444';
      const onStroke = style.getPropertyValue('--led-on-stroke').trim() || '#ff8888';
      const offFill = style.getPropertyValue('--led-off-fill').trim() || '#333';
      const offStroke = style.getPropertyValue('--led-off-stroke').trim() || '#666';
      const glow = style.getPropertyValue('--led-glow').trim() || 'drop-shadow(0 0 6px rgba(255,0,0,0.8))';
      circle.setAttribute('fill', lit ? onFill : offFill);
      circle.setAttribute('stroke', lit ? onStroke : offStroke);
      circle.style.filter = lit ? glow : 'none';
    });

    // Update binary value label
    const valueLabel = this.element.querySelector('.led-array-value');
    if (valueLabel) {
      let val = 0;
      for (let i = this._ledCount - 1; i >= 0; i--) {
        val = (val << 1) | (this._getBitValue(i) ? 1 : 0);
      }
      valueLabel.textContent = val.toString(2).padStart(this._ledCount, '0');
    }
  }

  render(container) {
    const n = this._ledCount;
    const isBus = this._busInput;
    const H = isBus ? 3 * this.GRID : (n + 1) * this.GRID;
    const ledSize = 16;
    const ledSpacing = 20;
    const W = Math.max(6 * this.GRID, n * ledSpacing + 24);
    const el = document.createElement('div');
    el.className = 'component led-array' + (isBus ? ' bus-component' : '');
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    // Title label
    const body = document.createElement('div');
    body.className = 'dip8-body';
    body.textContent = isBus ? `LED${n}/BUS` : `LED${n}`;
    body.style.position = 'absolute';
    body.style.top = '4px';
    body.style.left = '50%';
    body.style.transform = 'translateX(-50%)';
    el.appendChild(body);

    // SVG for the LED circles — positioned in center of component
    const svgTop = 16;
    const svgH = 24;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(W - 10));
    svg.setAttribute('height', String(svgH));
    svg.setAttribute('viewBox', `0 0 ${W - 10} ${svgH}`);
    svg.style.position = 'absolute';
    svg.style.top = `${svgTop}px`;
    svg.style.left = '5px';

    const style = getComputedStyle(document.documentElement);
    const offFill = style.getPropertyValue('--led-off-fill').trim() || '#333';
    const offStroke = style.getPropertyValue('--led-off-stroke').trim() || '#666';

    for (let i = 0; i < n; i++) {
      // LEDs displayed from MSB (left) to LSB (right)
      const bit = (n - 1) - i;
      const cx = 8 + i * ledSpacing + ledSize / 2;
      const cy = svgH / 2;

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(cx));
      circle.setAttribute('cy', String(cy));
      circle.setAttribute('r', String(ledSize / 2 - 2));
      circle.setAttribute('fill', offFill);
      circle.setAttribute('stroke', offStroke);
      circle.setAttribute('stroke-width', '1.5');
      circle.classList.add('led-array-circle');
      circle.dataset.bit = String(bit);
      svg.appendChild(circle);
    }
    el.appendChild(svg);

    // Binary value label at the bottom
    const valueLabel = document.createElement('div');
    valueLabel.className = 'led-array-value';
    valueLabel.style.cssText = `
      position: absolute; bottom: 2px; left: 0; right: 0;
      text-align: center; font-family: monospace; font-size: 8px;
      color: var(--color-text-muted); pointer-events: none;
    `;
    let val = 0;
    for (let i = n - 1; i >= 0; i--) {
      val = (val << 1) | (this._getBitValue(i) ? 1 : 0);
    }
    valueLabel.textContent = val.toString(2).padStart(n, '0');
    el.appendChild(valueLabel);

    // Input connectors
    if (isBus) {
      // Single bus input
      el.appendChild(this._createConnectorBlock(this.inputs[0], true, `I[0:${n-1}]`, 1 * this.GRID));
    } else {
      // Individual bit inputs — each LED has its own input, spaced evenly
      for (let i = 0; i < n; i++) {
        const yCenter = (i + 1) * this.GRID;
        el.appendChild(this._createConnectorBlock(this.inputs[i], true, `I${i}`, yCenter));
      }
    }

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateAppearance();
    this._updateConnectorStates();
  }
}
