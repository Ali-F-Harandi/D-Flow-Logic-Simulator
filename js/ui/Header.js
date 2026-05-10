import { Serializer } from '../utils/Serializer.js';
import { ExampleCircuits } from '../utils/ExampleCircuits.js';

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
  }

  build() {
    const header = document.createElement('header');
    header.id = 'header';
    header.innerHTML = `
      <button class="hamburger-btn" title="Toggle sidebar" aria-label="Toggle sidebar"><i data-lucide="menu" style="width:18px;height:18px"></i></button>
      <span class="app-title">D-Flow</span>
      <div class="header-controls">
        <button class="header-btn run-btn" title="Run simulation (continuous)" aria-label="Run simulation"><i data-lucide="play" style="width:14px;height:14px"></i> Run</button>
        <button class="header-btn stop-btn" title="Stop simulation" aria-label="Stop simulation"><i data-lucide="square" style="width:14px;height:14px"></i> Stop</button>
        <button class="header-btn step-btn" title="Advance one step" aria-label="Step simulation"><i data-lucide="step-forward" style="width:14px;height:14px"></i> Step</button>
        <button class="header-btn reset-btn" title="Reset all component states" aria-label="Reset simulation"><i data-lucide="rotate-ccw" style="width:14px;height:14px"></i> Reset</button>
        <button class="header-btn zoom-fit-btn" title="Zoom to fit all components" aria-label="Zoom to fit"><i data-lucide="maximize" style="width:14px;height:14px"></i></button>
        <button class="header-btn center-btn" title="Center canvas view" aria-label="Center view"><i data-lucide="crosshair" style="width:14px;height:14px"></i></button>
        <button class="header-btn save-btn" title="Save to browser storage" aria-label="Save project"><i data-lucide="save" style="width:14px;height:14px"></i></button>
        <button class="header-btn load-btn" title="Restore last saved project" aria-label="Load project"><i data-lucide="folder-open" style="width:14px;height:14px"></i></button>
        <button class="header-btn export-btn" title="Export circuit as JSON file" aria-label="Export circuit"><i data-lucide="upload" style="width:14px;height:14px"></i> Export</button>
        <button class="header-btn import-btn" title="Import circuit from JSON file" aria-label="Import circuit"><i data-lucide="download" style="width:14px;height:14px"></i> Import</button>
        <button class="header-btn theme-toggle-btn" title="Toggle theme (dark/light/high-contrast)" aria-label="Toggle theme"><i data-lucide="moon" style="width:14px;height:14px"></i></button>
        <button class="header-btn examples-btn" title="Load example circuit" aria-label="Example circuits"><i data-lucide="book-open" style="width:14px;height:14px"></i> Examples</button>
      </div>
    `;

    // Initialize Lucide icons
    if (window.lucide) {
      try { window.lucide.createIcons(); } catch(e) { /* fallback */ }
    }

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
    this.centerBtn = this.element.querySelector('.center-btn');
    this.examplesBtn = this.element.querySelector('.examples-btn');

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

    this.centerBtn.addEventListener('click', () => {
      if (this.canvas) {
        this.canvas.core.centerView();
        this.canvas.wiring.scheduleRedraw();
      }
    });

    this.eventBus.on('simulation-status', (status) => this._updateButtons(status));
    this._updateButtons('stopped');

    this.hamburgerBtn.addEventListener('click', () => this.eventBus.emit('toggle-sidebar'));

    this.examplesBtn.addEventListener('click', () => this._showExamplesDialog());

    this.themeToggleBtn.addEventListener('click', () => {
      const root = document.documentElement;
      const current = root.getAttribute('data-theme') || 'dark';
      const order = ['dark', 'light', 'high-contrast'];
      const nextIndex = (order.indexOf(current) + 1) % order.length;
      const next = order[nextIndex];
      root.setAttribute('data-theme', next);
      localStorage.setItem('dflow-theme', next);
      this._updateThemeIcon(next);
    });

    this.saveBtn.addEventListener('click', () => {
      const state = Serializer.exportState(this.engine);
      localStorage.setItem('dflow-project', JSON.stringify(state));
      if (this.canvas) this.canvas.showToast('Project saved!', 'success');
      else alert('Project saved to localStorage.');
    });

    this.loadBtn.addEventListener('click', () => {
      const saved = localStorage.getItem('dflow-project');
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
    const saved = localStorage.getItem('dflow-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    this._updateThemeIcon(saved);
  }

  _updateThemeIcon(theme) {
    if (this.themeToggleBtn) {
      const iconMap = { dark: 'moon', light: 'sun', 'high-contrast': 'contrast' };
      const iconName = iconMap[theme] || 'moon';
      // Update the Lucide icon
      const iconEl = this.themeToggleBtn.querySelector('i[data-lucide]');
      if (iconEl) {
        iconEl.setAttribute('data-lucide', iconName);
        // Re-render the icon
        if (window.lucide) {
          try { window.lucide.createIcons({ nodes: [iconEl] }); } catch(e) {}
        }
      }
    }
  }

  _showExamplesDialog() {
    const examples = ExampleCircuits.getAll();

    const existing = document.getElementById('examples-dialog');
    if (existing) existing.remove();

    const dialog = document.createElement('div');
    dialog.id = 'examples-dialog';
    dialog.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5); z-index: 2000;
      display: flex; align-items: center; justify-content: center;
      font-family: var(--font-family);
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      background: var(--color-surface); border: 1px solid var(--color-border);
      border-radius: 8px; padding: 20px; max-width: 550px; width: 90%;
      max-height: 80vh; overflow-y: auto; box-shadow: var(--shadow-lg);
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--color-border);
    `;
    header.innerHTML = `<h3 style="margin:0;color:var(--color-accent)">Example Circuits</h3>`;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u2715';
    closeBtn.style.cssText = `
      background: var(--color-surface-alt); border: 1px solid var(--color-border);
      color: var(--color-text); width: 28px; height: 28px; border-radius: 50%;
      cursor: pointer; font-size: 14px; display: flex; align-items: center;
      justify-content: center;
    `;
    closeBtn.addEventListener('click', () => dialog.remove());
    header.appendChild(closeBtn);
    content.appendChild(header);

    for (const ex of examples) {
      const item = document.createElement('div');
      item.style.cssText = `
        padding: 12px; margin-bottom: 8px; background: var(--color-surface-alt);
        border: 1px solid var(--color-border); border-radius: 6px;
        cursor: pointer; transition: border-color 0.2s;
      `;
      item.addEventListener('mouseenter', () => { item.style.borderColor = 'var(--color-accent)'; });
      item.addEventListener('mouseleave', () => { item.style.borderColor = 'var(--color-border)'; });

      const name = document.createElement('div');
      name.style.cssText = 'font-weight: 600; color: var(--color-accent); margin-bottom: 4px;';
      name.textContent = ex.name;

      const desc = document.createElement('div');
      desc.style.cssText = 'font-size: 12px; color: var(--color-text-muted);';
      desc.textContent = ex.description;

      item.appendChild(name);
      item.appendChild(desc);

      item.addEventListener('click', () => {
        if (this.engine.components.size > 0) {
          if (!confirm('Loading this example will replace your current circuit. Continue?')) return;
        }
        try {
          const data = ex.data();
          Serializer.importState(data, this.engine, this.canvas, this.factory);
          if (this.canvas) this.canvas.showToast(`Loaded: ${ex.name}`, 'success');
        } catch (err) {
          console.error('Failed to load example:', err);
          if (this.canvas) this.canvas.showToast('Failed to load example', 'error');
        }
        dialog.remove();
      });

      content.appendChild(item);
    }

    dialog.appendChild(content);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });
    document.body.appendChild(dialog);
  }

  _updateButtons(status) {
    const running = status === 'running';
    this.runBtn.disabled = running;
    this.stopBtn.disabled = !running;
    this.stepBtn.disabled = running;
    this.element.classList.toggle('sim-running', running);
  }

  setFactory(factory) {
    this.factory = factory;
  }
}
