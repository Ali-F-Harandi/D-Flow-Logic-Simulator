import { Component } from '../Component.js';

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
    const H = 3 * this.GRID;          // 60px
    const W = 3 * this.GRID;          // 60px
    const el = document.createElement('div');
    el.className = 'component light-bulb';
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    // SVG circle – exactly in the center, use unique class instead of id
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '40');
    svg.setAttribute('height', '40');
    svg.setAttribute('viewBox', '0 0 40 40');
    svg.style.position = 'absolute';
    svg.style.top = `${(H - 40) / 2}px`;
    svg.style.left = `${(W - 40) / 2}px`;
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '20');
    circle.setAttribute('cy', '20');
    circle.setAttribute('r', '16');
    const rootStyle = getComputedStyle(document.documentElement);
    const offFill = rootStyle.getPropertyValue('--led-off-fill').trim() || '#333';
    const offStroke = rootStyle.getPropertyValue('--led-off-stroke').trim() || '#666';
    circle.setAttribute('fill', offFill);
    circle.setAttribute('stroke', offStroke);
    circle.setAttribute('stroke-width', '2');
    circle.classList.add('led-circle');
    svg.appendChild(circle);
    el.appendChild(svg);

    // Input connector – grid‑aligned at y = 20 (center of component)
    el.appendChild(this._createConnectorBlock(
      this.inputs[0], true, 'I0', 1 * this.GRID
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
    const lit = this.inputs[0]?.value === true;
    const style = getComputedStyle(document.documentElement);
    const onFill = style.getPropertyValue('--led-on-fill').trim() || '#ff4444';
    const onStroke = style.getPropertyValue('--led-on-stroke').trim() || '#ff8888';
    const offFill = style.getPropertyValue('--led-off-fill').trim() || '#333';
    const offStroke = style.getPropertyValue('--led-off-stroke').trim() || '#666';
    const glow = style.getPropertyValue('--led-glow').trim() || 'drop-shadow(0 0 6px rgba(255,0,0,0.8))';
    circle.setAttribute('fill', lit ? onFill : offFill);
    circle.setAttribute('stroke', lit ? onStroke : offStroke);
    circle.style.filter = lit ? glow : 'none';
  }
}