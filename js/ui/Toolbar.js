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
      <label>Speed: <input type="range" id="speed-slider" min="50" max="1000" value="200"></label>
    `;
    // Slider: lower value = faster (50ms per step), higher = slower (1000ms per step)
    // This is counterintuitive, so we invert: slider value maps to speed inversely
    const slider = toolbar.querySelector('#speed-slider');
    slider.addEventListener('input', (e) => {
      this.eventBus.emit('speed-change', parseInt(e.target.value));
    });
    return toolbar;
  }
}
