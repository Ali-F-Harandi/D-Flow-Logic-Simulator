// js/core/LightBulb.js
import { Component } from '../Component.js';

export class LightBulb extends Component {
  static label = 'LED';
  constructor(id) {
    super(id, 'LightBulb', 1, 0);
  }

  computeOutput() {
    this._updateAppearance();
    this._updateConnectorStates();
    return this.outputs;
  }

  setInputValue(index, value) {
    super.setInputValue(index, value);
    this._updateAppearance();
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

    // SVG circle – exactly in the center
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
    circle.setAttribute('r', '16');          // bigger circle
    circle.setAttribute('fill', '#333');
    circle.setAttribute('stroke', '#666');
    circle.setAttribute('stroke-width', '2');
    circle.id = 'led-circle';
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
    const circle = this.element.querySelector('#led-circle');
    if (!circle) return;
    const lit = this.inputs[0]?.value === true;
    circle.setAttribute('fill', lit ? '#ff4444' : '#333');
    circle.setAttribute('stroke', lit ? '#ff8888' : '#666');
    circle.style.filter = lit ? 'drop-shadow(0 0 6px rgba(255,0,0,0.8))' : 'none';
  }
}