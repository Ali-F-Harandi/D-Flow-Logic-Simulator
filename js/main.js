import { EventBus } from './utils/EventBus.js';
import { Header } from './ui/Header.js';
import { Sidebar } from './ui/Sidebar.js';
import { Canvas } from './ui/Canvas.js';
import { Toolbar } from './ui/Toolbar.js';
import { Footer } from './ui/Footer.js';
import { PanelManager } from './ui/PanelManager.js';
import { ComponentFactory } from './core/ComponentFactory.js';
import { Engine } from './core/Engine.js';
import { UndoManager, AddComponentCommand } from './utils/UndoManager.js';
import { Serializer } from './utils/Serializer.js';
import { HelpOverlay } from './ui/HelpOverlay.js';
import { CircuitValidator } from './utils/CircuitValidator.js';
import { OnboardingTour } from './ui/OnboardingTour.js';
import { EmptyState } from './ui/EmptyState.js';
import { ConfirmDialog } from './utils/ConfirmDialog.js';
import { SubcircuitManager } from './utils/SubcircuitManager.js';

// --------------------------------------------------
// GLOBAL ERROR HANDLER – shows any import/parse error
// --------------------------------------------------
window.addEventListener('error', (event) => {
  console.error('Global error caught:', event.error);
  const div = document.createElement('div');
  div.style.position = 'fixed'; div.style.top = '0'; div.style.left = '0';
  div.style.right = '0';
  div.style.background = 'red'; div.style.color = 'white';
  div.style.padding = '10px'; div.style.zIndex = '99999';
  div.textContent = 'Error: ' + (event.error ? event.error.message : event.message);
  document.body.appendChild(div);
});

