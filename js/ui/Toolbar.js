export class Toolbar {
  constructor(container, eventBus) {
    this.container = container;
    this.eventBus = eventBus;
    this.lastStatus = 'Simulation stopped';
    this.element = this.build();
    container.appendChild(this.element);
    this.statusText = this.element.querySelector('.status-text');

    eventBus.on('simulation-status', (status) => {
      this.lastStatus = status === 'running' ? 'Simulation running' : 'Simulation stopped';
      this.statusText.textContent = this.lastStatus;
    });

    this.element.querySelector('#tt-btn').addEventListener('click', () => {
      eventBus.emit('show-panel', 'truth');
    });
    this.element.querySelector('#tb-btn').addEventListener('click', () => {
      eventBus.emit('show-panel', 'testbench');
    });
    this.element.querySelector('#nl-btn').addEventListener('click', () => {
      eventBus.emit('show-panel', 'netlist');
    });

    // Wire routing buttons
    this.element.querySelector('#reroute-btn').addEventListener('click', () => {
      eventBus.emit('reroute-all-wires');
    });

    // Wire crossing style toggle
    this._crossingStyle = 'ansi';
    this.element.querySelector('#crossing-style-btn').addEventListener('click', () => {
      this._crossingStyle = this._crossingStyle === 'ansi' ? 'iec' : 'ansi';
      const btn = this.element.querySelector('#crossing-style-btn');
      btn.textContent = `Crossing: ${this._crossingStyle.toUpperCase()}`;
      eventBus.emit('set-crossing-style', this._crossingStyle);
    });

    // Auto-reroute on drop toggle
    this._autoReroute = true;
    this.element.querySelector('#auto-reroute-btn').addEventListener('click', () => {
      this._autoReroute = !this._autoReroute;
      const btn = this.element.querySelector('#auto-reroute-btn');
      btn.textContent = `Auto-Reroute: ${this._autoReroute ? 'ON' : 'OFF'}`;
      btn.classList.toggle('toolbar-btn-accent', this._autoReroute);
      btn.classList.toggle('toolbar-btn-muted', !this._autoReroute);
      eventBus.emit('toggle-auto-reroute', this._autoReroute);
    });

    document.addEventListener('simulation-error', (e) => {
      this.statusText.textContent = e.detail;
      setTimeout(() => {
        this.statusText.textContent = this.lastStatus;
      }, 3000);
    });
  }

  build() {
    const toolbar = document.createElement('div');
    toolbar.id = 'toolbar';
    toolbar.innerHTML = `
      <span class="status-text">Simulation stopped</span>
      <button id="tt-btn" class="toolbar-btn">Truth Table</button>
      <button id="tb-btn" class="toolbar-btn">Test Bench</button>
      <button id="nl-btn" class="toolbar-btn">Netlist</button>
      <div class="toolbar-separator"></div>
      <button id="reroute-btn" class="toolbar-btn toolbar-btn-accent" title="Reroute all wires using A* pathfinding">Reroute Wires</button>
      <button id="auto-reroute-btn" class="toolbar-btn toolbar-btn-accent" title="Toggle automatic wire rerouting after component drop">Auto-Reroute: ON</button>
      <button id="crossing-style-btn" class="toolbar-btn" title="Toggle wire crossing display style (ANSI bridges / IEC junctions)">Crossing: ANSI</button>
      <label class="speed-label" for="speed-slider">Speed: <input type="range" id="speed-slider" name="speed-slider" min="50" max="1000" value="850" step="50"></label>
      <span id="speed-value">200ms</span>
    `;
    // Slider: Inverted so right = faster, left = slower
    // Slider value goes 50..1000, but we invert: speed = 1050 - sliderValue
    // So slider=50 → speed=1000 (slow), slider=1000 → speed=50 (fast)
    const slider = toolbar.querySelector('#speed-slider');
    const speedValue = toolbar.querySelector('#speed-value');
    slider.addEventListener('input', (e) => {
      const inverted = 1050 - parseInt(e.target.value);
      speedValue.textContent = `${inverted}ms`;
      this.eventBus.emit('speed-change', inverted);
    });
    return toolbar;
  }
}
