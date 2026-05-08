import { Component } from '../Component.js';

/**
 * Configurable Shift Register — 2 to 8 bits, default 8.
 * Renamed from ShiftRegister4. Type string changed from 'ShiftRegister4' to 'ShiftRegister'.
 */
export class ShiftRegister extends Component {
  static label = 'Shift Register';
  static category = 'Flip-Flops';

  constructor(id, bitCount = 8) {
    bitCount = Math.max(2, Math.min(8, parseInt(bitCount, 10) || 8));
    super(id, 'ShiftRegister', 2, bitCount);   // Data, Clock → Q0..Q(n-1)
    this._bitCount = bitCount;
    this._prevClk = false;
    this._state = new Array(bitCount).fill(false);
  }

  get bitCount() { return this._bitCount; }

  computeNextState() {
    const data = this.inputs[0].value;
    const clk = this.inputs[1].value;
    let nextState;
    if (clk && !this._prevClk) {
      nextState = [Boolean(data), ...this._state.slice(0, this._bitCount - 1)];
    } else {
      nextState = [...this._state];
    }
    return {
      outputs: nextState,
      prevClk: clk,
      internalState: nextState
    };
  }

  applyNextState(nextState) {
    this._state = [...nextState.internalState];
    this._prevClk = nextState.prevClk;
    super.applyNextState(nextState);
  }

  reset() {
    super.reset();
    this._prevClk = false;
    this._state = new Array(this._bitCount).fill(false);
    this._updateConnectorStates();
  }

  getProperties() {
    return [{ name: 'bits', label: 'Bits', type: 'number', value: this._bitCount, min: 2, max: 8, step: 1 }];
  }

  setProperty(name, value) {
    if (name === 'bits') {
      const newCount = parseInt(value, 10);
      if (isNaN(newCount) || newCount === this._bitCount || newCount < 2 || newCount > 8) return false;

      // Disconnect wires for outputs being removed
      if (newCount < this._bitCount) {
        for (let i = newCount; i < this._bitCount; i++) {
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

      const oldState = [...this._state];
      const oldOutputs = this.outputs.map(o => ({ value: o.value }));

      this._bitCount = newCount;

      // Rebuild outputs array
      this.outputs = [];
      for (let i = 0; i < newCount; i++) {
        this.outputs.push({
          id: `${this.id}.output.${i}`,
          value: i < oldOutputs.length ? oldOutputs[i].value : false
        });
      }

      // Rebuild state
      this._state = new Array(newCount).fill(false);
      for (let i = 0; i < Math.min(newCount, oldState.length); i++) {
        this._state[i] = oldState[i];
      }

      // CRITICAL: Re-index the component's nodes in the engine so that
      // wire connections and signal propagation work with the new node IDs.
      if (this._engine) {
        this._engine.reindexComponent(this);
      }

      this.rerender();
      return true;
    }
    return false;
  }

  render(container) {
    const n = this._bitCount;
    const H = (n + 1) * this.GRID;
    const W = 5 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component flipflop shift-reg';
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'ff-body';
    body.textContent = `SR${n}`;
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    el.appendChild(body);

    el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'D', 1 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[1], true, 'CLK', 2 * this.GRID));
    for (let i = 0; i < n; i++) {
      el.appendChild(this._createConnectorBlock(this.outputs[i], false, `Q${i}`, (1 + i) * this.GRID));
    }

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}
