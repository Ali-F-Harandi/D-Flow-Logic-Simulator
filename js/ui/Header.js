import { Serializer } from '../utils/Serializer.js';

export class Header {
  constructor(container, eventBus, engine, canvas) {
    this.container = container;
    this.eventBus = eventBus;
    this.engine = engine;
    this.canvas = canvas;
    this.element = this.build();
    container.appendChild(this.element);
    this._bindButtons();
    this._initTheme();
    // HP-2 FIX: Removed _bindGlobalShortcuts() — the Delete key handler
    // here was duplicating the one in CanvasEvents._bindKeyboard().
    // Both listened on window for 'Delete' and could fire double-delete.
    // CanvasEvents already handles all keyboard shortcuts properly.
  }

  build() {
    const header = document.createElement('header');
    header.id = 'header';
    header.innerHTML = `
      <button class="hamburger-btn" title="Toggle sidebar">☰</button>
      <span class="app-title">Logic Gate Simulator</span>
      <div class="header-controls">
        <button class="header-btn run-btn" title="Run simulation (continuous)">▶ Run</button>
        <button class="header-btn stop-btn" title="Stop simulation">⏹ Stop</button>
        <button class="header-btn step-btn" title="Advance one step">⏭ Step</button>
        <button class="header-btn reset-btn" title="Reset all component states">↺ Reset</button>
        <button class="header-btn zoom-fit-btn" title="Zoom to fit all components">⊞</button>
        <button class="header-btn save-btn" title="Save to browser storage">💾</button>
        <button class="header-btn load-btn" title="Restore last saved project">📂</button>
        <button class="header-btn export-btn" title="Export circuit as JSON file">📤 Export</button>
        <button class="header-btn import-btn" title="Import circuit from JSON file">📥 Import</button>
        <button class="header-btn theme-toggle-btn" title="Toggle theme (dark/light/high-contrast)">🌙</button>
      </div>
    `;
    return header;
  }

  _bindButtons() {
    this.runBtn = this.element.querySelector('.run-btn');
    this.stopBtn = this.element.querySelector('.stop-btn');
    this.stepBtn = this.element.querySelector('.step-btn');
    this.resetBtn = this.element.querySelector('.reset-btn');
    this.hamburgerBtn = this.element.querySelector('.hamburger-btn');
    this.themeToggleBtn = this.element.querySelector('.theme-toggle-btn');
    this.saveBtn = this.element.querySelector('.save-btn');
    this.loadBtn = this.element.querySelector('.load-btn');
    this.exportBtn = this.element.querySelector('.export-btn');
    this.importBtn = this.element.querySelector('.import-btn');
    this.zoomFitBtn = this.element.querySelector('.zoom-fit-btn');

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
    this.resetBtn.addEventListener('click', () => {
      this.engine.reset();
      this.eventBus.emit('simulation-status', 'stopped');
    });

    this.zoomFitBtn.addEventListener('click', () => {
      if (this.canvas) {
        this.canvas.zoomToFit();
      }
    });

    this.eventBus.on('simulation-status', (status) => this._updateButtons(status));
    this._updateButtons('stopped');

    this.hamburgerBtn.addEventListener('click', () => this.eventBus.emit('toggle-sidebar'));

    this.themeToggleBtn.addEventListener('click', () => {
      const root = document.documentElement;
      const current = root.getAttribute('data-theme') || 'dark';
      const order = ['dark', 'light', 'high-contrast'];
      const nextIndex = (order.indexOf(current) + 1) % order.length;
      const next = order[nextIndex];
      root.setAttribute('data-theme', next);
      localStorage.setItem('logic-sim-theme', next);
      this._updateThemeIcon(next);
    });

    // Save
    this.saveBtn.addEventListener('click', () => {
      const state = Serializer.exportState(this.engine);
      localStorage.setItem('logic-sim-project', JSON.stringify(state));
      if (this.canvas) this.canvas.showToast('Project saved!', 'success');
      else alert('Project saved to localStorage.');
    });

    // Load
    this.loadBtn.addEventListener('click', () => {
      const saved = localStorage.getItem('logic-sim-project');
      if (!saved) {
        if (this.canvas) this.canvas.showToast('No saved project found', 'warning');
        else alert('No saved project found.');
        return;
      }
      if (confirm('Load saved project? This will replace the current circuit.')) {
        try {
          const data = JSON.parse(saved);
          Serializer.importState(data, this.engine, this.canvas, this.factory);
          if (this.canvas) this.canvas.showToast('Project loaded!', 'success');
        } catch (e) {
          console.error(e);
          if (this.canvas) this.canvas.showToast('Failed to load project', 'error');
          else alert('Failed to load project.');
        }
      }
    });

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
            if (this.canvas) this.canvas.showToast('Circuit imported!', 'success');
          } catch (err) {
            if (this.canvas) this.canvas.showToast('Invalid circuit file', 'error');
            else alert('Invalid circuit file.');
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
      const icons = { dark: '🌙', light: '☀️', 'high-contrast': '⬛' };
      this.themeToggleBtn.innerHTML = icons[theme] || '🌙';
    }
  }

  _updateButtons(status) {
    const running = status === 'running';
    this.runBtn.disabled = running;
    this.stopBtn.disabled = !running;
    this.stepBtn.disabled = running;
  }

  // HP-2 FIX: Removed _bindGlobalShortcuts() entirely.
  // The Delete key handler here duplicated CanvasEvents._bindKeyboard().
  // Both listened on `window` for 'keydown' with 'Delete', causing
  // double-deletion when both fired. CanvasEvents already handles
  // Delete/Backspace, Ctrl+Z, Ctrl+Y, Ctrl+C, Ctrl+V, arrows, etc.

  setFactory(factory) {
    this.factory = factory;
  }
}
