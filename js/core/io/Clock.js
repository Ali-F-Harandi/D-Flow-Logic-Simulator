import { Component } from '../Component.js';

/**
 * Clock Component — Outputs a periodic square wave.
 *
 * REDESIGNED (Logisim-Evolution pattern):
 * In the old engine, each Clock ran its own setInterval timer and
 * self-toggled. This caused timing issues when multiple clocks were
 * out of sync.
 *
 * In the new engine, clocks are toggled centrally by the Propagator
 * via Propagator.toggleClocks(). The Clock.start()/stop() methods
 * are kept for backward compatibility but are NO-OPs when the engine
 * is managing the simulation. The engine's run/stop methods handle
 * the tick interval, ensuring all clocks tick in perfect sync.
 *
 * This matches Logisim-Evolution's architecture where the SimThread
 * calls propagator.toggleClocks() on each half-cycle, and the
 * Clock.tick() method toggles individual clock outputs.
 */
export class Clock extends Component {
  static label = 'Clock';
  constructor(id, frequency = 1) {
    super(id, 'Clock', 0, 1);
    this.frequency = frequency;
    this.intervalId = null;
    this.running = false;
  }

  /**
   * Start the clock's internal timer (LEGACY mode).
   * In the new engine, this is a NO-OP because the Engine
   * manages clock ticking centrally via Propagator.toggleClocks().
   * Kept for backward compatibility with standalone usage.
   */
  start() {
    if (this.running) return;
    // If engine is managing simulation, don't start individual timer
    if (this._engine && this._engine.propagator) {
      this.running = true;
      return;
    }
    // Legacy mode: self-toggling timer
    this.running = true;
    const ms = 1000 / (this.frequency * 2);
    this.intervalId = setInterval(() => {
      this.outputs[0].value = !this.outputs[0].value;
      this.computeOutput();   // triggers engine-wrapped propagation
    }, ms);
  }

  /**
   * Stop the clock's internal timer.
   */
  stop() {
    if (!this.running) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.running = false;
  }

  /**
   * Toggle the clock output (called by Propagator.toggleClocks()).
   * This is the Logisim Clock.tick() equivalent.
   * @returns {boolean} True if the output changed
   */
  tick() {
    const oldValue = this.outputs[0].value;
    this.outputs[0].value = !this.outputs[0].value;
    this._updateConnectorStates();
    return this.outputs[0].value !== oldValue;
  }

  setFrequency(f) {
    this.frequency = f;
    if (this.running && !this._engine?.propagator) {
      // Only restart timer in legacy mode
      this.stop();
      this.start();
    }
  }

  computeNextState() {
    // Return current output value (already toggled by tick() or start())
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

  /**
   * resetState() stops the clock but preserves its output value.
   * Clock output will be re-driven when simulation starts again.
   */
  resetState() {
    this.stop();
    this._updateConnectorStates();
  }

  getProperties() {
    return [...super.getProperties(), { name: 'frequency', label: 'Frequency (Hz)', type: 'number', value: this.frequency, min: 0.1, max: 100, step: 0.1 }];
  }

  setProperty(name, value) {
    if (super.setProperty(name, value)) return true;
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
