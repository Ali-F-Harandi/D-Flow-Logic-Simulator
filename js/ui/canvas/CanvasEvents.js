import { Wire } from '../../core/Wire.js';
import {
  ConnectWireCommand,
  DisconnectWireCommand,
  DeleteComponentCommand
} from '../../utils/UndoManager.js';

export class CanvasEvents {
  constructor(
    compManager, dragHandler, wiring, selection, panZoom, core,
    contextMenu, propertyEditor, undoManager, eventBus, positionCache,
    canvas          // <-- NEW PARAMETER
  ) {
    this.compManager = compManager;
    this.dragHandler = dragHandler;
    this.wiring = wiring;
    this.selection = selection;
    this.panZoom = panZoom;
    this.core = core;
    this.contextMenu = contextMenu;
    this.propertyEditor = propertyEditor;
    this.undoManager = undoManager;
    this.eventBus = eventBus;
    this.positionCache = positionCache;
    this.canvas = canvas;    // <-- store real Canvas instance
    this._toaster = null;

    this.element = document.getElementById('canvas-container');
    if (!this.element) this.element = core.element;

    console.log('[CanvasEvents] ready, element: ' + this.element.id);

    this._focusedComponentIndex = -1;

    this._bindMouse();
    this._bindKeyboard();
    this._bindContextMenu();
    this._bindDrop();
  }

  get engine() { return this.wiring.engine; }
  get toaster() { return this._toaster; }

  /* ---------- Mouse ---------- */
  _bindMouse() {
    this.element.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
        e.preventDefault();
        this.panZoom.startPan(e.clientX, e.clientY);
        return;
      }
      if (this.wiring.wiring) return;

      const target = e.target;
      const compEl = target.closest('.component');

      if (compEl && !target.classList.contains('connector')) {
        const comp = this.compManager.getComponentById(compEl.dataset.compId);
        if (!comp) return;
        if (e.shiftKey) {
          if (this.selection.selectedComponents.has(comp.id)) {
            this.selection.selectedComponents.delete(comp.id);
            compEl.classList.remove('selected');
          } else {
            this.selection.selectedComponents.add(comp.id);
            compEl.classList.add('selected');
          }
          return;
        }
        e.preventDefault();
        if (!this.selection.selectedComponents.has(comp.id)) {
          this.selection.clearSelection();
          this.selection.selectedComponents.add(comp.id);
          compEl.classList.add('selected');
        }
        this.dragHandler.startDrag(comp, e.clientX, e.clientY);
        return;
      }

      if (target.closest('g[data-wire-id]')) {
        const wireEl = target.closest('g[data-wire-id]');
        const wireId = wireEl.dataset.wireId;
        this.selection._clearWireSelection();
        this.selection.clearSelection();
        const wire = this.wiring.wires.find(w => w.id === wireId);
        if (wire) {
          this.selection.selectedWires.add(wireId);
          wireEl.classList.add('wire-selected');
          const visual = wireEl.querySelector('.wire-visual');
          if (visual) visual.setAttribute('stroke-width', '4');
        }
        return;
      }

      if (target.classList.contains('connector')) {
        e.stopPropagation();
        const nodeId = target.dataset.node;
        const isOutput = target.classList.contains('output');
        const comp = this.engine._findComponentByNode(nodeId);
        if (comp) {
          this.wiring.startWiring(comp, nodeId, isOutput);
        }
        return;
      }

