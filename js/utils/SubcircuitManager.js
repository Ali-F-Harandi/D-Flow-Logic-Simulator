/**
 * SubcircuitManager — Save, load, and manage reusable subcircuits.
 *
 * A subcircuit is a saved selection of components and wires that can be
 * re-instantiated into any circuit. Subcircuits are stored in localStorage
 * under the key 'dflow-subcircuits' as a JSON object mapping names to
 * circuit data.
 *
 * Features:
 *   - Save selected components as a named subcircuit
 *   - List all saved subcircuits
 *   - Load (instantiate) a subcircuit at a given position
 *   - Delete saved subcircuits
 *   - Export/import subcircuits as JSON files
 *   - Automatic ID remapping on instantiation (avoids collisions)
 *
 * Usage:
 *   const mgr = new SubcircuitManager(engine, canvas, factory, eventBus);
 *   mgr.saveFromSelection('My Circuit');
 *   mgr.loadSubcircuit('My Circuit', { x: 200, y: 200 });
 */

import { generateId } from './IdGenerator.js';
import { ConfirmDialog } from './ConfirmDialog.js';

export class SubcircuitManager {
  constructor(engine, canvas, factory, eventBus) {
    this.engine = engine;
    this.canvas = canvas;
    this.factory = factory;
    this.eventBus = eventBus;
    this._storageKey = 'dflow-subcircuits';
  }

