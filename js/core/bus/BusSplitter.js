import { Component } from '../Component.js';
import { Value } from '../simulation/Value.js';
import { BUS_MAX_WIDTH } from '../../config.js';

/**
 * BusSplitter — Splits an N-bit bus into individual bits or sub-buses.
 *
 * Constructor params:
 *   id         — unique component id
 *   bitWidth   — total bit width of the input bus (2–32, default 8)
 *   grouping   — optional array specifying how bits are grouped into outputs.
 *                Default: each bit is its own 1-bit output (e.g. 8-bit → [1,1,1,1,1,1,1,1]).
 *                Example: [3,2,3] for an 8-bit bus means outputs of 3-bit, 2-bit, 3-bit.
 *
 * Ports:
 *   1 input  — the combined N-bit bus (width = bitWidth)
 *   M outputs — determined by grouping. Default grouping = N individual 1-bit outputs.
 */
export class BusSplitter extends Component {
  static label = 'Bus Splitter';

  constructor(id, bitWidth = 8, grouping = null) {
    bitWidth = Math.max(2, Math.min(BUS_MAX_WIDTH, parseInt(bitWidth, 10) || 8));

    // Parse grouping
    const grp = BusSplitter._parseGrouping(grouping, bitWidth);

    // Calculate output count from grouping
    const outputCount = grp.length;
    const outputWidths = grp;

    super(id, 'BusSplitter', 1, outputCount, [bitWidth], outputWidths);
    this.bitWidth = bitWidth;
    this._outputWidths = outputWidths;
    this._grouping = grp;

    // Initialize input with unknown value
    this.inputs[0].value = Value.createUnknown(bitWidth);
    // Initialize outputs
    for (let i = 0; i < outputCount; i++) {
      this.outputs[i].value = Value.createUnknown(outputWidths[i]);
    }
  }

  /**
   * Parse and validate a grouping specification.
   * @param {number[]|string|null} grouping
   * @param {number} bitWidth
   * @returns {number[]}
   */
  static _parseGrouping(grouping, bitWidth) {
    if (!grouping) {
      // Default: each bit is its own 1-bit output
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
        // If grouping doesn't match bitWidth, fall back to default
        return new Array(bitWidth).fill(1);
      }
      return grp;
    }
    return new Array(bitWidth).fill(1);
  }

  computeNextState() {
    const inputValue = this.inputs[0].value;
    const inputVal = (inputValue instanceof Value) ? inputValue : Value.fromBoolean(inputValue);
    const outputs = [];
    let bitOffset = 0;
    for (let i = 0; i < this._outputWidths.length; i++) {
      const w = this._outputWidths[i];
      if (w === 1) {
        outputs.push(inputVal.get(bitOffset));
      } else {
        // Extract bits bitOffset to bitOffset+w-1
        let val = 0;
        let unknown = 0;
        let error = 0;
        for (let b = 0; b < w; b++) {
          const bitVal = inputVal.get(bitOffset + b);
          if (bitVal === Value.TRUE || (bitVal instanceof Value && bitVal.value === 1 && !bitVal.error && !bitVal.unknown)) {
            val |= (1 << b);
          } else if (bitVal === Value.UNKNOWN || (bitVal instanceof Value && bitVal.unknown)) {
            unknown |= (1 << b);
          } else if (bitVal === Value.ERROR || (bitVal instanceof Value && bitVal.error)) {
            error |= (1 << b);
          }
        }
        if (error) {
          outputs.push(Value.createError(w));
        } else if (unknown) {
          outputs.push(new Value(w, 0, unknown, val));
        } else {
          outputs.push(Value.createKnown(w, val));
        }
      }
      bitOffset += w;
    }
    return { outputs };
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
    for (let i = 0; i < this.outputs.length; i++) {
      this.outputs[i].value = Value.createUnknown(this._outputWidths[i]);
    }
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

      // Disconnect wires for outputs being removed
      if (newGrouping.length < this._outputWidths.length) {
        for (let i = newGrouping.length; i < this._outputWidths.length; i++) {
          const out = this.outputs[i];
          if (out) {
            const wiresToRemove = this._engine?.wires.filter(w => w.from.nodeId === out.id);
            if (wiresToRemove) {
              wiresToRemove.forEach(w => {
                this._engine.disconnect(w.id);
                document.dispatchEvent(new CustomEvent('wire-removed', { detail: { wireId: w.id } }));
              });
            }
          }
        }
      }

      this._grouping = newGrouping;
      this._outputWidths = newGrouping;

      // Rebuild outputs
      this.outputs = [];
      for (let i = 0; i < newGrouping.length; i++) {
        this.outputs.push({
          id: `${this.id}.output.${i}`,
          value: Value.createUnknown(newGrouping[i]),
          width: newGrouping[i]
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

    const n = this.outputs.length;
    const H = Math.max((n + 1), 3) * this.GRID;
    const W = 5 * this.GRID;

    const el = document.createElement('div');
    el.className = 'component bus-splitter';
    el.dataset.compId = this.id;
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    // Body — vertical bar style (center column)
    const body = document.createElement('div');
    body.className = 'component-body-centered bus-splitter-body';
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
    titleLabel.textContent = 'SPLIT';
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

    // Input connector (the combined bus on the left)
    const inputY = Math.round(H / 2 / this.GRID) * this.GRID;
    el.appendChild(this._createConnectorBlock(this.inputs[0], true, `${this.bitWidth}`, inputY));

    // Output connectors on the right with bit range labels
    let bitOffset = 0;
    for (let i = 0; i < n; i++) {
      const y = ComponentLayoutPolicy_getOutputY(i, n, H);
      const w = this._outputWidths[i];
      const outLabel = w === 1 ? `${bitOffset}` : `${bitOffset}-${bitOffset + w - 1}`;
      el.appendChild(this._createConnectorBlock(this.outputs[i], false, outLabel, y));
      bitOffset += w;
    }

    container.appendChild(el);
    this.element = el;
    this._updateConnectorStates();
  }
}

/**
 * Helper to compute output Y positions (mirrors ComponentLayoutPolicy.getOutputY logic).
 * Import not used at top level to avoid circular deps; inlined here.
 */
function ComponentLayoutPolicy_getOutputY(index, outputCount, height) {
  const GRID = 20;
  if (outputCount === 0) return 0;
  const spacing = height / (outputCount + 1);
  return Math.round(spacing * (index + 1) / GRID) * GRID;
}
