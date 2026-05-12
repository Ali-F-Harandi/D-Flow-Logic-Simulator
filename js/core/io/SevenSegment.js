import { Component } from '../Component.js';
import { Value } from '../simulation/Value.js';

/**
 * 7-Segment Display — displays a hex digit from 4-bit BCD input.
 *
 * Two input modes:
 * 1. Default (busInput=false): 5 individual inputs (I0-I3 = BCD, I4 = DP)
 * 2. Bus mode (busInput=true): 1 bus input (4-bit value) + 1 DP input
 *
 * In bus mode, a single 4-bit bus input provides the hex digit value,
 * and a separate 1-bit input controls the decimal point.
 */
export class SevenSegment extends Component {
  static label = '7-Segment';
  constructor(id) {
    super(id, '7Seg', 5, 0);   // I0-I3 = BCD, I4 = DP
    this._busInput = false; // default: individual BCD inputs
  }

  get busInput() { return this._busInput; }

  computeNextState() {
    // No outputs to compute, but we need to signal that display should update
    return { outputs: [] };
  }

  applyNextState(nextState) {
    // No outputs to apply, but update visual based on current input values
    this._updateDisplay();
    this._updateConnectorStates();
  }

  setInputValue(index, value) {
    if (this.inputs[index]) {
      this.inputs[index].value = value;
      this._updateDisplay();
      this._updateConnectorStates();
    }
  }

  reset() {
    if (this._busInput) {
      this.inputs[0].value = Value.createKnown(4, 0);
      if (this.inputs.length > 1) this.inputs[1].value = false;
    } else {
      this.inputs.forEach(i => i.value = false);
    }
    this._updateDisplay();
    this._updateConnectorStates();
  }

  getProperties() {
    const props = [
      { name: 'busInput', label: 'Bus Input', type: 'select', value: this._busInput ? 'true' : 'false', options: ['false', 'true'] },
      ...super.getProperties().filter(p => p.name !== 'bitWidth')
    ];
    return props;
  }