document.addEventListener('DOMContentLoaded', async () => {
  const appContainer = document.getElementById('app');
  const eventBus = new EventBus();
  const factory = new ComponentFactory();
  const engine = new Engine();
  const undoManager = new UndoManager();

  const header = new Header(appContainer, eventBus, engine, null);
  const sidebar = new Sidebar(appContainer, eventBus, factory);
  const canvas = new Canvas(appContainer, eventBus, engine, factory, undoManager);
  header.canvas = canvas;
  header.setFactory(factory);

  const toolbar = new Toolbar(appContainer, eventBus);
  const footer = new Footer(appContainer, eventBus);
  const panelManager = new PanelManager(appContainer, eventBus, engine, canvas, undoManager);

  // Initialize keyboard shortcut help overlay
  new HelpOverlay();

  // Initialize onboarding tour (shows once for new users)
  new OnboardingTour(eventBus);

  // Initialize empty state overlay
  new EmptyState(canvas.element, eventBus, engine, canvas, factory);

  // Wire up undo/redo buttons in header
  eventBus.on('undo-request', () => {
    if (undoManager.canUndo()) {
      undoManager.undo();
    }
  });
  eventBus.on('redo-request', () => {
    if (undoManager.canRedo()) {
      undoManager.redo();
    }
  });

  // Update undo/redo button states (event-driven instead of polling)
  const updateUndoRedo = () => {
    header.updateUndoRedoState(undoManager.canUndo(), undoManager.canRedo());
  };
  // Update on relevant events
  eventBus.on('undo-request', updateUndoRedo);
  eventBus.on('redo-request', updateUndoRedo);
  eventBus.on('component-drop', updateUndoRedo);
  eventBus.on('selection-changed', updateUndoRedo);
  eventBus.on('wire-connected', updateUndoRedo);
  eventBus.on('component-deleted', updateUndoRedo);
  eventBus.on('wire-removed', updateUndoRedo);
  eventBus.on('component-modified', updateUndoRedo);
  // Initial update
  updateUndoRedo();

  // Wire up footer zoom controls
  eventBus.on('zoom-in', () => {
    canvas.core.scale = Math.min(canvas.core.scale * 1.2, canvas.core.maxScale);
    canvas.core.applyTransform();
  });
  eventBus.on('zoom-out', () => {
    canvas.core.scale = Math.max(canvas.core.scale / 1.2, canvas.core.minScale);
    canvas.core.applyTransform();
  });
  eventBus.on('zoom-fit', () => {
    canvas.zoomToFit();
  });

  // Auto-save indicator (event-driven instead of polling)
  let _lastSaveTime = Date.now();
  let _hasUnsavedChanges = false;

  const _updateAutosaveIndicator = () => {
    const indicator = document.getElementById('autosave-indicator');
    if (indicator) {
      if (_hasUnsavedChanges) {
        indicator.textContent = 'Unsaved changes';
        indicator.className = 'autosave-indicator unsaved';
      } else {
        const elapsed = Math.round((Date.now() - _lastSaveTime) / 1000);
        if (elapsed < 60) {
          indicator.textContent = `Saved ${elapsed}s ago`;
        } else {
          indicator.textContent = `Saved ${Math.round(elapsed / 60)}m ago`;
        }
        indicator.className = 'autosave-indicator';
      }
    }
  };

  const _markUnsaved = () => {
    _hasUnsavedChanges = true;
    _updateAutosaveIndicator();
  };

  eventBus.on('component-drop', _markUnsaved);
  eventBus.on('selection-changed', _markUnsaved);
  eventBus.on('wire-connected', _markUnsaved);
  eventBus.on('component-deleted', _markUnsaved);
  eventBus.on('wire-removed', _markUnsaved);
  eventBus.on('component-modified', _markUnsaved);

  // Track save events
  eventBus.on('project-saved', () => {
    _lastSaveTime = Date.now();
    _hasUnsavedChanges = false;
    _updateAutosaveIndicator();
  });

  // Update elapsed time display less frequently (every 30s instead of 5s)
  setInterval(_updateAutosaveIndicator, 30000);

  // Right panel auto-expand on first wire creation
  let _firstWireCreated = false;
  document.addEventListener('wire-connected', () => {
    if (!_firstWireCreated) {
      _firstWireCreated = true;
      eventBus.emit('show-panel', 'truth');
      // Pulse the truth table tab briefly
      const ttBtn = document.querySelector('#tt-btn');
      if (ttBtn) {
        ttBtn.style.boxShadow = '0 0 8px var(--color-accent)';
        setTimeout(() => { ttBtn.style.boxShadow = ''; }, 2000);
      }
    }
  });

  // Simulation error → status pill
  document.addEventListener('simulation-error', () => {
    eventBus.emit('simulation-status', 'error');
  });

  eventBus.on('component-drop', ({ type, x, y }) => {
    const comp = factory.createComponent(type);
    comp.position.x = x;
    comp.position.y = y;
    const cmd = new AddComponentCommand(engine, canvas, comp);
    undoManager.execute(cmd);
  });

  eventBus.on('speed-change', (speed) => engine.setSpeed(speed));
  eventBus.on('set-testbench-output', (nodeId) => {
    panelManager.testBenchPanel.setOutputNode(nodeId);
  });

  // Circuit validation
  eventBus.on('validate-circuit', () => {
    const validator = new CircuitValidator(engine);
    const result = validator.validate();
    if (result.valid && result.warnings.length === 0) {
      canvas.showToast('Circuit validation passed!', 'success');
    } else if (result.valid) {
      const msg = result.warnings.map(w => w.message).join('\\n');
      canvas.showToast(`Warnings: ${result.warnings.length}`, 'warning');
      console.log('Validation warnings:', result.warnings);
    } else {
      const msg = result.errors.map(e => e.message).join('\\n');
      canvas.showToast(`Errors: ${result.errors.length}`, 'error');
      console.log('Validation errors:', result.errors);
    }
  });

  // Clear all (uses themed ConfirmDialog instead of window.confirm)
  eventBus.on('clear-all', async () => {
    if (engine.components.size > 0) {
      const confirmed = await ConfirmDialog.show(
        'Clear all components and wires? This cannot be undone.',
        { title: 'Clear Canvas', confirmText: 'Clear All', confirmClass: 'confirm-dialog-btn-danger' }
      );
      if (!confirmed) return;
    }
    engine.stop();
    canvas.clearAll();
    engine.circuit.clear();
    engine.clocks.clear();
    engine.queue.clear();
    engine._nodeIndex.clear();
    engine._stepCount = 0;
    canvas.showToast('Canvas cleared', 'info');
  });

  // Subcircuit Manager — save/load reusable subcircuits
  const subcircuitManager = new SubcircuitManager(engine, canvas, factory, eventBus);

  eventBus.on('save-subcircuit', () => {
    const selectedIds = canvas.selection.selectedComponents;
    if (selectedIds.size === 0) {
      canvas.showToast('Select components to save as subcircuit', 'warning');
      return;
    }
    subcircuitManager.showSaveDialog(selectedIds);
  });

  eventBus.on('load-subcircuit', () => {
    subcircuitManager.showLoadDialog();
  });

  footer.setVersion('v0.9.2');

  // Update footer stats (event-driven instead of polling)
  const updateFooterStats = () => {
    footer.updateStats(engine.getStats(), canvas.core.scale);
  };
  eventBus.on('component-drop', updateFooterStats);
  eventBus.on('component-deleted', updateFooterStats);
  eventBus.on('wire-connected', updateFooterStats);
  eventBus.on('wire-removed', updateFooterStats);
  eventBus.on('simulation-status', updateFooterStats);
  // Initial update
  updateFooterStats();

  // Also update on zoom/pan changes
  canvas.core._onTransformChange = () => {
    canvas.positionCache.setTransform(canvas.core.panOffset, canvas.core.scale);
    updateFooterStats();
  };

  // FIX (Bug #8 Medium): Stop engine and clear clock intervals
  // on page unload to prevent issues with auto-save and pending timers.
  window.addEventListener('beforeunload', () => {
    engine.stop();
  });

  // Auto‑restore saved project (uses themed ConfirmDialog)
  const saved = localStorage.getItem('dflow-project');
  if (saved) {
    const restore = await ConfirmDialog.show(
      'A saved project was found. Do you want to restore it?',
      { title: 'Restore Project', confirmText: 'Restore', cancelText: 'Dismiss' }
    );
    if (restore) {
      try {
        const data = JSON.parse(saved);
        Serializer.importState(data, engine, canvas, factory);
        canvas.showToast('Project restored from auto-save', 'info');
      } catch (err) {
        console.error('Failed to restore project.', err);
        canvas.showToast('Failed to restore project', 'error');
      }
    }
  }
});
