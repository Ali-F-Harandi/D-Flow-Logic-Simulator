// js/core/SevenSegment.js
import { Component } from '../Component.js';

export class SevenSegment extends Component {
  static label = '7-Segment';
  constructor(id) {
    super(id, '7Seg', 5, 0);   // I0-I3 = BCD, I4 = DP
  }

  applyNextState(nextState) {
    super.applyNextState(nextState);
    this._updateDisplay();
  }

  render(container) {
    const H = 6 * this.GRID;
    const W = 5 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component sevenseg';
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    // 7‑segment digit SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '-1 -1 13 20');
    svg.setAttribute('width', '56');
    svg.setAttribute('height', '100');
    svg.style.position = 'absolute';
    svg.style.top = '10px';
    svg.style.left = '22px';
    svg.innerHTML = `
      <polygon id="a" fill="#333" points="1,1  2,0  8,0  9,1  8,2  2,2"/>
      <polygon id="b" fill="#333" points="9,1 10,2 10,8  9,9  8,8  8,2"/>
      <polygon id="c" fill="#333" points="9,9 10,10 10,16  9,17  8,16  8,10"/>
      <polygon id="d" fill="#333" points="9,17  8,18  2,18  1,17  2,16  8,16"/>
      <polygon id="e" fill="#333" points="1,17  0,16  0,10  1, 9  2,10  2,16"/>
      <polygon id="f" fill="#333" points="1, 9  0, 8  0, 2  1, 1  2, 2  2, 8"/>
      <polygon id="g" fill="#333" points="1, 9  2, 8  8, 8  9, 9  8,10  2,10"/>
      <circle id="dp" cx="11" cy="18" r="0.8" fill="#333"/>
    `;
    el.appendChild(svg);

    // Input connectors
    el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'I0', 1 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[1], true, 'I1', 2 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[2], true, 'I2', 3 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[3], true, 'I3', 4 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[4], true, 'DP', 5 * this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateDisplay();
  }

  _updateDisplay() {
    if (!this.element) return;
    let val = 0;
    for (let i = 0; i < 4; i++) if (this.inputs[i]?.value) val |= (1 << i);
    const segMap = [
      0b1111110, 0b0110000, 0b1101101, 0b1111001, 0b0110011,
      0b1011011, 0b1011111, 0b1110000, 0b1111111, 0b1111011,
      0b1110111, 0b0011111, 0b1001110, 0b0111101, 0b1001111,
      0b1000111
    ];
    const bits = segMap[val] || 0;
    const segs = ['a','b','c','d','e','f','g'];
    segs.forEach((seg, idx) => {
      const poly = this.element.querySelector(`#${seg}`);
      if (poly) poly.setAttribute('fill', (bits >> (6 - idx)) & 1 ? '#ff4444' : '#333');
    });

    // decimal point
    const dp = this.element.querySelector('#dp');
    if (dp) {
      const dpOn = this.inputs[4]?.value === true;
      dp.setAttribute('fill', dpOn ? '#ff4444' : '#333');
    }
  }
}