export class CanvasDrag {
  constructor(core, compManager, wiring, selection) {
    this.core = core;
    this.compManager = compManager;
    this.wiring = wiring;
    this.selection = selection;
    this.isDragging = false;
    this.dragData = null;
  }

  /**
   * Start dragging a component (or multiple selected components) at the given screen coordinates.
   */
  startDrag(comp, clientX, clientY) {
    if (this.isDragging) return;
    // Ensure the component is in the selection if not already
    if (!this.selection.selectedComponents.has(comp.id)) {
      this.selection.clearSelection();
      this.selection.selectedComponents.add(comp.id);
      comp.element.classList.add('selected');
    }

    const selectedComps = Array.from(this.selection.selectedComponents)
      .map(id => this.compManager.getComponentById(id))
      .filter(Boolean);

    this.isDragging = true;
    this.dragData = {
      components: selectedComps,
      startX: clientX,
      startY: clientY,
      origins: {}
    };
    selectedComps.forEach(c => {
      this.dragData.origins[c.id] = { x: c.position.x, y: c.position.y };
      c.element.style.zIndex = '1000';
    });
  }

  /**
   * Update dragged components positions.
   */
  moveDrag(clientX, clientY) {
    if (!this.dragData) return;
    const dx = (clientX - this.dragData.startX) / this.core.scale;
    const dy = (clientY - this.dragData.startY) / this.core.scale;
    this.dragData.components.forEach(comp => {
      const orig = this.dragData.origins[comp.id];
      let nx = orig.x + dx;
      let ny = orig.y + dy;
      nx = this.core.snap(nx);
      ny = this.core.snap(ny);
      comp.updatePosition(nx, ny);
    });
    this.dragData.components.forEach(comp => this.wiring.updateWiresForComponent(comp));
    this.wiring.positionCache.invalidate(); // important: invalidate after move
  }

  endDrag() {
    if (this.dragData) {
      this.dragData.components.forEach(c => c.element.style.zIndex = '');
      this.dragData = null;
    }
    this.isDragging = false;
  }

  /**
   * Move selected components by keyboard arrows (already snaps).
   */
  moveSelectedComponents(dx, dy) {
    this.selection.selectedComponents.forEach(id => {
      const comp = this.compManager.getComponentById(id);
      if (comp) {
        const nx = this.core.snap(comp.position.x + dx);
        const ny = this.core.snap(comp.position.y + dy);
        comp.updatePosition(nx, ny);
      }
    });
    this.selection.selectedComponents.forEach(id => {
      const comp = this.compManager.getComponentById(id);
      if (comp) this.wiring.updateWiresForComponent(comp);
    });
    this.wiring.positionCache.invalidate();
    this.wiring.scheduleRedraw();
  }
}