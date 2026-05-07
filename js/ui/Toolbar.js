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
      <label>Speed: <input type="range" id="speed-slider" min="50" max="1000" value="800"></label>
    `;
    // Slider: Inverted so right = faster, left = slower
    // Slider value goes 50..1000, but we invert: speed = 1050 - sliderValue
    // So slider=50 → speed=1000 (slow), slider=1000 → speed=50 (fast)
    const slider = toolbar.querySelector('#speed-slider');
    slider.addEventListener('input', (e) => {
      const inverted = 1050 - parseInt(e.target.value);
      this.eventBus.emit('speed-change', inverted);
    });
    return toolbar;
  }
}
