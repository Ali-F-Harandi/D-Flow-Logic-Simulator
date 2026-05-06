export class Header {
  constructor(container, eventBus, engine) {
    this.container = container;
    this.eventBus = eventBus;
    this.engine = engine;
    this.element = this.build();
    container.appendChild(this.element);
    this._bindButtons();
    this._initTheme();
  }

  build() {
    const header = document.createElement('header');
    header.id = 'header';
    header.innerHTML = `
      <button class="hamburger-btn" title="Toggle sidebar">☰</button>
      <span class="app-title">Logic Gate Simulator</span>
      <div class="header-controls">
        <button class="header-btn run-btn">▶ Run</button>
        <button class="header-btn stop-btn">⏹ Stop</button>
        <button class="header-btn step-btn">⏭ Step</button>
        <button class="header-btn theme-toggle-btn" title="Toggle theme">🌙</button>
      </div>
    `;
    return header;
  }

  _bindButtons() {
    this.runBtn = this.element.querySelector('.run-btn');
    this.stopBtn = this.element.querySelector('.stop-btn');
    this.stepBtn = this.element.querySelector('.step-btn');
    this.hamburgerBtn = this.element.querySelector('.hamburger-btn');
    this.themeToggleBtn = this.element.querySelector('.theme-toggle-btn');

    this.runBtn.addEventListener('click', () => {
      this.engine.run();
      this.eventBus.emit('simulation-status', 'running');
    });
    this.stopBtn.addEventListener('click', () => {
      this.engine.stop();
      this.eventBus.emit('simulation-status', 'stopped');
    });
    this.stepBtn.addEventListener('click', () => {
      this.engine.step();
    });

    this.eventBus.on('simulation-status', (status) => {
      this._updateButtons(status);
    });
    this._updateButtons('stopped');

    // Hamburger toggles sidebar (and right panel if needed – event bus takes care)
    this.hamburgerBtn.addEventListener('click', () => {
      this.eventBus.emit('toggle-sidebar');
    });

    // Theme toggle
    this.themeToggleBtn.addEventListener('click', () => {
      const root = document.documentElement;
      const current = root.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem('logic-sim-theme', next);
      this._updateThemeIcon(next);
    });
  }

  _initTheme() {
    const saved = localStorage.getItem('logic-sim-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    this._updateThemeIcon(saved);
  }

  _updateThemeIcon(theme) {
    if (this.themeToggleBtn) {
      this.themeToggleBtn.innerHTML = theme === 'dark' ? '🌙' : '☀️';
    }
  }

  _updateButtons(status) {
    const running = status === 'running';
    this.runBtn.disabled = running;
    this.stopBtn.disabled = !running;
    this.stepBtn.disabled = running;
  }
}