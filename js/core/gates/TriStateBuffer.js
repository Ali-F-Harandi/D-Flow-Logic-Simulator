import { Component } from '../Component.js';

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
 * This is essential for bus design where multiple components
 * can drive the same wire, but only one should be active at a time.
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

    if (enable) {
      // Pass-through: output follows data input
      return { outputs: [Boolean(data)] };
    } else {
      // High-impedance state: output is Z (represented as null)
      return { outputs: [null] };
    }
  }

  applyNextState(nextState) {
    // Override to handle null (Z) values properly
    const { outputs } = nextState;
    for (let i = 0; i < this.outputs.length; i++) {
      this.outputs[i].value = outputs[i];  // Can be true, false, or null
    }
    this._updateConnectorStates();
  }

  _getStateColor(value) {
    if (value === true)  return 'var(--color-success)';
    if (value === false) return 'var(--color-text-muted)';
    if (value === null)  return 'var(--wire-z-color, #ff9800)';  // Z state = orange
    return 'var(--color-text-muted)';
  }

  getProperties() { return []; }

  render(container) {
    const H = 3 * this.GRID;
    const W = 4 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component gate tristate-gate';
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'gate-body component-body-centered';
    body.textContent = 'TZ';

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
