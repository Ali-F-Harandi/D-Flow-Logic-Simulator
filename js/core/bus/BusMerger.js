import { Component } from '../Component.js';
import { Value } from '../simulation/Value.js';
import { BUS_MAX_WIDTH } from '../../config.js';

/**
 * BusMerger — Merges multiple inputs into one N-bit bus.
 * The inverse of BusSplitter.
 *
 * Constructor params:
 *   id         — unique component id
 *   bitWidth   — total bit width of the output bus (2–32, default 8)
 *   grouping   — optional array specifying how bits are grouped into inputs.
 *                Default: each bit is its own 1-bit input (e.g. 8-bit → [1,1,1,1,1,1,1,1]).
 *                Example: [3,2,3] for an 8-bit bus means inputs of 3-bit, 2-bit, 3-bit.
 *
 * Ports:
 *   M inputs — determined by grouping
 *   1 output — the combined N-bit bus (width = bitWidth)
 */
export class BusMerger extends Component {
  static label = 'Bus Merger';

  constructor(id, bitWidth = 8, grouping = null) {
    bitWidth = Math.max(2, Math.min(BUS_MAX_WIDTH, parseInt(bitWidth, 10) || 8));

    // Parse grouping
    const grp = BusMerger._parseGrouping(grouping, bitWidth);
    const inputCount = grp.length;
    const inputWidths = grp;

    super(id, 'BusMerger', inputCount, 1, inputWidths, [bitWidth]);
    this.bitWidth = bitWidth;
    this._inputWidths = inputWidths;
    this._grouping = grp;

    // Initialize inputs
    for (let i = 0; i < inputCount; i++) {
      this.inputs[i].value = Value.createUnknown(inputWidths[i]);
    }
    // Initialize output
    this.outputs[0].value = Value.createUnknown(bitWidth);
  }

  static _parseGrouping(grouping, bitWidth) {
    if (!grouping) {
      return new Array(bitWidth).fill(1);
    }
    if (typeof grouping === 'string') {
      try {
        grouping = JSON.parse(grouping);
      } catch {
        return new Array(bitWidth).fill(1);
      }
    }
    if (Array.isArray(grouping)) {
      const grp = grouping.map(g => Math.max(1, parseInt(g, 10) || 1));
      const total = grp.reduce((s, w) => s + w, 0);
      if (total !== bitWidth) {
        return new Array(bitWidth).fill(1);
      }
      return grp;
    }
    return new Array(bitWidth).fill(1);
  }

  computeNextState() {
    let combinedValue = 0;
    let combinedUnknown = 0;
    let combinedError = 0;
    let bitOffset = 0;
    for (let i = 0; i < this.inputs.length; i++) {
      const inpVal = this.inputs[i].value;
      const val = (inpVal instanceof Value) ? inpVal : Value.fromBoolean(inpVal);
      const w = this._inputWidths[i];
      const mask = (1 << w) - 1;
      combinedValue |= (val.value & mask) << bitOffset;
      combinedUnknown |= (val.unknown & mask) << bitOffset;
      combinedError |= (val.error & mask) << bitOffset;
      bitOffset += w;
    }
    return { outputs: [new Value(this.bitWidth, combinedError, combinedUnknown, combinedValue)] };
  }

  applyNextState(nextState) {
    const { outputs } = nextState;
    for (let i = 0; i < this.outputs.length; i++) {
      this.outputs[i].value = outputs[i];
    }
    this._updateConnectorStates();
  }

  reset() {
    for (let i = 0; i < this.inputs.length; i++) {
      this.inputs[i].value = Value.createUnknown(this._inputWidths[i]);
    }
    this.outputs[0].value = Value.createUnknown(this.bitWidth);
    this._updateConnectorStates();
  }

  getProperties() {
    return [
      ...super.getProperties(),
      {
        name: 'grouping',
        label: 'Grouping',
        type: 'text',
        value: JSON.stringify(this._grouping)
      }
    ];
  }

