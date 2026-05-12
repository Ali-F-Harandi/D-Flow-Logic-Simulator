import { Component } from '../Component.js';
import { Value } from '../simulation/Value.js';

/**
 * Tri-State Buffer — a buffer with an enable input.
 * When enabled (EN=1): output = input (pass-through)
 * When disabled (EN=0): output = high-impedance (Z state)
 *
 * The Z state is represented as `null` in the value system.
 * When a downstream input receives `null`, it is not driven
 * (the wire shows a special Z color and the input retains
 * its previous value from other connected sources).
 *
 * Bus support: When bitWidth > 1, the data input and output
 * are bus-width. The enable input is always 1-bit.
 */
export class TriStateBuffer extends Component {
  static label = 'Tri-State';
  static category = 'Gates';

  constructor(id) {
    super(id, 'TriState', 2, 1);  // Data, Enable → Output
  }

  computeNextState() {
    const data = this.inputs[0].value;
    const enable = this.inputs[1].value;

    if (this.bitWidth > 1) {
      // Bus mode: pass through Value or output Unknown (Z) when disabled
      if (enable) {
        const dataValue = (data instanceof Value) ? data : Value.fromBoolean(data);
        return { outputs: [dataValue] };
      } else {
        return { outputs: [Value.createUnknown(this.bitWidth)] };
      }
    }

    // Legacy single-bit mode (unchanged)
    if (enable) {
      // Pass-through: output follows data input
      return { outputs: [Boolean(data)] };
    } else {
      // High-impedance state: output is Z (represented as null)
      return { outputs: [null] };
    }
  }

  applyNextState(nextState) {
    // Override to handle null (Z) values and Value objects properly
    const { outputs } = nextState;
    for (let i = 0; i < this.outputs.length; i++) {
      this.outputs[i].value = outputs[i];  // Can be true, false, null, or Value
    }
    this._updateConnectorStates();
  }

  _getStateColor(value) {
    if (value === true)  return 'var(--color-success)';
    if (value === false) return 'var(--color-text-muted)';
    if (value === null)  return 'var(--wire-z-color, #ff9800)';  // Z state = orange
    // Handle Value objects (bus ports)
    if (typeof value === 'object' && value !== null && typeof value.isFullyDefined === 'function') {
      if (value.error) return 'var(--bus-wire-error-color, #ff4444)';
      if (value.unknown) return 'var(--wire-z-color, #ff9800)'; // Z state for bus
      if (value.value !== 0) return 'var(--bus-wire-active-color, #7ec8e3)';
      return 'var(--bus-wire-neutral-color, #7ba7d0)';
    }
    return 'var(--color-text-muted)';
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

      // Rebuild ports - data input and output at bus width, enable always 1-bit
      this.inputs = [
        { id: `${this.id}.input.0`, value: w > 1 ? Value.createUnknown(w) : false, width: w, connectedTo: null },
        { id: `${this.id}.input.1`, value: false, width: 1, connectedTo: null }
      ];
      this.outputs = [
        { id: `${this.id}.output.0`, value: w > 1 ? Value.createUnknown(w) : false, width: w }
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
    const H = 3 * this.GRID;
    const W = isBus ? 5 * this.GRID : 4 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component gate tristate-gate' + (isBus ? ' bus-component' : '');
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'gate-body component-body-centered';
    body.textContent = isBus ? `TZ/${this.bitWidth}` : 'TZ';

    // Add a small triangle indicator for tri-state symbol
    const indicator = document.createElement('span');
    indicator.style.cssText = 'display:block;font-size:8px;color:var(--color-accent);margin-top:-2px;';
    indicator.textContent = '\u25B3';  // △ up-pointing triangle
    body.appendChild(indicator);

    el.appendChild(body);

    // Input connectors
    el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'D', 1 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[1], true, 'EN', 2 * this.GRID));

    // Output connector (centered)
    const outY = Math.floor(H / (2 * this.GRID)) * this.GRID;
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'O', outY));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}
