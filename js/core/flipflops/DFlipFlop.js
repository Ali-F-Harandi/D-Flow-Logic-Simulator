import { Component } from '../Component.js';
import { Value } from '../simulation/Value.js';
import { BUS_MAX_WIDTH } from '../../config.js';
export class DFlipFlop extends Component {
  static label = 'D Flip-Flop';
  constructor(id) {
    super(id, 'D', 2, 2);
    this._prevClk = false;
    this._triggerEdge = 'rising';
    this._state = { Q: false, nQ: true };
    this.outputs[1].value = true;  // !Q should be HIGH initially
    // bitWidth inherited from Component (default 1)
  }

  computeNextState() {
    const d = this.inputs[0].value;
    const clk = this.inputs[1].value;

    if (this.bitWidth > 1) {
      // Bus-aware: D input carries a Value object
      const dValue = (d instanceof Value) ? d : Value.fromBoolean(d);
      let nextQ = this._state.Q instanceof Value ? this._state.Q : Value.fromBoolean(this._state.Q);
      let nextNQ = this._state.nQ instanceof Value ? this._state.nQ : Value.fromBoolean(this._state.nQ);
      if (this._isTriggerEdge(clk)) {
        nextQ = dValue;
        nextNQ = dValue.not();
      }
      return { outputs: [nextQ, nextNQ], prevClk: clk };
    }

    // Legacy single-bit mode (unchanged)
    let nextQ = this._state.Q;
    let nextNQ = this._state.nQ;
    if (this._isTriggerEdge(clk)) {
      nextQ = Boolean(d);
      nextNQ = !nextQ;
    }
    return { outputs: [nextQ, nextNQ], prevClk: clk };
  }

  applyNextState(nextState) {
    this._state.Q   = nextState.outputs[0];
    this._state.nQ  = nextState.outputs[1];
    this._prevClk   = nextState.prevClk;
    super.applyNextState(nextState);
  }

  reset() {
    super.reset();
    this._prevClk = false;
    if (this.bitWidth > 1) {
      this._state = {
        Q: Value.createKnown(this.bitWidth, 0),
        nQ: Value.createKnown(this.bitWidth, 0xFFFFFFFF)
      };
    } else {
      this._state = { Q: false, nQ: true };
    }
    if (this.outputs.length > 1) {
      this.outputs[1].value = this.bitWidth > 1
        ? Value.createKnown(this.bitWidth, 0xFFFFFFFF)
        : true;
    }
    this._updateConnectorStates();
  }

  _isTriggerEdge(clk) {
    if (this._triggerEdge === 'falling') return !clk && this._prevClk;
    return clk && !this._prevClk; // rising (default)
  }

  getProperties() {
    const props = [
      { name: 'bitWidth', label: 'Bit Width', type: 'number', value: this.bitWidth, min: 1, max: BUS_MAX_WIDTH },
      { name: 'trigger', label: 'Trigger Edge', type: 'select', value: this._triggerEdge, options: ['rising', 'falling'] },
      { name: 'x', label: 'X Position', type: 'number', value: Math.round(this.position.x), step: this.GRID },
      { name: 'y', label: 'Y Position', type: 'number', value: Math.round(this.position.y), step: this.GRID },
      { name: 'facing', label: 'Facing', type: 'select', value: this.facing, options: ['east', 'south', 'west', 'north'] }
    ];
    return props;
  }

  setProperty(name, value) {
    if (name === 'bitWidth') {
      const w = parseInt(value, 10);
      if (isNaN(w) || w < 1 || w > BUS_MAX_WIDTH || w === this.bitWidth) return false;

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

      // Rebuild ports
      this.inputs = [
        { id: `${this.id}.input.0`, value: w > 1 ? Value.createUnknown(w) : false, width: w, connectedTo: null },
        { id: `${this.id}.input.1`, value: false, width: 1, connectedTo: null }
      ];
      this.outputs = [
        { id: `${this.id}.output.0`, value: w > 1 ? Value.createKnown(w, 0) : false, width: w },
        { id: `${this.id}.output.1`, value: w > 1 ? Value.createKnown(w, 0xFFFFFFFF) : true, width: w }
      ];
      this._state = {
        Q: w > 1 ? Value.createKnown(w, 0) : false,
        nQ: w > 1 ? Value.createKnown(w, 0xFFFFFFFF) : true
      };

      if (this._engine) this._engine.reindexComponent(this);
      this.rerender();
      if (this._engine) this._engine._propagateFrom(this);
      return true;
    }
    if (name === 'trigger') {
      this._triggerEdge = value;
      return true;
    }
    if (name === 'x' || name === 'y' || name === 'facing') {
      return super.setProperty(name, value);
    }
    return false;
  }

  render(container) {
    const H = 4 * this.GRID;
    const W = this.bitWidth > 1 ? 5 * this.GRID : 4 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component flipflop d-ff' + (this.bitWidth > 1 ? ' bus-component' : '');
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'ff-body';
    body.textContent = this.bitWidth > 1 ? `D/${this.bitWidth}` : 'D';
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    el.appendChild(body);

    el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'D',   1*this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[1], true, 'CLK', 2*this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'Q',  1*this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[1], false, '!Q', 3*this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}
