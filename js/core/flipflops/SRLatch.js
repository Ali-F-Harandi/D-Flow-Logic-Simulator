import { Component } from '../Component.js';

/**
 * SR Latch (level-sensitive, no clock).
 * The most fundamental sequential element in digital logic.
 * Unlike the clocked SR Flip-Flop, this latch responds immediately
 * to level changes on S and R inputs.
 *
 * Truth table:
 *   S=0 R=0 → hold previous state
 *   S=1 R=0 → Q=1 (Set)
 *   S=0 R=1 → Q=0 (Reset)
 *   S=1 R=1 → invalid/both outputs LOW (forbidden state)
 */
export class SRLatch extends Component {
  static label = 'SR Latch';
  static category = 'Flip-Flops';

  constructor(id) {
    super(id, 'SRLatch', 2, 2);  // S, R → Q, !Q
    this._state = { Q: false, nQ: true };
    this.outputs[1].value = true;  // !Q starts HIGH
  }

  computeNextState() {
    const s = this.inputs[0].value;
    const r = this.inputs[1].value;

    let nextQ = this._state.Q;
    let nextNQ = this._state.nQ;

    // Level-sensitive: respond immediately, no clock edge required
    if (s && !r) {
      nextQ = true;
      nextNQ = false;
    } else if (!s && r) {
      nextQ = false;
      nextNQ = true;
    } else if (s && r) {
      // Forbidden state: both Q and !Q go LOW
      nextQ = false;
      nextNQ = false;
    }
    // else: s=0, r=0 → hold state (no change)

    return { outputs: [nextQ, nextNQ] };
  }

  applyNextState(nextState) {
    this._state.Q = nextState.outputs[0];
    this._state.nQ = nextState.outputs[1];
    super.applyNextState(nextState);
  }

  reset() {
    super.reset();
    this._state = { Q: false, nQ: true };
    if (this.outputs.length > 1) {
      this.outputs[1].value = true;
    }
    this._updateConnectorStates();
  }

  getProperties() { return super.getProperties(); }

  setProperty(name, value) {
    if (super.setProperty(name, value)) return true;
    return false;
  }

  render(container) {
    const H = 3 * this.GRID;
    const W = 4 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component flipflop sr-latch';
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'ff-body';
    body.textContent = 'SRL';
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    el.appendChild(body);

    // Inputs on the left
    el.appendChild(this._createConnectorBlock(this.inputs[0], true, 'S', 1 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.inputs[1], true, 'R', 2 * this.GRID));

    // Outputs on the right
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'Q', 1 * this.GRID));
    el.appendChild(this._createConnectorBlock(this.outputs[1], false, '!Q', 2 * this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}