  /**
   * Get all saved subcircuits from localStorage.
   * @returns {Object} Map of subcircuit name → circuit data
   */
  getAll() {
    try {
      const raw = localStorage.getItem(this._storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error('Failed to read subcircuits:', e);
      return {};
    }
  }

  /**
   * Save a subcircuit under a given name.
   * @param {string} name - Subcircuit name
   * @param {Object} data - Circuit data (components and wires)
   */
  _save(name, data) {
    const all = this.getAll();
    all[name] = { ...data, savedAt: Date.now() };
    localStorage.setItem(this._storageKey, JSON.stringify(all));
    this.eventBus.emit('subcircuit-saved', name);
  }

  /**
   * Save the currently selected components as a subcircuit.
   * @param {string} name - Name for the subcircuit
   * @param {Set<string>} selectedComponentIds - IDs of selected components
   * @returns {boolean} True if saved successfully
   */
  saveFromSelection(name, selectedComponentIds) {
    if (!name || name.trim().length === 0) return false;
    if (!selectedComponentIds || selectedComponentIds.size === 0) return false;

    // Collect selected components
    const components = [];
    for (const compId of selectedComponentIds) {
      const comp = this.engine.components.get(compId);
      if (comp) {
        components.push({
          id: comp.id,
          type: comp.type,
          position: { x: comp.position.x, y: comp.position.y },
          properties: comp.getProperties().reduce((acc, p) => { acc[p.name] = p.value; return acc; }, {}),
          inputs: comp.inputs.map(inp => ({
            nodeId: inp.id,
            connectedTo: inp.connectedTo ? { componentId: inp.connectedTo.componentId, nodeId: inp.connectedTo.nodeId } : null
          })),
          outputs: comp.outputs.map(o => ({ nodeId: o.id, value: o.value })),
          internalState: this._extractInternalState(comp)
        });
      }
    }

    // Collect internal wires (both endpoints in selection)
    const compIdSet = new Set(selectedComponentIds);
    const wires = [];
    for (const wire of this.engine.wires) {
      if (compIdSet.has(wire.from.componentId) && compIdSet.has(wire.to.componentId)) {
        wires.push({
          id: wire.id,
          from: { ...wire.from },
          to: { ...wire.to }
        });
      }
    }

    // Identify boundary ports (input/output ports of the subcircuit)
    // Input ports: component inputs that are connected FROM outside the selection
    const inputPorts = [];
    const outputPorts = [];
    for (const comp of components) {
      for (const inp of comp.inputs) {
        if (inp.connectedTo && !compIdSet.has(inp.connectedTo.componentId)) {
          inputPorts.push({ nodeId: inp.nodeId, componentName: comp.id, label: comp.type });
        }
      }
      for (const out of comp.outputs) {
        const hasExternalWire = this.engine.wires.some(w =>
          w.from.nodeId === out.nodeId && !compIdSet.has(w.to.componentId)
        );
        if (hasExternalWire) {
          outputPorts.push({ nodeId: out.nodeId, componentName: comp.id, label: comp.type });
        }
      }
    }

    // Normalize positions relative to top-left component
    let minX = Infinity, minY = Infinity;
    for (const comp of components) {
      minX = Math.min(minX, comp.position.x);
      minY = Math.min(minY, comp.position.y);
    }
    for (const comp of components) {
      comp.position.x -= minX;
      comp.position.y -= minY;
    }

    this._save(name, {
      components,
      wires,
      inputPorts,
      outputPorts,
      componentCount: components.length,
      wireCount: wires.length
    });

    return true;
  }

  /**
   * Load (instantiate) a subcircuit at the given position.
   * All component and wire IDs are remapped to avoid collisions.
   * @param {string} name - Subcircuit name
   * @param {{x:number, y:number}} position - Top-left position on canvas
   * @returns {boolean} True if loaded successfully
   */
  loadSubcircuit(name, position) {
    const all = this.getAll();
    const data = all[name];
    if (!data) return false;

    // Build ID remapping
    const idMap = new Map(); // old component ID → new component ID
    const nodeIdMap = new Map(); // old node ID → new node ID

    // Create new components with remapped IDs
    for (const compData of data.components) {
      const newCompId = generateId(compData.type);
      idMap.set(compData.id, newCompId);

      const comp = this.factory.createComponent(compData.type, newCompId, compData);
      comp.position.x = (compData.position.x || 0) + position.x;
      comp.position.y = (compData.position.y || 0) + position.y;

      // Restore properties
      if (compData.properties) {
        const props = comp.getProperties();
        props.forEach(prop => {
          if (compData.properties.hasOwnProperty(prop.name)) {
            comp.setProperty(prop.name, compData.properties[prop.name]);
          }
        });
      }

      // Restore internal state
      if (compData.internalState) {
        if (compData.internalState._state !== undefined) {
          comp._state = Array.isArray(compData.internalState._state)
            ? [...compData.internalState._state]
            : { ...compData.internalState._state };
        }
        if (compData.internalState._prevClk !== undefined) comp._prevClk = compData.internalState._prevClk;
      }

      // Build node ID mappings
      for (let i = 0; i < comp.inputs.length; i++) {
        const oldNodeId = compData.inputs[i]?.nodeId;
        if (oldNodeId) {
          nodeIdMap.set(oldNodeId, comp.inputs[i].id);
        }
      }
      for (let i = 0; i < comp.outputs.length; i++) {
        const oldNodeId = compData.outputs[i]?.nodeId;
        if (oldNodeId) {
          nodeIdMap.set(oldNodeId, comp.outputs[i].id);
        }
      }

      // Add to engine
      this.engine.addComponent(comp);
      this.canvas.addComponent(comp);
    }

    // Create remapped wire connections
    for (const wireData of data.wires) {
      const fromNodeId = nodeIdMap.get(wireData.from.nodeId);
      const toNodeId = nodeIdMap.get(wireData.to.nodeId);
      if (fromNodeId && toNodeId) {
        const engineId = this.engine.connect(fromNodeId, toNodeId);
        if (engineId) {
          this.canvas._addVisualWire(engineId, fromNodeId, toNodeId);
        }
      }
    }

    // Propagate signals
    this.engine.step();

    this.eventBus.emit('subcircuit-loaded', name);
    return true;
  }

  /**
   * Delete a saved subcircuit by name.
   * @param {string} name
   */
  deleteSubcircuit(name) {
    const all = this.getAll();
    delete all[name];
    localStorage.setItem(this._storageKey, JSON.stringify(all));
    this.eventBus.emit('subcircuit-deleted', name);
  }

  /**
   * Rename a saved subcircuit.
   * @param {string} oldName
   * @param {string} newName
   */
  renameSubcircuit(oldName, newName) {
    const all = this.getAll();
    if (!all[oldName] || all[newName]) return false;
    all[newName] = all[oldName];
    delete all[oldName];
    localStorage.setItem(this._storageKey, JSON.stringify(all));
    return true;
  }

  /**
   * Export a subcircuit as a JSON file.
   * @param {string} name
   */
  exportSubcircuit(name) {
    const all = this.getAll();
    const data = all[name];
    if (!data) return;

    const json = JSON.stringify({ name, ...data }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subcircuit_${name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Import a subcircuit from a JSON file.
   * @param {File} file
   * @returns {Promise<boolean>}
   */
  async importSubcircuit(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          const name = data.name || `Imported_${Date.now()}`;
          delete data.name;
          delete data.savedAt;
          this._save(name, data);
          resolve(true);
        } catch (err) {
          console.error('Failed to import subcircuit:', err);
          resolve(false);
        }
      };
      reader.readAsText(file);
    });
  }

  /**
   * Show a dialog to save the current selection as a subcircuit.
   */
  async showSaveDialog(selectedComponentIds) {
    if (!selectedComponentIds || selectedComponentIds.size === 0) {
      this.canvas.showToast('Select components first', 'warning');
      return;
    }

    const name = await this._promptName('Save Subcircuit', 'Enter a name for this subcircuit:');
    if (!name) return;

    const success = this.saveFromSelection(name, selectedComponentIds);
    if (success) {
      this.canvas.showToast(`Subcircuit "${name}" saved!`, 'success');
    } else {
      this.canvas.showToast('Failed to save subcircuit', 'error');
    }
  }

  /**
   * Show a dialog to load a subcircuit.
   */
  async showLoadDialog() {
    const all = this.getAll();
    const names = Object.keys(all);
    if (names.length === 0) {
      this.canvas.showToast('No saved subcircuits', 'info');
      return;
    }
    // Show selection dialog
    await this._showSubcircuitPicker(names);
  }

  // ─── Private Helpers ───

