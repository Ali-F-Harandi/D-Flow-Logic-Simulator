import { Component } from '../Component.js';
import { Value } from '../simulation/Value.js';
import { BUS_MAX_WIDTH } from '../../config.js';

/**
 * BusMUX — Selects between two N-bit buses based on a 1-bit select signal.
 *
 * Constructor params:
 *   id       — unique component id
 *   bitWidth — bit width of the data buses (1–32, default 8)
 *
 * Ports:
 *   A input   — N-bit bus (selected when SEL=0)
 *   B input   — N-bit bus (selected when SEL=1)
 *   SEL input — 1-bit select
 *   Y output  — N-bit bus (A if SEL=0, B if SEL=1)
 */
export class BusMUX extends Component {
  static label = 'Bus MUX';

  constructor(id, bitWidth = 8) {
    bitWidth = Math.max(1, Math.min(BUS_MAX_WIDTH, parseInt(bitWidth, 10) || 8));
    super(id, 'BusMUX', 3, 1, [bitWidth, bitWidth, 1], [bitWidth]);
    this.bitWidth = bitWidth;

    // Initialize ports
    this.inputs[0].value = Value.createUnknown(bitWidth);  // A
    this.inputs[1].value = Value.createUnknown(bitWidth);  // B
    this.inputs[2].value = Value.FALSE;                     // SEL
    this.outputs[0].value = Value.createUnknown(bitWidth);  // Y
  }

  computeNextState() {
    const aVal = this.inputs[0].value;
    const bVal = this.inputs[1].value;
    const selVal = this.inputs[2].value;

    const a = (aVal instanceof Value) ? aVal : Value.fromBoolean(aVal);
    const b = (bVal instanceof Value) ? bVal : Value.fromBoolean(bVal);

    let result;
    if (selVal === true || (selVal instanceof Value && selVal === Value.TRUE)) {
      result = b;
    } else if (selVal === false || (selVal instanceof Value && selVal === Value.FALSE)) {
      result = a;
    } else {
      // Unknown or error on select → error output
      result = Value.createError(this.bitWidth);
    }

    // Ensure output has correct width
    if (result.width !== this.bitWidth) {
      result = Value.createKnown(this.bitWidth, result.value);
    }

    return { outputs: [result] };
  }

  applyNextState(nextState) {
    const { outputs } = nextState;
    for (let i = 0; i < this.outputs.length; i++) {
      this.outputs[i].value = outputs[i];
    }
    this._updateConnectorStates();
  }

  reset() {
    this.inputs[0].value = Value.createUnknown(this.bitWidth);
    this.inputs[1].value = Value.createUnknown(this.bitWidth);
    this.inputs[2].value = Value.FALSE;
    this.outputs[0].value = Value.createUnknown(this.bitWidth);
    this._updateConnectorStates();
  }

  render(container) {
    const H = 4 * this.GRID;
    const W = 5 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component bus-mux';
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.style.borderColor = 'var(--bus-component-border, #5b9bd5)';
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'component-body-centered';
    body.textContent = `MUX/${this.bitWidth}`;
    body.style.fontSize = '11px';
    body.style.fontWeight = 'bold';
    body.style.color = 'var(--bus-indicator-color, #5b9bd5)';
    el.appendChild(body);

    el.appendChild(this._createConnectorBlock(this.inputs[0], true, `A[${this.bitWidth}]`, 1 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[1], true, `B[${this.bitWidth}]`, 2 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[2], true, 'SEL', 3 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, `Y[${this.bitWidth}]`, 2 * this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}
