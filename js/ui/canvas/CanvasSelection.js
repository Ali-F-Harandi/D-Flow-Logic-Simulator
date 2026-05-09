import { DeleteComponentCommand, DisconnectWireCommand, ConnectWireCommand } from '../../utils/UndoManager.js';
import { ComponentLayoutPolicy } from '../../core/ComponentLayoutPolicy.js';

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
    // Emit selection change event
    this.eventBus.emit('selection-changed', {
      components: Array.from(this.selectedComponents),
      wires: Array.from(this.selectedWires)
    });
  }

  _clearWireSelection() {
    this.selectedWires.forEach(wireId => {
      const wire = this.wiring.wires.find(w => w.id === wireId);
      if (wire?.element) {
        wire.element.classList.remove('wire-selected');
        const visual = wire.element.querySelector('.wire-visual');
        if (visual) visual.setAttribute('stroke-width', '2');
      }
      // Hide control handles when deselecting wire
      if (wire) wire.hideControlHandles();
    });
    this.selectedWires.clear();
    // Clear wire edit handler active wire
    if (this.wiring._wireEditHandler) {
      this.wiring._wireEditHandler.clearActive();
    }
  }

  startSelection(e) {
    const coords = this.core.canvasCoords(e.clientX, e.clientY);
    this.selectionStart = coords;

    // Create SVG selection rectangle instead of DOM div
    this.selectionRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    this.selectionRect.setAttribute('x', coords.x);
    this.selectionRect.setAttribute('y', coords.y);
    this.selectionRect.setAttribute('width', '0');
    this.selectionRect.setAttribute('height', '0');
    this.selectionRect.setAttribute('fill', 'rgba(0,122,204,0.1)');
    this.selectionRect.setAttribute('stroke', 'var(--color-accent)');
    this.selectionRect.setAttribute('stroke-width', '1');
    this.selectionRect.setAttribute('stroke-dasharray', '4,4');
    this.selectionRect.setAttribute('pointer-events', 'none');
    this.selectionRect.classList.add('selection-rect-svg');

    // Append to the SVG wire layer
    this.core.svgLayer.appendChild(this.selectionRect);
  }

  updateSelection(e) {
    if (!this.selectionRect) return;
    const curr = this.core.canvasCoords(e.clientX, e.clientY);
    const x = Math.min(this.selectionStart.x, curr.x);
    const y = Math.min(this.selectionStart.y, curr.y);
    const w = Math.abs(curr.x - this.selectionStart.x);
    const h = Math.abs(curr.y - this.selectionStart.y);

    this.selectionRect.setAttribute('x', x);
    this.selectionRect.setAttribute('y', y);
    this.selectionRect.setAttribute('width', w);
    this.selectionRect.setAttribute('height', h);
  }

  endSelection(e) {
    if (!this.selectionRect) return;

    // Get selection bounds in canvas coordinates
    const x = parseFloat(this.selectionRect.getAttribute('x'));
    const y = parseFloat(this.selectionRect.getAttribute('y'));
    const w = parseFloat(this.selectionRect.getAttribute('width'));
    const h = parseFloat(this.selectionRect.getAttribute('height'));
    const minX = x;
    const minY = y;
    const maxX = x + w;
    const maxY = y + h;

    if (!(e && e.shiftKey)) this.clearSelection();

    // Use bounding-box hit testing instead of hardcoded center offsets
    this.compManager.components.forEach(comp => {
      if (!comp.element) return;
      const compX = comp.position.x;
      const compY = comp.position.y;
      const compW = comp.element.offsetWidth || comp._cachedWidth ||
                    ComponentLayoutPolicy.computeDimensions(comp.inputs.length, comp.outputs.length, comp.type).width;
      const compH = comp.element.offsetHeight || comp._cachedHeight ||
                    ComponentLayoutPolicy.computeDimensions(comp.inputs.length, comp.outputs.length, comp.type).height;

      // Bounding box intersection test
      if (compX < maxX && compX + compW > minX &&
          compY < maxY && compY + compH > minY) {
        this.selectedComponents.add(comp.id);
        comp.element.classList.add('selected');
      }
    });

    // Remove SVG selection rect
    this.selectionRect.remove();
    this.selectionRect = null;
    this.selectionStart = null;

    // Emit selection change event
    this.eventBus.emit('selection-changed', {
      components: Array.from(this.selectedComponents),
      wires: Array.from(this.selectedWires)
    });
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

  /**
   * FIX (Bug #4 High): Copy now preserves wire connections between
   * selected components so that paste re-creates the wiring.
   */
  copySelected() {
    const ids = Array.from(this.selectedComponents);
    if (ids.length === 0) return;
    const idSet = new Set(ids);

    // Save component info with input/output node index maps
    const compEntries = ids.map(id => {
      const comp = this.compManager.getComponentById(id);
      if (!comp) return null;
      return {
        type: comp.type,
        dx: comp.position.x,
        dy: comp.position.y,
        originalId: comp.id,
        inputNodeIds: comp.inputs.map(inp => inp.id),
        outputNodeIds: comp.outputs.map(out => out.id)
      };
    }).filter(Boolean);

    if (compEntries.length) {
      const minX = Math.min(...compEntries.map(c => c.dx));
      const minY = Math.min(...compEntries.map(c => c.dy));
      compEntries.forEach(c => { c.dx -= minX; c.dy -= minY; });
    }

    // Save wires that connect two selected components (internal wires)
    const internalWires = [];
    for (const wire of this.engine.wires) {
      if (idSet.has(wire.from.componentId) && idSet.has(wire.to.componentId)) {
        // Store as relative indices so we can map to new components on paste
        const fromCompEntry = compEntries.find(c => c.originalId === wire.from.componentId);
        const toCompEntry = compEntries.find(c => c.originalId === wire.to.componentId);
        if (fromCompEntry && toCompEntry) {
          const fromOutputIdx = fromCompEntry.outputNodeIds.indexOf(wire.from.nodeId);
          const toInputIdx = toCompEntry.inputNodeIds.indexOf(wire.to.nodeId);
          if (fromOutputIdx !== -1 && toInputIdx !== -1) {
            internalWires.push({
              fromCompOriginalId: wire.from.componentId,
              fromOutputIdx,
              toCompOriginalId: wire.to.componentId,
              toInputIdx
            });
          }
        }
      }
    }

    this._clipboard = { components: compEntries, wires: internalWires };
    this.toaster.show(`Copied ${compEntries.length} component(s)${internalWires.length ? ` with ${internalWires.length} wire(s)` : ''}`, 'success');
  }

  /**
   * FIX (Bug #4 High): Paste now re-creates wire connections between
   * pasted components by mapping the saved relative indices to the new IDs.
   */
  pasteCopied() {
    if (!this._clipboard?.components?.length) {
      this.toaster.show('Nothing to paste', 'warning');
      return;
    }
    const offsetX = 80, offsetY = 40;
    const idMapping = {}; // originalId -> new component

    // Create all new components first
    this._clipboard.components.forEach(c => {
      this.eventBus.emit('component-drop', {
        type: c.type,
        x: c.dx + offsetX,
        y: c.dy + offsetY
      });
      // The last component added should be the one we just created
      // Find it by matching type and position
      const newComps = this.compManager.components.filter(
        comp => comp.type === c.type &&
          comp.position.x === c.dx + offsetX &&
          comp.position.y === c.dy + offsetY &&
          !idMapping[c.originalId]
      );
      if (newComps.length > 0) {
        idMapping[c.originalId] = newComps[newComps.length - 1];
      }
    });

    // Re-create internal wires between pasted components
    if (this._clipboard.wires && this._clipboard.wires.length > 0) {
      for (const wireInfo of this._clipboard.wires) {
        const fromComp = idMapping[wireInfo.fromCompOriginalId];
        const toComp = idMapping[wireInfo.toCompOriginalId];
        if (fromComp && toComp &&
          fromComp.outputs[wireInfo.fromOutputIdx] &&
          toComp.inputs[wireInfo.toInputIdx]) {
          const fromNodeId = fromComp.outputs[wireInfo.fromOutputIdx].id;
          const toNodeId = toComp.inputs[wireInfo.toInputIdx].id;
          // Only connect if the input is not already connected
          if (!toComp.inputs[wireInfo.toInputIdx].connectedTo) {
            const cmd = new ConnectWireCommand(this.engine, this.canvas, fromNodeId, toNodeId);
            this.undoManager.execute(cmd);
          }
        }
      }
    }

    this.toaster.show(`Pasted ${this._clipboard.components.length} component(s)`, 'success');
  }
}