  setProperty(name, value) {
    if (name === 'busInput') {
      const newBusInput = value === 'true' || value === true;
      if (newBusInput === this._busInput) return false;

      // Disconnect all wires on inputs
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
        // 4-bit bus input + 1-bit DP input
        this.inputs = [
          { id: `${this.id}.input.0`, value: Value.createKnown(4, 0), width: 4, connectedTo: null },
          { id: `${this.id}.input.1`, value: false, width: 1, connectedTo: null }
        ];
        this.bitWidth = 4;
      } else {
        // 5 individual 1-bit inputs (I0-I3 = BCD, I4 = DP)
        this.inputs = [];
        for (let i = 0; i < 5; i++) {
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

    if (super.setProperty(name, value)) return true;
    return false;
  }

  render(container) {
    const H = 6 * this.GRID;             // 120px
    const W = 5 * this.GRID;             // 100px
    const el = document.createElement('div');
    el.className = 'component sevenseg' + (this._busInput ? ' bus-component' : '');
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    // 7‑segment digit SVG – use classes instead of ids to avoid duplicate ID conflicts
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '-1 -1 13 20');
    svg.setAttribute('width', '56');
    svg.setAttribute('height', '100');
    svg.style.position = 'absolute';
    svg.style.top = '10px';
    svg.style.left = '22px';
    // Static SVG markup — safe (no user input interpolated)
    svg.innerHTML = `
      <polygon class="seg-a" fill="var(--led-off-fill)" points="1,1  2,0  8,0  9,1  8,2  2,2"/>
      <polygon class="seg-b" fill="var(--led-off-fill)" points="9,1 10,2 10,8  9,9  8,8  8,2"/>
      <polygon class="seg-c" fill="var(--led-off-fill)" points="9,9 10,10 10,16  9,17  8,16  8,10"/>
      <polygon class="seg-d" fill="var(--led-off-fill)" points="9,17  8,18  2,18  1,17  2,16  8,16"/>
      <polygon class="seg-e" fill="var(--led-off-fill)" points="1,17  0,16  0,10  1, 9  2,10  2,16"/>
      <polygon class="seg-f" fill="var(--led-off-fill)" points="1, 9  0, 8  0, 2  1, 1  2, 2  2, 8"/>
      <polygon class="seg-g" fill="var(--led-off-fill)" points="1, 9  2, 8  8, 8  9, 9  8,10  2,10"/>
      <circle class="seg-dp" cx="11" cy="18" r="0.8" fill="var(--led-off-fill)"/>
    `;
    el.appendChild(svg);

    // Input connectors
    if (this._busInput) {
      // Bus input: 4-bit value + 1-bit DP
      el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'D[0:3]', 1 * this.GRID));
      el.appendChild(this._createConnectorBlock(this.inputs[1], true, 'DP', 2 * this.GRID));
    } else {
      // Individual BCD inputs
      el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'I0', 1 * this.GRID));
      el.appendChild(this._createConnectorBlock(this.inputs[1], true, 'I1', 2 * this.GRID));
      el.appendChild(this._createConnectorBlock(this.inputs[2], true, 'I2', 3 * this.GRID));
      el.appendChild(this._createConnectorBlock(this.inputs[3], true, 'I3', 4 * this.GRID));
      el.appendChild(this._createConnectorBlock(this.inputs[4], true, 'DP', 5 * this.GRID));
    }

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateDisplay();
  }

  _updateDisplay() {
    if (!this.element) return;

    let val;
    let dpOn;

    if (this._busInput) {
      // Bus input mode: read 4-bit Value
      const busVal = this.inputs[0]?.value;
      if (busVal instanceof Value) {
        val = busVal.toLongValue() & 0xF;
      } else {
        val = 0;
      }
      dpOn = this.inputs[1]?.value === true;
    } else {
      // Individual input mode (unchanged)
      val = 0;
      for (let i = 0; i < 4; i++) if (this.inputs[i]?.value) val |= (1 << i);
      dpOn = this.inputs[4]?.value === true;
    }

    // FIX (Bug #7): Corrected 7-segment encoding for hex digits 0-F.
    // Each 7-bit value: bit6=a, bit5=b, bit4=c, bit3=d, bit2=e, bit1=f, bit0=g
    // Verified against standard common-cathode 7-segment truth table.
    const segMap = [
      0b1111110, // 0: a,b,c,d,e,f    (g off)
      0b0110000, // 1: b,c             (a,d,e,f,g off)
      0b1101101, // 2: a,b,d,e,g       (c,f off)
      0b1111001, // 3: a,b,c,d,g       (e,f off)
      0b0110011, // 4: b,c,f,g         (a,d,e off)
      0b1011011, // 5: a,c,d,f,g       (b,e off)
      0b1011111, // 6: a,c,d,e,f,g     (b off)
      0b1110000, // 7: a,b,c           (d,e,f,g off)
      0b1111111, // 8: a,b,c,d,e,f,g   (all on)
      0b1111011, // 9: a,b,c,d,f,g     (e off)
      0b1110111, // A: a,b,c,e,f,g     (d off)
      0b0011111, // b: c,d,e,f,g       (a,b off)
      0b1001110, // C: a,d,e,f         (b,c,g off)
      0b0111101, // d: b,c,d,e,g       (a,f off)
      0b1001111, // E: a,d,e,f,g       (b,c off)
      0b1000111  // F: a,e,f,g         (b,c,d off)
    ];
    const bits = segMap[val] || 0;
    const style = getComputedStyle(document.documentElement);
    const onFill = style.getPropertyValue('--led-on-fill').trim() || '#ff4444';
    const offFill = style.getPropertyValue('--led-off-fill').trim() || '#333';
    const segs = ['a','b','c','d','e','f','g'];
    segs.forEach((seg, idx) => {
      const poly = this.element.querySelector(`.seg-${seg}`);
      if (poly) poly.setAttribute('fill', (bits >> (6 - idx)) & 1 ? onFill : offFill);
    });

    // decimal point
    const dp = this.element.querySelector('.seg-dp');
    if (dp) {
      dp.setAttribute('fill', dpOn ? onFill : offFill);
    }
  }
}
