import { Component } from '../Component.js';
import { Value } from '../simulation/Value.js';

/**
 * LED / Light Bulb — displays a single-bit or bus signal.
 * If connected input has width > 1, shows the bus value in hex
 * and lights up if any bit is set.
 */
export class LightBulb extends Component {
  static label = 'LED';
  constructor(id) {
    super(id, 'LightBulb', 1, 0);
  }

  computeNextState() {
    // No outputs to compute, but we need to signal that display should update
    return { outputs: [] };
  }

  applyNextState(nextState) {
    // No outputs to apply, but update visual based on current input values
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

  render(container) {
    const inpWidth = this.inputs[0]?.width || 1;
    const isBus = inpWidth > 1;
    const H = isBus ? 4 * this.GRID : 3 * this.GRID;          // 60px / 80px
    const W = isBus ? 4 * this.GRID : 3 * this.GRID;          // 80px / 60px
    const el = document.createElement('div');
    el.className = 'component light-bulb' + (isBus ? ' bus-component' : '');
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    // SVG circle – exactly in the center, use unique class instead of id
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const svgSize = isBus ? 36 : 40;
    svg.setAttribute('width', String(svgSize));
    svg.setAttribute('height', String(svgSize));
    svg.setAttribute('viewBox', `0 0 ${svgSize} ${svgSize}`);
    svg.style.position = 'absolute';
    svg.style.top = `${(H - svgSize) / (isBus ? 1.5 : 2)}px`;
    svg.style.left = `${(W - svgSize) / 2}px`;
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(svgSize / 2));
    circle.setAttribute('cy', String(svgSize / 2));
    circle.setAttribute('r', String(svgSize / 2 - 4));
    const rootStyle = getComputedStyle(document.documentElement);
    const offFill = rootStyle.getPropertyValue('--led-off-fill').trim() || '#333';
    const offStroke = rootStyle.getPropertyValue('--led-off-stroke').trim() || '#666';
    circle.setAttribute('fill', offFill);
    circle.setAttribute('stroke', offStroke);
    circle.setAttribute('stroke-width', '2');
    circle.classList.add('led-circle');
    svg.appendChild(circle);
    el.appendChild(svg);

    // Bus value label (only for bus inputs)
    if (isBus) {
      const valueLabel = document.createElement('div');
      valueLabel.className = 'bus-value-label';
      valueLabel.style.cssText = `
        position: absolute; bottom: 2px; left: 0; right: 0;
        text-align: center; font-family: monospace; font-size: 9px;
        color: var(--bus-indicator-color, #5b9bd5); font-weight: bold;
        pointer-events: none;
      `;
      const v = this.inputs[0]?.value;
      if (v instanceof Value) {
        valueLabel.textContent = v.toHexString();
      } else {
        valueLabel.textContent = '0x0';
      }
      el.appendChild(valueLabel);
    }

    // Input connector – grid‑aligned at y = 20 (center of component)
    el.appendChild(this._createConnectorBlock(
      this.inputs[0], true, isBus ? `I/${inpWidth}` : 'I0', 1 * this.GRID
    ));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateAppearance();
  }

  _updateAppearance() {
    if (!this.element) return;
    const circle = this.element.querySelector('.led-circle');
    if (!circle) return;

    const inp = this.inputs[0]?.value;
    const isBus = this.inputs[0]?.width > 1;

    // Determine if "lit" — any bit set for bus, or true for single-bit
    let lit;
    if (isBus && inp instanceof Value) {
      lit = inp.value !== 0 || inp.error !== 0;
    } else {
      lit = inp === true;
    }

    const style = getComputedStyle(document.documentElement);
    const onFill = style.getPropertyValue('--led-on-fill').trim() || '#ff4444';
    const onStroke = style.getPropertyValue('--led-on-stroke').trim() || '#ff8888';
    const offFill = style.getPropertyValue('--led-off-fill').trim() || '#333';
    const offStroke = style.getPropertyValue('--led-off-stroke').trim() || '#666';
    const glow = style.getPropertyValue('--led-glow').trim() || 'drop-shadow(0 0 6px rgba(255,0,0,0.8))';
    circle.setAttribute('fill', lit ? onFill : offFill);
    circle.setAttribute('stroke', lit ? onStroke : offStroke);
    circle.style.filter = lit ? glow : 'none';

    // Update bus value label
    if (isBus) {
      const valueLabel = this.element.querySelector('.bus-value-label');
      if (valueLabel && inp instanceof Value) {
        valueLabel.textContent = inp.toHexString();
      }
    }
  }
}