      if (!target.closest('.connector')) {
        this.selection.startSelection(e);
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.panZoom.isPanning) { this.panZoom.movePan(e.clientX, e.clientY); return; }
      if (this.dragHandler.isDragging) { this.dragHandler.moveDrag(e.clientX, e.clientY); }
      if (this.wiring.wiring && this.wiring.wiring.tempPath) {
        const fromPos = this.positionCache.getPosition(this.wiring.wiring.fromNodeId);
        const toPos = this.core.canvasCoords(e.clientX, e.clientY);
        const busY = this.core.getBusBarY(this.compManager.components);
        this.wiring.wiring.tempPath.setAttribute('d', Wire.computePath(fromPos, toPos, { minClearY: busY }));
      }
      if (this.selection.selectionRect) { this.selection.updateSelection(e); }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.panZoom.isPanning) { this.panZoom.endPan(); return; }
      if (this.dragHandler.isDragging) { this.dragHandler.endDrag(); return; }

      if (this.wiring.wiring && this.wiring.wiring.tempPath) {
        const targetConn = e.target.closest('.connector');
        if (targetConn && targetConn.dataset.node) {
          const isTargetOutput = targetConn.classList.contains('output');
          const isSourceOutput = this.wiring.wiring.fromIsOutput;
          let success = false, errorMsg = '';
          if (isSourceOutput && !isTargetOutput) {
            const fromComp = this.engine._findComponentByNode(this.wiring.wiring.fromNodeId);
            const toComp = this.engine._findComponentByNode(targetConn.dataset.node);
            if (fromComp && toComp && fromComp.id === toComp.id) errorMsg = 'Cannot connect a component to itself!';
            else success = this.wiring.completeConnection(this.wiring.wiring.fromNodeId, targetConn.dataset.node);
          } else if (!isSourceOutput && isTargetOutput) {
            const fromComp = this.engine._findComponentByNode(targetConn.dataset.node);
            const toComp = this.engine._findComponentByNode(this.wiring.wiring.fromNodeId);
            if (fromComp && toComp && fromComp.id === toComp.id) errorMsg = 'Cannot connect a component to itself!';
            else success = this.wiring.completeConnection(targetConn.dataset.node, this.wiring.wiring.fromNodeId);
          } else if (isSourceOutput && isTargetOutput) errorMsg = 'Cannot connect output to output';
          else errorMsg = 'Cannot connect input to input';
          if (!success && !errorMsg) errorMsg = 'Connection failed';
          if (errorMsg) this.toaster ? this.toaster.show(errorMsg, 'error') : console.warn(errorMsg);
        }
        this.wiring.cancelWiring();
        return;
      }

      if (this.selection.selectionRect) { this.selection.endSelection(e); }
    });
  }

  /* ---------- Keyboard ---------- */
  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (this.wiring.wiring) return;
      const step = this.core.gridSize;
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this.undoManager.undo(); }
      else if (e.ctrlKey && e.key === 'y') { e.preventDefault(); this.undoManager.redo(); }
      else if (e.ctrlKey && e.key === 'c') { e.preventDefault(); this.selection.copySelected(); }
      else if (e.ctrlKey && e.key === 'v') { e.preventDefault(); this.selection.pasteCopied(); }
      else if (e.key === 'Escape') { this.selection.clearSelection(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selection.selectedComponents.size > 0 || this.selection.selectedWires.size > 0) {
          e.preventDefault();
          this.selection.deleteSelectedComponents();
        }
      }
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        this.dragHandler.moveSelectedComponents(dx, dy);
      }
      else if (e.key === 'Tab') {
        e.preventDefault();
        this._cycleFocus(e.shiftKey ? -1 : 1);
      }
    });
  }

  _cycleFocus(direction) {
    const comps = this.compManager.components;
    if (comps.length === 0) return;
    if (this._focusedComponentIndex >= 0 && comps[this._focusedComponentIndex]) {
      comps[this._focusedComponentIndex].element?.classList.remove('component-focused');
    }
    this._focusedComponentIndex = (this._focusedComponentIndex + direction + comps.length) % comps.length;
    const comp = comps[this._focusedComponentIndex];
    if (comp?.element) {
      comp.element.classList.add('component-focused');
      this.selection.clearSelection();
      this.selection.selectedComponents.add(comp.id);
      comp.element.classList.add('selected');
      comp.element.focus();
    }
  }

  /* ---------- Context Menu ---------- */
  _bindContextMenu() {
    this.element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const items = [];

      const compEl = e.target.closest('.component');
      if (compEl && !e.target.classList.contains('connector')) {
        const comp = this.compManager.getComponentById(compEl.dataset.compId);
        if (comp) {
          items.push({ label: 'Properties', action: () => this.propertyEditor.open(comp) });
          items.push({ label: 'Delete', action: () => {
            const cmd = new DeleteComponentCommand(this.engine, this.canvas, comp);
            this.undoManager.execute(cmd);
          }});
          this.contextMenu.show(e.clientX, e.clientY, items);
          return;
        }
      }

      const wireEl = e.target.closest('g[data-wire-id]');
      if (wireEl) {
        const wireId = wireEl.dataset.wireId;
        const wire = this.wiring.wires.find(w => w.id === wireId);
        if (wire) {
          items.push({ label: 'Delete Wire', action: () => {
            const cmd = new DisconnectWireCommand(this.engine, this.canvas, wire.engineId);
            this.undoManager.execute(cmd);
          }});
          this.contextMenu.show(e.clientX, e.clientY, items);
          return;
        }
      }

      const conn = e.target.closest('.connector');
      if (conn && conn.dataset.node) {
        if (conn.classList.contains('output')) {
          items.push({ label: 'Generate Truth Table', action: () => {
            this.eventBus.emit('show-panel', 'truth');
            this.eventBus.emit('generate-truth-table', conn.dataset.node);
          }});
        }
        items.push({ label: 'Set as TestBench Output', action: () => {
          this.eventBus.emit('set-testbench-output', conn.dataset.node);
        }});
        this.contextMenu.show(e.clientX, e.clientY, items);
      }
    });
  }

  /* ---------- Drop ---------- */
  _bindDrop() {
    this.element.addEventListener('dragover', (e) => e.preventDefault());
    this.element.addEventListener('drop', (e) => {
      e.preventDefault();
      if (this.dragHandler.isDragging) return;
      const type = e.dataTransfer.getData('text/plain');
      if (!type) return;
      const pos = this.core.canvasCoords(e.clientX, e.clientY);
      // Use half of standard gate dimensions (4*GRID × 3*GRID) to center the
      // component on the drop point.  Most components are 80×60 or smaller.
      const halfW = 2 * 20;   // 40px – half of 4*GRID
      const halfH = 1.5 * 20; // 30px – half of 3*GRID (typical 2-input gate height)
      const x = this.core.snap(pos.x - halfW);
      const y = this.core.snap(pos.y - halfH);
      this.eventBus.emit('component-drop', { type, x, y });
    });
  }
}