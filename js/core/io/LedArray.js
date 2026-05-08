import { Component } from '../Component.js';

/**
 * LED Array — a row of configurable LEDs (2–8, default 8).
 * Each LED has its own input and lights up independently.
 * Useful for visualizing byte values or multi-bit signals
 * without placing many separate LED components.
 *
 * The component displays a compact horizontal row of circular LEDs
 * with a binary value label showing the current numeric value.
 */
export class LedArray extends Component {
  static label = 'LED Array';
  static category = 'Outputs';

  constructor(id, ledCount = 8) {
    ledCount = Math.max(2, Math.min(8, parseInt(ledCount, 10) || 8));
    super(id, 'LedArray', ledCount, 0);
    this._ledCount = ledCount;
  }

  get ledCount() { return this._ledCount; }

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
    this.inputs.forEach(i => i.value = false);
    this._updateAppearance();
    this._updateConnectorStates();
  }

  resetState() {
    this._updateAppearance();
    this._updateConnectorStates();
  }

  getProperties() {
    return [{ name: 'leds', label: 'LEDs', type: 'number', value: this._ledCount, min: 2, max: 8, step: 1 }];
  }

  setProperty(name, value) {
    if (name === 'leds') {
      const newCount = parseInt(value, 10);
      if (isNaN(newCount) || newCount === this._ledCount || newCount < 2 || newCount > 8) return false;

      // Disconnect wires for inputs being removed
      if (newCount < this._ledCount) {
        for (let i = newCount; i < this._ledCount; i++) {
          const inp = this.inputs[i];
          if (inp && inp.connectedTo) {
            const wire = this._engine?.wires.find(w => w.to.nodeId === inp.id);
            if (wire && this._engine) {
              this._engine.disconnect(wire.id);
              document.dispatchEvent(new CustomEvent('wire-removed', { detail: { wireId: wire.id } }));
            }
          }
        }
      }

      const oldInputs = this.inputs.map(inp => ({ value: inp.value, connectedTo: inp.connectedTo }));
      this._ledCount = newCount;

      // Rebuild inputs array
      this.inputs = [];
      for (let i = 0; i < newCount; i++) {
        this.inputs.push({
          id: `${this.id}.input.${i}`,
          value: i < oldInputs.length ? oldInputs[i].value : false,
          connectedTo: (i < oldInputs.length && oldInputs[i].connectedTo) ? oldInputs[i].connectedTo : null
        });
      }

      if (this._engine) {
        this._engine.reindexComponent(this);
      }

      this.rerender();
      return true;
    }
    return false;
  }

  _updateAppearance() {
    if (!this.element) return;
    const circles = this.element.querySelectorAll('.led-array-circle');
    circles.forEach(circle => {
      const bit = parseInt(circle.dataset.bit);
      if (bit >= this._ledCount) return;
      const lit = this.inputs[bit]?.value === true;
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
        val = (val << 1) | (this.inputs[i]?.value ? 1 : 0);
      }
      valueLabel.textContent = val.toString(2).padStart(this._ledCount, '0');
    }
  }

  render(container) {
    const n = this._ledCount;
    // Height scales with number of inputs so connectors don't overlap
    const H = (n + 1) * this.GRID;
    const ledSize = 16;
    const ledSpacing = 20;
    const W = Math.max(6 * this.GRID, n * ledSpacing + 24);
    const el = document.createElement('div');
    el.className = 'component led-array';
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    // Title label
    const body = document.createElement('div');
    body.className = 'dip8-body';
    body.textContent = `LED${n}`;
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
      val = (val << 1) | (this.inputs[i]?.value ? 1 : 0);
    }
    valueLabel.textContent = val.toString(2).padStart(n, '0');
    el.appendChild(valueLabel);

    // Input connectors — each LED has its own input, spaced evenly
    for (let i = 0; i < n; i++) {
      const yCenter = (i + 1) * this.GRID;
      el.appendChild(this._createConnectorBlock(this.inputs[i], true, `I${i}`, yCenter));
    }

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateAppearance();
    this._updateConnectorStates();
  }
}
