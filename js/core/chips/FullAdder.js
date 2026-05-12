import { Component } from '../Component.js';
import { Value } from '../simulation/Value.js';

/**
 * Full Adder — adds three single-bit or bus-width values.
 * Single-bit: A, B, Cin → Sum, Cout
 * Bus mode: A[N], B[N], Cin[1] → Sum[N], Cout[1]
 *
 * For bus mode, Cin is always 1-bit. The adder performs bitwise
 * addition and the carry out reflects whether the addition overflowed.
 */
export class FullAdder extends Component {
  static label = 'Full Adder';
  static category = 'Chips';

  constructor(id) {
    super(id, 'FullAdder', 3, 2);   // A, B, Cin → Sum, Cout
  }

  computeNextState() {
    const a = this.inputs[0].value;
    const b = this.inputs[1].value;
    const cin = this.inputs[2].value;

    if (this.bitWidth > 1) {
      // Bus mode: add two bus Values plus a 1-bit carry
      const aValue = (a instanceof Value) ? a : Value.fromBoolean(a);
      const bValue = (b instanceof Value) ? b : Value.fromBoolean(b);
      const cinBool = cin === true || (cin instanceof Value && cin.value !== 0);

      // Simple addition: XOR for sum, carry = (A&B) | (Cin & (A^B))
      const aXorB = aValue.xor(bValue);
      const sum = cinBool ? aXorB.not() : aXorB; // XOR with Cin
      // Simplified: sum = a XOR b XOR cin
      const sumVal = cinBool
        ? aValue.xor(bValue).xor(Value.createKnown(this.bitWidth, 1))
        : aValue.xor(bValue);

      // Carry out: (A & B) | (Cin & (A XOR B))
      const aAndB = aValue.value & bValue.value & ~aValue.unknown & ~aValue.error & ~bValue.unknown & ~bValue.error;
      const aXorBVal = aXorB.value & ~aXorB.unknown & ~aXorB.error;
      const cout = (aAndB !== 0) || (cinBool && aXorBVal !== 0);

      return { outputs: [sumVal, Boolean(cout)] };
    }

    // Legacy single-bit mode (unchanged)
    const sum = Boolean(a ^ b ^ cin);
    const cout = Boolean((a && b) || (cin && (a ^ b)));
    return { outputs: [sum, cout] };
  }

  getProperties() {
    const props = [
      { name: 'bitWidth', label: 'Bit Width', type: 'number', value: this.bitWidth, min: 1, max: 32 },
      ...super.getProperties().filter(p => p.name !== 'bitWidth')
    ];
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

      // Rebuild ports - A, B at bus width; Cin always 1-bit; Sum at bus width; Cout at 1-bit
      this.inputs = [
        { id: `${this.id}.input.0`, value: w > 1 ? Value.createUnknown(w) : false, width: w, connectedTo: null },
        { id: `${this.id}.input.1`, value: w > 1 ? Value.createUnknown(w) : false, width: w, connectedTo: null },
        { id: `${this.id}.input.2`, value: false, width: 1, connectedTo: null }
      ];
      this.outputs = [
        { id: `${this.id}.output.0`, value: w > 1 ? Value.createKnown(w, 0) : false, width: w },
        { id: `${this.id}.output.1`, value: false, width: 1 }
      ];

      if (this._engine) this._engine.reindexComponent(this);
      this.rerender();
      if (this._engine) this._engine._propagateFrom(this);
      return true;
    }

    if (super.setProperty(name, value)) return true;
    return false;
  }

  render(container) {
    const isBus = this.bitWidth > 1;
    const H = 5 * this.GRID;   // 100px
    const W = 5 * this.GRID;   // 100px (wider for labels)
    const el = document.createElement('div');
    el.className = 'component gate full-adder' + (isBus ? ' bus-component' : '');
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'gate-body';
    body.textContent = isBus ? `FA/${this.bitWidth}` : 'FA';
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    el.appendChild(body);

    // Input connectors on left: A at y=1grid, B at y=2grid, Cin at y=3grid
    el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'A', 1 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[1], true, 'B', 2 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[2], true, 'Cin', 3 * this.GRID));
    // Output connectors on right: Sum at y=1grid (aligned with A), Cout at y=3grid (aligned with Cin)
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'Sum', 1 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[1], false, 'Cout', 3 * this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}
