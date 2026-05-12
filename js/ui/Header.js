import { Serializer } from '../utils/Serializer.js';
import { ExampleCircuits } from '../utils/ExampleCircuits.js';
import { icon, replaceIcons } from '../utils/IconHelper.js';
import { ConfirmDialog } from '../utils/ConfirmDialog.js';
import { VerilogExporter } from '../utils/VerilogExporter.js';

export class Header {
  constructor(container, eventBus, engine, canvas) {
    this.container = container;
    this.eventBus = eventBus;
    this.engine = engine;
    this.canvas = canvas;
    this.element = this.build();
    container.appendChild(this.element);
    this._bindButtons();
    // HP-2 FIX: Removed _bindGlobalShortcuts() — the Delete key handler
    // here was duplicating the one in CanvasEvents._bindKeyboard().
    // Both listened on window for 'Delete' and could fire double-delete.
    // CanvasEvents already handles all keyboard shortcuts properly.
  }

  build() {
    const header = document.createElement('header');
    header.id = 'header';
    header.innerHTML = `
      <button class="hamburger-btn" title="Toggle sidebar" aria-label="Toggle sidebar">
        ${icon('menu', '', { size: 16 })}
      </button>
      <span class="app-title">D-Flow</span>
      <div class="header-controls">
        <button class="header-btn run-btn" title="Run simulation (continuous)" aria-label="Run simulation">
          ${icon('play', 'Run', { size: 14 })}
        </button>
        <button class="header-btn stop-btn" title="Stop simulation" aria-label="Stop simulation">
          ${icon('square', 'Stop', { size: 14 })}
        </button>
        <button class="header-btn step-btn" title="Advance one step" aria-label="Step simulation">
          ${icon('skip-forward', 'Step', { size: 14 })}
        </button>
        <button class="header-btn reset-btn" title="Reset all component states" aria-label="Reset simulation">
          ${icon('rotate-ccw', 'Reset', { size: 14 })}
        </button>
        <div class="toolbar-separator" style="display:inline-block;width:1px;height:20px;background:var(--color-border);margin:0 4px;vertical-align:middle;"></div>
        <button class="header-btn undo-btn" title="Undo (Ctrl+Z)" aria-label="Undo" disabled>
          ${icon('undo-2', '', { size: 14 })}
        </button>
        <button class="header-btn redo-btn" title="Redo (Ctrl+Y)" aria-label="Redo" disabled>
          ${icon('redo-2', '', { size: 14 })}
        </button>
        <div class="toolbar-separator" style="display:inline-block;width:1px;height:20px;background:var(--color-border);margin:0 4px;vertical-align:middle;"></div>
        <button class="header-btn zoom-fit-btn" title="Zoom to fit all components" aria-label="Zoom to fit">
          ${icon('maximize', '', { size: 14 })}
        </button>
        <button class="header-btn center-btn" title="Center canvas view" aria-label="Center view">
          ${icon('crosshair', '', { size: 14 })}
        </button>
        <button class="header-btn save-btn" title="Save to browser storage" aria-label="Save project">
          ${icon('save', '', { size: 14 })}
        </button>
        <button class="header-btn load-btn" title="Restore last saved project" aria-label="Load project">
          ${icon('folder-open', '', { size: 14 })}
        </button>
        <button class="header-btn export-btn" title="Export circuit as JSON file" aria-label="Export circuit">
          ${icon('download', 'Export', { size: 14 })}
        </button>
        <button class="header-btn import-btn" title="Import circuit from JSON file" aria-label="Import circuit">
          ${icon('upload', 'Import', { size: 14 })}
        </button>
        <button class="header-btn verilog-btn" title="Export circuit as Verilog HDL" aria-label="Export Verilog">
          ${icon('file-code', 'Verilog', { size: 14 })}
        </button>
        <button class="header-btn examples-btn" title="Load example circuit" aria-label="Example circuits">
          ${icon('layout-grid', 'Examples', { size: 14 })}
        </button>
      </div>
    `;
    replaceIcons(header);
    return header;
  }

