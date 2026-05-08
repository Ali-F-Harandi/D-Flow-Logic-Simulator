import { Component } from '../Component.js';

export class Clock extends Component {
  static label = 'Clock';
  constructor(id, frequency = 1) {
    super(id, 'Clock', 0, 1);
    this.frequency = frequency;
    this.intervalId = null;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const ms = 1000 / (this.frequency * 2);
    this.intervalId = setInterval(() => {
      this.outputs[0].value = !this.outputs[0].value;
      this.computeOutput();   // triggers engine-wrapped propagation
    }, ms);
  }

  stop() {
    if (!this.running) return;
    clearInterval(this.intervalId);
    this.running = false;
  }

  setFrequency(f) {
    this.frequency = f;
    if (this.running) { this.stop(); this.start(); }
  }

  computeNextState() {
    // Return current output value (already toggled by start())
    return { outputs: [this.outputs[0].value] };
  }

  applyNextState(nextState) {
    for (let i = 0; i < this.outputs.length; i++) {
      this.outputs[i].value = nextState.outputs[i];
    }
    this._updateConnectorStates();
  }

  reset() {
    super.reset();
    this.stop();
    this._updateConnectorStates();
  }

  getProperties() {
    return [{ name: 'frequency', label: 'Frequency (Hz)', type: 'number', value: this.frequency, min: 0.1, max: 100, step: 0.1 }];
  }

  setProperty(name, value) {
    if (name === 'frequency') {
      const f = parseFloat(value);
      if (!isNaN(f) && f > 0) { this.setFrequency(f); return true; }
    }
    return false;
  }

  render(container) {
    const H = 3 * this.GRID;
    const el = document.createElement('div');
    el.className = 'component clock';
    el.style.width = `${4 * this.GRID}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'clock-body';
    body.textContent = 'CLK';
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    el.appendChild(body);

    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'O0', this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
    this._updateConnectorStates();
  }
}