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
    this.canvas = canvas;
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

  selectAll(components) {
    this.clearSelection();
    components.forEach(comp => {
      if (comp.element) {
        this.selectedComponents.add(comp.id);
        comp.element.classList.add('selected');
      }
    });
  }

  startSelection(e) {
    const coords = this.core.canvasCoords(e.clientX || e.pageX, e.clientY || e.pageY);
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
    const curr = this.core.canvasCoords(e.clientX || e.pageX, e.clientY || e.pageY);
    const x = Math.min(this.selectionStart.x, curr.x) * this.core.scale + this.core.panOffset.x;
    const y = Math.min(this.selectionStart.y, curr.y) * this.core.scale + this.core.panOffset.y;
    const w = Math.abs(curr.x - this.selectionStart.x) * this.core.scale;
    const h = Math.abs(curr.y - this.selectionStart.y) * this.core.scale;
    Object.assign(this.selectionRect.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  }

  endSelection(e) {
    if (!this.selectionRect) return;
    const rect = this.selectionRect.getBoundingClientRect();
    const canvasRect = this.element.getBoundingClientRect();
    const minX = (rect.left - canvasRect.left - this.core.panOffset.x) / this.core.scale;
    const minY = (rect.top - canvasRect.top - this.core.panOffset.y) / this.core.scale;
    const maxX = minX + rect.width / this.core.scale;
    const maxY = minY + rect.height / this.core.scale;
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

    // HP-4 FIX: Also save wire connections between copied components
    // so that paste recreates them. Previously, copySelected() only
    // saved component types and positions — pasted components had no
    // wires between them, making copy/paste of sub-circuits useless.

    // Collect components and their relative positions
    const compData = ids.map(id => {
      const comp = this.compManager.getComponentById(id);
      return comp ? { type: comp.type, dx: comp.position.x, dy: comp.position.y, id: comp.id } : null;
    }).filter(Boolean);

    const minX = Math.min(...compData.map(c => c.dx));
    const minY = Math.min(...compData.map(c => c.dy));
    compData.forEach(c => { c.dx -= minX; c.dy -= minY; });

    // Find wires that connect pairs of selected components
    const idSet = new Set(ids);
    const wireData = this.wiring.wires
      .filter(w => idSet.has(w.fromNode.nodeId.split('.')[0]) && idSet.has(w.toNode.nodeId.split('.')[0]))
      .map(w => ({
        fromNodeId: w.fromNode.nodeId,
        toNodeId: w.toNode.nodeId,
        fromCompId: w.fromNode.nodeId.split('.')[0],
        toCompId: w.toNode.nodeId.split('.')[0]
      }));

    this._clipboard = { components: compData, wires: wireData };
    if (this._clipboard.components.length) {
      this.toaster.show(`Copied ${this._clipboard.components.length} component(s)`, 'success');
    }
  }

  pasteCopied() {
    if (!this._clipboard?.components?.length) { this.toaster.show('Nothing to paste', 'warning'); return; }
    const offsetX = 80, offsetY = 40;

    // HP-4 FIX: Map old component IDs to new IDs so we can reconnect wires
    const idMap = new Map(); // old comp id -> new comp id

    this._clipboard.components.forEach(c => {
      // Emit component-drop which creates a new component via factory
      // We need the newly created component's ID, so we listen for it
      const newCompId = this.eventBus.emit('component-drop', { type: c.type, x: c.dx + offsetX, y: c.dy + offsetY });
      // Since component-drop is async (handled by main.js listener), we can't
      // get the new ID here directly. Instead, we'll store the mapping after
      // components are created, then connect wires in a deferred manner.
    });

    // Deferred wire connection: after components are created (next frame),
    // find the newly added components and connect their wires.
    if (this._clipboard.wires?.length) {
      // Use requestAnimationFrame to ensure components are created first
      requestAnimationFrame(() => {
        // Get the most recently created components that match the count
        const allComps = this.compManager.components;
        const pasteCount = this._clipboard.components.length;
        const newComps = allComps.slice(-pasteCount);

        // Build old ID → new ID mapping based on order
        this._clipboard.components.forEach((c, i) => {
          if (newComps[i]) {
            idMap.set(c.id, newComps[i].id);
          }
        });

        // Connect wires between pasted components
        this._clipboard.wires.forEach(w => {
          const newFromCompId = idMap.get(w.fromCompId);
          const newToCompId = idMap.get(w.toCompId);
          if (newFromCompId && newToCompId) {
            // Reconstruct node IDs by replacing old comp ID with new comp ID
            const newFromNodeId = w.fromNodeId.replace(w.fromCompId, newFromCompId);
            const newToNodeId = w.toNodeId.replace(w.toCompId, newToCompId);

            // Find the actual nodes in the new components
            const fromComp = this.engine.components.get(newFromCompId);
            const toComp = this.engine.components.get(newToCompId);
            if (fromComp && toComp) {
              const fromNode = fromComp.outputs.find(o => newFromNodeId.endsWith(o.id.split('.').slice(1).join('.')));
              const toNode = toComp.inputs.find(i => newToNodeId.endsWith(i.id.split('.').slice(1).join('.')));
              if (fromNode && toNode) {
                this.wiring.completeConnection(fromNode.id, toNode.id);
              }
            }
          }
        });
      });
    }

    this.toaster.show(`Pasted ${this._clipboard.components.length} component(s)`, 'success');
  }
}
