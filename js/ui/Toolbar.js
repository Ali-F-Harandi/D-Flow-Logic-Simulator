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

    // HP-8 FIX: Use window.addEventListener instead of document.addEventListener
    // for 'simulation-error' CustomEvent. The Engine dispatches it via
    // document.dispatchEvent(new CustomEvent('simulation-error', ...)),
    // but CustomEvents dispatched on document do NOT bubble to window.
    // Actually, they DO propagate within the document. The real fix is
    // that we should listen on the same target that dispatches the event.
    // Engine dispatches on `document`, so we listen on `document`.
    // However, the original code used `document.addEventListener` which
    // is correct. Let me verify the dispatch source...
    // Engine.js line: document.dispatchEvent(new CustomEvent('simulation-error', ...))
    // This is fine. But there's a subtle bug: the listener was using
    // `document.addEventListener` which works. The issue is that the
    // event detail should show properly. No change needed here for HP-8
    // actually - the real HP-8 is about the speed slider.
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
      <label class="speed-label" for="speed-slider">Speed: <input type="range" id="speed-slider" name="speed-slider" min="50" max="1000" value="850" step="50"></label>
      <span id="speed-value">200ms</span>
    `;
    // Slider: Inverted so right = faster, left = slower
    // Slider value goes 50..1000, but we invert: speed = 1050 - sliderValue
    // So slider=50 → speed=1000 (slow), slider=1000 → speed=50 (fast)
    // FIX (Bug #9): Changed default slider value from 800 to 850 so
    // 1050-850=200ms matches the engine's default speed of 200ms.
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