  setProperty(name, value) {
    if (super.setProperty(name, value)) return true;
    if (name === 'grouping') {
      let newGrouping;
      if (typeof value === 'string') {
        try {
          newGrouping = JSON.parse(value);
        } catch {
          return false;
        }
      } else if (Array.isArray(value)) {
        newGrouping = value;
      } else {
        return false;
      }
      if (!Array.isArray(newGrouping) || newGrouping.length === 0) return false;
      const total = newGrouping.reduce((s, w) => s + w, 0);
      if (total !== this.bitWidth) return false;

      // Disconnect wires for inputs being removed
      if (newGrouping.length < this._inputWidths.length) {
        for (let i = newGrouping.length; i < this._inputWidths.length; i++) {
          const inp = this.inputs[i];
          if (inp && inp.connectedTo) {
            const wire = this._engine?.wires.find(w => w.to.nodeId === inp.id);
            if (wire) {
              this._engine.disconnect(wire.id);
              document.dispatchEvent(new CustomEvent('wire-removed', { detail: { wireId: wire.id } }));
            }
          }
        }
      }

      this._grouping = newGrouping;
      this._inputWidths = newGrouping;

      // Rebuild inputs
      this.inputs = [];
      for (let i = 0; i < newGrouping.length; i++) {
        this.inputs.push({
          id: `${this.id}.input.${i}`,
          value: Value.createUnknown(newGrouping[i]),
          width: newGrouping[i],
          connectedTo: null
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

  render(container) {
    this.container = container;
    if (this.element) this.element.remove();

    const n = this.inputs.length;
    const H = Math.max((n + 1), 3) * this.GRID;
    const W = 5 * this.GRID;

    const el = document.createElement('div');
    el.className = 'component bus-merger';
    el.dataset.id = this.id;
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    // Body — vertical bar style (center column, mirrored from splitter)
    const body = document.createElement('div');
    body.className = 'component-body-centered bus-merger-body';
    body.style.cssText = `
      position: absolute;
      left: ${2 * this.GRID}px;
      top: ${Math.round(this.GRID / 2)}px;
      width: ${this.GRID}px;
      height: ${H - this.GRID}px;
      background: var(--bus-component-bg, #e8f0fe);
      border: 2px solid var(--bus-component-border, #5b9bd5);
      border-radius: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    el.appendChild(body);

    // Width label in center of the bar
    const widthLabel = document.createElement('span');
    widthLabel.className = 'component-label';
    widthLabel.textContent = `/${this.bitWidth}`;
    widthLabel.style.cssText = `
      font-size: 10px;
      font-weight: bold;
      color: var(--bus-component-border, #5b9bd5);
      font-family: monospace;
      writing-mode: vertical-lr;
      text-orientation: mixed;
    `;
    body.appendChild(widthLabel);

    // Title label above the bar
    const titleLabel = document.createElement('span');
    titleLabel.textContent = 'MERGE';
    titleLabel.style.cssText = `
      position: absolute;
      top: 2px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 8px;
      font-weight: bold;
      color: var(--bus-indicator-color, #5b9bd5);
      font-family: monospace;
      opacity: 0.8;
    `;
    el.appendChild(titleLabel);

    // Input connectors on the left with bit range labels
    let bitOffset = 0;
    for (let i = 0; i < n; i++) {
      const y = _getInputY(i, n, H);
      const w = this._inputWidths[i];
      const inLabel = w === 1 ? `${bitOffset}` : `${bitOffset}-${bitOffset + w - 1}`;
      el.appendChild(this._createConnectorBlock(this.inputs[i], true, inLabel, y));
      bitOffset += w;
    }

    // Output connector (the combined bus on the right)
    const outputY = Math.round(H / 2 / this.GRID) * this.GRID;
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, `${this.bitWidth}`, outputY));

    container.appendChild(el);
    this.element = el;
    this._updateConnectorStates();
  }
}

function _getInputY(index, inputCount, height) {
  const GRID = 20;
  if (inputCount === 0) return 0;
  const spacing = height / (inputCount + 1);
  return Math.round(spacing * (index + 1) / GRID) * GRID;
}
