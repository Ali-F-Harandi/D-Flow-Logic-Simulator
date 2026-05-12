import { Component } from '../Component.js';
import { Value } from '../simulation/Value.js';

/**
 * Half Adder — adds two single-bit or bus-width values.
 * Single-bit: A, B → Sum, Carry
 * Bus mode: A[N], B[N] → Sum[N], Carry[1] (ripple carry not implemented;
 *   carry is 1 only if the MSB addition produces a carry out)
 */
export class HalfAdder extends Component {
  static label = 'Half Adder';
  static category = 'Chips';

  constructor(id) {
    super(id, 'HalfAdder', 2, 2);   // A, B → Sum, Carry
  }

  computeNextState() {
    const a = this.inputs[0].value;
    const b = this.inputs[1].value;

    if (this.bitWidth > 1) {
      // Bus mode: bitwise XOR for sum, AND for carry
      const aValue = (a instanceof Value) ? a : Value.fromBoolean(a);
      const bValue = (b instanceof Value) ? b : Value.fromBoolean(b);
      const sum = aValue.xor(bValue);
      // Carry: if any bit position has both A and B = 1
      const carryVal = (aValue.value & bValue.value) !== 0;
      return { outputs: [sum, carryVal] };
    }

    // Legacy single-bit mode (unchanged)
    const sum = Boolean(a ^ b);
    const carry = Boolean(a && b);
    return { outputs: [sum, carry] };
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

      // Rebuild ports - A, B at bus width; Sum at bus width; Carry at 1-bit
      this.inputs = [
        { id: `${this.id}.input.0`, value: w > 1 ? Value.createUnknown(w) : false, width: w, connectedTo: null },
        { id: `${this.id}.input.1`, value: w > 1 ? Value.createUnknown(w) : false, width: w, connectedTo: null }
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
    const H = 4 * this.GRID;   // 80px
    const W = 5 * this.GRID;   // 100px (wider for labels)
    const el = document.createElement('div');
    el.className = 'component gate half-adder' + (isBus ? ' bus-component' : '');
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'gate-body';
    body.textContent = isBus ? `HA/${this.bitWidth}` : 'HA';
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    el.appendChild(body);

    // Input connectors on left: A at y=1grid, B at y=2grid
    el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'A', 1 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[1], true, 'B', 2 * this.GRID));
    // Output connectors on right: Sum at y=1grid, Cout at y=3grid (aligned with inputs)
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'Sum', 1 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[1], false, 'Cout', 3 * this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}