  _bindButtons() {
    this.runBtn = this.element.querySelector('.run-btn');
    this.stopBtn = this.element.querySelector('.stop-btn');
    this.stepBtn = this.element.querySelector('.step-btn');
    this.resetBtn = this.element.querySelector('.reset-btn');
    this.hamburgerBtn = this.element.querySelector('.hamburger-btn');
    this.saveBtn = this.element.querySelector('.save-btn');
    this.loadBtn = this.element.querySelector('.load-btn');
    this.exportBtn = this.element.querySelector('.export-btn');
    this.importBtn = this.element.querySelector('.import-btn');
    this.zoomFitBtn = this.element.querySelector('.zoom-fit-btn');
    this.centerBtn = this.element.querySelector('.center-btn');
    this.examplesBtn = this.element.querySelector('.examples-btn');
    this.undoBtn = this.element.querySelector('.undo-btn');
    this.redoBtn = this.element.querySelector('.redo-btn');
    this.verilogBtn = this.element.querySelector('.verilog-btn');

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

    // Example circuits
    this.examplesBtn.addEventListener('click', () => this._showExamplesDialog());

    // Undo button
    if (this.undoBtn) {
      this.undoBtn.addEventListener('click', () => {
        // Will be wired to undoManager once available
        this.eventBus.emit('undo-request');
      });
    }

    // Redo button
    if (this.redoBtn) {
      this.redoBtn.addEventListener('click', () => {
        this.eventBus.emit('redo-request');
      });
    }

    // Save
    this.saveBtn.addEventListener('click', () => {
      const state = Serializer.exportState(this.engine);
      localStorage.setItem('dflow-project', JSON.stringify(state));
      this.eventBus.emit('project-saved');
      if (this.canvas) this.canvas.showToast('Project saved!', 'success');
      else alert('Project saved to localStorage.');
    });

    // Load (uses themed ConfirmDialog)
    this.loadBtn.addEventListener('click', async () => {
      const saved = localStorage.getItem('dflow-project');
      if (!saved) {
        if (this.canvas) this.canvas.showToast('No saved project found', 'warning');
        else alert('No saved project found.');
        return;
      }
      const confirmed = await ConfirmDialog.show(
        'Load saved project? This will replace the current circuit.',
        { title: 'Load Project', confirmText: 'Load', confirmClass: 'confirm-dialog-btn-danger' }
      );
      if (!confirmed) return;
      try {
        const data = JSON.parse(saved);
        Serializer.importState(data, this.engine, this.canvas, this.factory);
        if (this.canvas) this.canvas.showToast('Project loaded!', 'success');
      } catch (e) {
        console.error(e);
        if (this.canvas) this.canvas.showToast('Failed to load project', 'error');
        else alert('Failed to load project.');
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

    // Export Verilog
    if (this.verilogBtn) {
      this.verilogBtn.addEventListener('click', () => {
        if (this.engine.components.size === 0) {
          if (this.canvas) this.canvas.showToast('No circuit to export', 'warning');
          return;
        }
        try {
          VerilogExporter.download(this.engine);
          if (this.canvas) this.canvas.showToast('Verilog file exported!', 'success');
        } catch (err) {
          console.error('Verilog export failed:', err);
          if (this.canvas) this.canvas.showToast('Verilog export failed', 'error');
        }
      });
    }
  }

  /**
   * Show a dialog with example circuits to load.
   */
  _showExamplesDialog() {
    const examples = ExampleCircuits.getAll();

    // Remove any existing dialog
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
      border-radius: 8px; padding: 20px; max-width: 500px; width: 90%;
      max-height: 80vh; overflow-y: auto; box-shadow: var(--shadow-lg);
    `;

    const headerEl = document.createElement('div');
    headerEl.style.cssText = `
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--color-border);
    `;
    headerEl.innerHTML = `<h3 style="margin:0;color:var(--color-accent)">Example Circuits</h3>`;

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = icon('x', '', { size: 16 });
    closeBtn.style.cssText = `
      background: var(--color-surface-alt); border: 1px solid var(--color-border);
      color: var(--color-text); width: 28px; height: 28px; border-radius: 50%;
      cursor: pointer; font-size: 14px; display: flex; align-items: center;
      justify-content: center;
    `;
    replaceIcons(closeBtn);
    closeBtn.addEventListener('click', () => dialog.remove());
    headerEl.appendChild(closeBtn);
    content.appendChild(headerEl);

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

      item.addEventListener('click', async () => {
        if (this.engine.components.size > 0) {
          const confirmed = await ConfirmDialog.show(
            'Loading this example will replace your current circuit. Continue?',
            { title: 'Load Example', confirmText: 'Load', confirmClass: 'confirm-dialog-btn-danger' }
          );
          if (!confirmed) return;
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

  // HP-2 FIX: Removed _bindGlobalShortcuts() entirely.
  // The Delete key handler here duplicated CanvasEvents._bindKeyboard().
  // Both listened on `window` for 'keydown' with 'Delete', causing
  // double-deletion when both fired. CanvasEvents already handles
  // Delete/Backspace, Ctrl+Z, Ctrl+Y, Ctrl+C, Ctrl+V, arrows, etc.

  setFactory(factory) {
    this.factory = factory;
  }

  /**
   * Update undo/redo button states based on undoManager.
   */
  updateUndoRedoState(canUndo, canRedo) {
    if (this.undoBtn) {
      this.undoBtn.disabled = !canUndo;
    }
    if (this.redoBtn) {
      this.redoBtn.disabled = !canRedo;
    }
  }
}
