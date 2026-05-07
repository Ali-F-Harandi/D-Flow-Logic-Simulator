import { Serializer } from '../utils/Serializer.js';

export class Header {
  constructor(container, eventBus, engine, canvas) {
    this.container = container;
    this.eventBus = eventBus;
    this.engine = engine;
    this.canvas = canvas;   // needed for selected components deletion
    this.element = this.build();
    container.appendChild(this.element);
    this._bindButtons();
    this._initTheme();
    this._bindGlobalShortcuts();
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
        <button class="header-btn save-btn" title="Save to localStorage">💾</button>
        <button class="header-btn load-btn" title="Restore last saved">📂</button>
        <button class="header-btn export-btn">📤 Export</button>
        <button class="header-btn import-btn">📥 Import</button>
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
    this.saveBtn = this.element.querySelector('.save-btn');
    this.loadBtn = this.element.querySelector('.load-btn');
    this.exportBtn = this.element.querySelector('.export-btn');
    this.importBtn = this.element.querySelector('.import-btn');

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

    this.eventBus.on('simulation-status', (status) => this._updateButtons(status));
    this._updateButtons('stopped');

    this.hamburgerBtn.addEventListener('click', () => this.eventBus.emit('toggle-sidebar'));

    this.themeToggleBtn.addEventListener('click', () => {
      const root = document.documentElement;
      const current = root.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem('logic-sim-theme', next);
      this._updateThemeIcon(next);
    });

    // Save
    this.saveBtn.addEventListener('click', () => {
      const state = Serializer.exportState(this.engine);
      localStorage.setItem('logic-sim-project', JSON.stringify(state));
      // brief user feedback (use status event)
      this.eventBus.emit('simulation-status', 'stopped'); // keep consistent
      alert('Project saved to localStorage.');
    });

    // Load
    this.loadBtn.addEventListener('click', () => {
      const saved = localStorage.getItem('logic-sim-project');
      if (!saved) {
        alert('No saved project found.');
        return;
      }
      if (confirm('Load saved project? This will replace the current circuit.')) {
        try {
          const data = JSON.parse(saved);
          Serializer.importState(data, this.engine, this.canvas, this.factory); // factory needs to be accessible; we'll store a reference
        } catch (e) {
          console.error(e);
          alert('Failed to load project.');
        }
      }
    });
    // Note: import button uses dynamic import. We'll set this.factory after creation in main.js.

    // Export JSON
    this.exportBtn.addEventListener('click', () => {
      const state = Serializer.exportState(this.engine);
      const json = JSON.stringify(state, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'circuit.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    // Import JSON
    this.importBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            Serializer.importState(data, this.engine, this.canvas, this.factory);
          } catch (err) {
            alert('Invalid circuit file.');
            console.error(err);
          }
        };
        reader.readAsText(file);
      };
      input.click();
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

  _bindGlobalShortcuts() {
    // Delete key: delete selected components
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' && document.activeElement === document.body) {
        e.preventDefault();
        if (this.canvas) {
          this.canvas.deleteSelectedComponents();
        }
      }
    });
  }

  setFactory(factory) {
    this.factory = factory;
  }
}