  _extractInternalState(comp) {
    const state = {};
    if (comp._state !== undefined) {
      state._state = Array.isArray(comp._state) ? [...comp._state] : { ...comp._state };
    }
    if (comp._prevClk !== undefined) state._prevClk = comp._prevClk;
    if (comp.frequency !== undefined) state.frequency = comp.frequency;
    return Object.keys(state).length ? state : undefined;
  }

  async _promptName(title, message) {
    // Create a simple input dialog
    return new Promise((resolve) => {
      const existing = document.getElementById('subcircuit-prompt');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'subcircuit-prompt';
      overlay.className = 'confirm-dialog-overlay';

      const dialog = document.createElement('div');
      dialog.className = 'confirm-dialog';
      dialog.setAttribute('role', 'dialog');

      const titleEl = document.createElement('div');
      titleEl.className = 'confirm-dialog-title';
      titleEl.textContent = title;

      const msgEl = document.createElement('div');
      msgEl.className = 'confirm-dialog-message';
      msgEl.textContent = message;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'properties-input';
      input.style.width = '100%';
      input.style.marginBottom = '16px';
      input.placeholder = 'Subcircuit name...';
      input.setAttribute('aria-label', 'Subcircuit name');

      const btnRow = document.createElement('div');
      btnRow.className = 'confirm-dialog-btn-row';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'confirm-dialog-btn confirm-dialog-btn-cancel';
      cancelBtn.textContent = 'Cancel';

      const saveBtn = document.createElement('button');
      saveBtn.className = 'confirm-dialog-btn confirm-dialog-btn-primary';
      saveBtn.textContent = 'Save';

      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(saveBtn);

      dialog.appendChild(titleEl);
      dialog.appendChild(msgEl);
      dialog.appendChild(input);
      dialog.appendChild(btnRow);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      requestAnimationFrame(() => input.focus());

      const cleanup = () => overlay.remove();

      cancelBtn.addEventListener('click', () => { cleanup(); resolve(null); });
      saveBtn.addEventListener('click', () => {
        const value = input.value.trim();
        cleanup();
        resolve(value || null);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const value = input.value.trim();
          cleanup();
          resolve(value || null);
        } else if (e.key === 'Escape') {
          cleanup();
          resolve(null);
        }
      });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { cleanup(); resolve(null); }
      });
    });
  }

  async _showSubcircuitPicker(names) {
    // Remove existing picker
    const existing = document.getElementById('subcircuit-picker');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'subcircuit-picker';
    overlay.className = 'confirm-dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.style.minWidth = '360px';

    const titleEl = document.createElement('div');
    titleEl.className = 'confirm-dialog-title';
    titleEl.textContent = 'Load Subcircuit';

    const list = document.createElement('div');
    list.style.cssText = 'max-height: 300px; overflow-y: auto; margin-bottom: 16px;';

    for (const name of names) {
      const item = document.createElement('div');
      item.style.cssText = `
        padding: 10px; margin-bottom: 6px; background: var(--color-surface-alt);
        border: 1px solid var(--color-border); border-radius: var(--border-radius);
        cursor: pointer; display: flex; justify-content: space-between; align-items: center;
        transition: border-color 0.2s;
      `;
      item.addEventListener('mouseenter', () => { item.style.borderColor = 'var(--color-accent)'; });
      item.addEventListener('mouseleave', () => { item.style.borderColor = 'var(--color-border)'; });

      const label = document.createElement('span');
      label.textContent = name;
      label.style.fontWeight = '500';

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '6px';

      const loadBtn = document.createElement('button');
      loadBtn.className = 'confirm-dialog-btn confirm-dialog-btn-primary';
      loadBtn.style.padding = '3px 10px';
      loadBtn.style.fontSize = '11px';
      loadBtn.textContent = 'Load';

      const delBtn = document.createElement('button');
      delBtn.className = 'confirm-dialog-btn confirm-dialog-btn-danger';
      delBtn.style.padding = '3px 10px';
      delBtn.style.fontSize = '11px';
      delBtn.textContent = 'Delete';

      actions.appendChild(loadBtn);
      actions.appendChild(delBtn);
      item.appendChild(label);
      item.appendChild(actions);
      list.appendChild(item);

      loadBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const pos = { x: 200, y: 200 }; // Default position
        const success = this.loadSubcircuit(name, pos);
        if (success) {
          this.canvas.showToast(`Subcircuit "${name}" loaded!`, 'success');
        }
        overlay.remove();
      });

      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = await ConfirmDialog.show(
          `Delete subcircuit "${name}"? This cannot be undone.`,
          { title: 'Delete Subcircuit', confirmText: 'Delete', confirmClass: 'confirm-dialog-btn-danger' }
        );
        if (confirmed) {
          this.deleteSubcircuit(name);
          this.canvas.showToast(`Subcircuit "${name}" deleted`, 'info');
          item.remove();
        }
      });
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'confirm-dialog-btn confirm-dialog-btn-cancel';
    closeBtn.textContent = 'Close';

    dialog.appendChild(titleEl);
    dialog.appendChild(list);
    dialog.appendChild(closeBtn);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }
}
