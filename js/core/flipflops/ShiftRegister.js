import { Component } from '../Component.js';
import { Value } from '../simulation/Value.js';

/**
 * Configurable Shift Register — 2 to 8 bits, default 8.
 * Renamed from ShiftRegister4. Type string changed from 'ShiftRegister4' to 'ShiftRegister'.
 *
 * Bus output mode: When busOutput=true, replaces the N individual 1-bit
 * outputs with one N-bit bus output, allowing the shift register value
 * to be used as a single bus signal.
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
    this._busOutput = false; // default: individual bit outputs
  }

  get bitCount() { return this._bitCount; }
  get busOutput() { return this._busOutput; }

  computeNextState() {
    const data = this.inputs[0].value;
    const clk = this.inputs[1].value;
    let nextState;
    if (clk && !this._prevClk) {
      nextState = [Boolean(data), ...this._state.slice(0, this._bitCount - 1)];
    } else {
      nextState = [...this._state];
    }

    if (this._busOutput) {
      // Output as a single bus Value
      let val = 0;
      for (let i = 0; i < this._bitCount; i++) {
        if (nextState[i]) val |= (1 << i);
      }
      return {
        outputs: [Value.createKnown(this._bitCount, val)],
        prevClk: clk,
        internalState: nextState
      };
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
    if (this._busOutput && this.outputs.length > 0) {
      this.outputs[0].value = Value.createKnown(this._bitCount, 0);
    }
    this._updateConnectorStates();
  }

  getProperties() {
    const props = [
      { name: 'bits', label: 'Bits', type: 'number', value: this._bitCount, min: 2, max: 8, step: 1 },
      { name: 'busOutput', label: 'Bus Output', type: 'select', value: this._busOutput ? 'true' : 'false', options: ['false', 'true'] },
      ...super.getProperties()
    ];
    // Remove auto-added bitWidth from Component.getProperties() — we manage it ourselves
    return props.filter(p => p.name !== 'bitWidth');
  }

  setProperty(name, value) {
    if (name === 'busOutput') {
      const newBusOutput = value === 'true' || value === true;
      if (newBusOutput === this._busOutput) return false;

      // Disconnect all wires on outputs (they will be rebuilt)
      if (this._engine) {
        const wiresToRemove = this._engine.wires.filter(w =>
          w.from.componentId === this.id
        );
        wiresToRemove.forEach(w => {
          this._engine.disconnect(w.id);
          document.dispatchEvent(new CustomEvent('wire-removed', { detail: { wireId: w.id } }));
        });
      }

      this._busOutput = newBusOutput;

      // Rebuild outputs
      if (newBusOutput) {
        // Single bus output with width = bitCount
        let val = 0;
        for (let i = 0; i < this._bitCount; i++) {
          if (this._state[i]) val |= (1 << i);
        }
        this.outputs = [{
          id: `${this.id}.output.0`,
          value: Value.createKnown(this._bitCount, val),
          width: this._bitCount
        }];
        this.bitWidth = this._bitCount;
      } else {
        // Individual 1-bit outputs
        this.outputs = [];
        for (let i = 0; i < this._bitCount; i++) {
          this.outputs.push({
            id: `${this.id}.output.${i}`,
            value: this._state[i],
            width: 1
          });
        }
        this.bitWidth = 1;
      }

      if (this._engine) this._engine.reindexComponent(this);
      this.rerender();
      if (this._engine) this._engine._propagateFrom(this);
      return true;
    }

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

      // Rebuild state
      this._state = new Array(newCount).fill(false);
      for (let i = 0; i < Math.min(newCount, oldState.length); i++) {
        this._state[i] = oldState[i];
      }

      // Rebuild outputs array
      if (this._busOutput) {
        let val = 0;
        for (let i = 0; i < newCount; i++) {
          if (this._state[i]) val |= (1 << i);
        }
        this.outputs = [{
          id: `${this.id}.output.0`,
          value: Value.createKnown(newCount, val),
          width: newCount
        }];
        this.bitWidth = newCount;
      } else {
        this.outputs = [];
        for (let i = 0; i < newCount; i++) {
          this.outputs.push({
            id: `${this.id}.output.${i}`,
            value: i < oldOutputs.length ? oldOutputs[i].value : false,
            width: (i < oldOutputs.length ? oldOutputs[i].width : 1) || 1
          });
        }
        this.bitWidth = 1;
      }

      // CRITICAL: Re-index the component's nodes in the engine so that
      // wire connections and signal propagation work with the new node IDs.
      if (this._engine) {
        this._engine.reindexComponent(this);
      }

      this.rerender();
      if (this._engine) this._engine._propagateFrom(this);
      return true;
    }

    if (super.setProperty(name, value)) return true;
    return false;
  }

  render(container) {
    const n = this._bitCount;
    const isBus = this._busOutput;
    const H = isBus ? 3 * this.GRID : (n + 1) * this.GRID;
    const W = 5 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component flipflop shift-reg' + (isBus ? ' bus-component' : '');
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'ff-body';
    body.textContent = isBus ? `SR${n}/BUS` : `SR${n}`;
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    el.appendChild(body);

    el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'D', 1 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[1], true, 'CLK', 2 * this.GRID));

    if (isBus) {
      // Single bus output
      const outY = 1 * this.GRID;
      el.appendChild(this._createConnectorBlock(this.outputs[0], false, `Q[0:${n-1}]`, outY));
    } else {
      // Individual bit outputs
      for (let i = 0; i < n; i++) {
        el.appendChild(this._createConnectorBlock(this.outputs[i], false, `Q${i}`, (1 + i) * this.GRID));
      }
    }

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}
