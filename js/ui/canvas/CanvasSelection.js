import { DeleteComponentCommand, DisconnectWireCommand } from '../../utils/UndoManager.js';

export class CanvasSelection {
  constructor(engine, undoManager, compManager, wiring, toaster, core, containerElement, eventBus, canvas) {
    this.engine = engine;
    this.undoManager = undoManager;
    this.compManager = compManager;
    this.wiring = wiring;
    this.toaster = toaster;
    this.core = core;
    this.element = containerElement;
    this.eventBus = eventBus;
    this.canvas = canvas;          // <-- store real Canvas instance
    this.selectedComponents = new Set();
    this.selectedWires = new Set();
    this.selectionRect = null;
    this.selectionStart = null;
    this._clipboard = null;
  }

  clearSelection() {
    this.selectedComponents.forEach(id => {
      const comp = this.compManager.getComponentById(id);
      if (comp?.element) comp.element.classList.remove('selected');
    });
    this.selectedComponents.clear();
    this._clearWireSelection();
  }

  _clearWireSelection() {
    this.selectedWires.forEach(wireId => {
      const wire = this.wiring.wires.find(w => w.id === wireId);
      if (wire?.element) {
        wire.element.classList.remove('wire-selected');
        const visual = wire.element.querySelector('.wire-visual');
        if (visual) visual.setAttribute('stroke-width', '2');
      }
    });
    this.selectedWires.clear();
  }

  startSelection(e) {
    const coords = this.core.canvasCoords(e.clientX, e.clientY);
    this.selectionStart = coords;
    this.selectionRect = document.createElement('div');
    this.selectionRect.className = 'selection-rect';
    Object.assign(this.selectionRect.style, {
      position: 'absolute',
      border: '1px dashed var(--color-accent)',
      background: 'rgba(0,122,204,0.1)',
      pointerEvents: 'none'
    });
    this.element.appendChild(this.selectionRect);
  }

  updateSelection(e) {
    if (!this.selectionRect) return;
    const curr = this.core.canvasCoords(e.clientX, e.clientY);
    // Convert scene coordinates back to viewport-relative pixels
    // for positioning the selection rectangle overlay.
    const sceneRect = this.core.scene.getBoundingClientRect();
    const s = this.core.scale;
    const x = Math.min(this.selectionStart.x, curr.x) * s + sceneRect.left;
    const y = Math.min(this.selectionStart.y, curr.y) * s + sceneRect.top;
    const w = Math.abs(curr.x - this.selectionStart.x) * s;
    const h = Math.abs(curr.y - this.selectionStart.y) * s;
    // Position relative to the canvas container
    const canvasRect = this.element.getBoundingClientRect();
    Object.assign(this.selectionRect.style, {
      left: (x - canvasRect.left) + 'px',
      top: (y - canvasRect.top) + 'px',
      width: w + 'px',
      height: h + 'px'
    });
  }

  endSelection(e) {
    if (!this.selectionRect) return;
    const rect = this.selectionRect.getBoundingClientRect();
    // Use scene-based coordinate conversion for consistency
    const sceneRect = this.core.scene.getBoundingClientRect();
    const s = this.core.scale;
    const minX = (rect.left - sceneRect.left) / s;
    const minY = (rect.top - sceneRect.top) / s;
    const maxX = minX + rect.width / s;
    const maxY = minY + rect.height / s;
    if (!(e && e.shiftKey)) this.clearSelection();
    this.compManager.components.forEach(comp => {
      if (!comp.element) return;
      const cx = comp.position.x + 40, cy = comp.position.y + 40;
      if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
        this.selectedComponents.add(comp.id);
        comp.element.classList.add('selected');
      }
    });
    this.selectionRect.remove();
    this.selectionRect = null;
    this.selectionStart = null;
  }

  deleteSelectedComponents() {
    const compIds = Array.from(this.selectedComponents);
    compIds.forEach(id => {
      const comp = this.compManager.getComponentById(id);
      if (comp) {
        const cmd = new DeleteComponentCommand(this.engine, this.canvas, comp);
        this.undoManager.execute(cmd);
      }
    });
    this.selectedComponents.clear();

    const wireIds = Array.from(this.selectedWires);
    wireIds.forEach(wireId => {
      const wire = this.wiring.wires.find(w => w.id === wireId);
      if (wire) {
        const cmd = new DisconnectWireCommand(this.engine, this.canvas, wire.engineId);
        this.undoManager.execute(cmd);
      }
    });
    this.selectedWires.clear();
  }

  copySelected() {
    const ids = Array.from(this.selectedComponents);
    if (ids.length === 0) return;
    this._clipboard = ids.map(id => {
      const comp = this.compManager.getComponentById(id);
      return comp ? { type: comp.type, dx: comp.position.x, dy: comp.position.y } : null;
    }).filter(Boolean);
    if (this._clipboard.length) {
      const minX = Math.min(...this._clipboard.map(c => c.dx));
      const minY = Math.min(...this._clipboard.map(c => c.dy));
      this._clipboard.forEach(c => { c.dx -= minX; c.dy -= minY; });
      this.toaster.show(`Copied ${this._clipboard.length} component(s)`, 'success');
    }
  }

  pasteCopied() {
    if (!this._clipboard?.length) { this.toaster.show('Nothing to paste', 'warning'); return; }
    const offsetX = 80, offsetY = 40;
    this._clipboard.forEach(c => {
      this.eventBus.emit('component-drop', { type: c.type, x: c.dx + offsetX, y: c.dy + offsetY });
    });
    this.toaster.show(`Pasted ${this._clipboard.length} component(s)`, 'success');
  }
}