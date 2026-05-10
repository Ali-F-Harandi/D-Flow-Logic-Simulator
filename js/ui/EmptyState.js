/**
 * EmptyState.js — "Start Building" overlay for empty canvas
 *
 * Shows a welcoming overlay when the canvas is empty, offering:
 *   - New Circuit (blank canvas)
 *   - Load example circuits
 *   - Restore saved project
 *
 * Automatically hides when the first component is added.
 */

import { ExampleCircuits } from '../utils/ExampleCircuits.js';
import { Serializer } from '../utils/Serializer.js';

export class EmptyState {
  constructor(canvasContainer, eventBus, engine, canvas, factory) {
    this.container = canvasContainer;
    this.eventBus = eventBus;
    this.engine = engine;
    this.canvas = canvas;
    this.factory = factory;
    this.overlay = null;

    // Show on init if canvas is empty
    this._checkAndShow();

    // Listen for component additions to auto-hide
    this.eventBus.on('component-created', () => this._hide());
    this.eventBus.on('component-drop', () => this._hide());
    this.eventBus.on('clear-all', () => this._checkAndShow());
  }

  _checkAndShow() {
    // Small delay to let the canvas initialize
    setTimeout(() => {
      if (this.engine.components.size === 0) {
        this._show();
      }
    }, 200);
  }

  _show() {
    if (this.overlay) return; // Already showing

    this.overlay = document.createElement('div');
    this.overlay.className = 'empty-state-overlay';

    const h2 = document.createElement('h2');
    h2.textContent = 'Start Building Your Circuit';

    const p = document.createElement('p');
    p.textContent = 'Drag components from the sidebar, or load an example to get started.';

    const actions = document.createElement('div');
    actions.className = 'empty-state-actions';

    // "New Circuit" button - just dismisses the overlay
    const newBtn = document.createElement('button');
    newBtn.className = 'empty-state-btn empty-state-btn-primary';
    newBtn.textContent = 'New Circuit';
    newBtn.addEventListener('click', () => this._hide());

    // "Load Example" button
    const exampleBtn = document.createElement('button');
    exampleBtn.className = 'empty-state-btn';
    exampleBtn.textContent = 'Load Example';
    exampleBtn.addEventListener('click', () => this._loadExample());

    // "Restore Saved" button (only if a save exists)
    const savedProject = localStorage.getItem('dflow-project');
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'empty-state-btn';
    restoreBtn.textContent = 'Restore Saved';
    restoreBtn.style.display = savedProject ? '' : 'none';
    restoreBtn.addEventListener('click', () => this._restoreSaved());

    actions.appendChild(newBtn);
    actions.appendChild(exampleBtn);
    if (savedProject) actions.appendChild(restoreBtn);

    this.overlay.appendChild(h2);
    this.overlay.appendChild(p);
    this.overlay.appendChild(actions);
    this.container.appendChild(this.overlay);
  }

  _hide() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  _loadExample() {
    const examples = ExampleCircuits.getAll();
    if (examples.length === 0) {
      if (this.canvas) this.canvas.showToast('No examples available', 'warning');
      return;
    }
    // Load the first example
    try {
      const data = examples[0].data();
      Serializer.importState(data, this.engine, this.canvas, this.factory);
      if (this.canvas) this.canvas.showToast(`Loaded: ${examples[0].name}`, 'success');
    } catch (err) {
      console.error('Failed to load example:', err);
      if (this.canvas) this.canvas.showToast('Failed to load example', 'error');
    }
    this._hide();
  }

  _restoreSaved() {
    const saved = localStorage.getItem('dflow-project');
    if (!saved) return;
    try {
      const data = JSON.parse(saved);
      Serializer.importState(data, this.engine, this.canvas, this.factory);
      if (this.canvas) this.canvas.showToast('Project restored!', 'success');
    } catch (err) {
      console.error('Failed to restore project:', err);
      if (this.canvas) this.canvas.showToast('Failed to restore project', 'error');
    }
    this._hide();
  }
}
