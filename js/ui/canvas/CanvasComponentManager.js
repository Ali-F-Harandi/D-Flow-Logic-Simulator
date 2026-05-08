export class CanvasComponentManager {
  constructor(engine, core, eventBus) {
    this.engine = engine;
    this.core = core;
    this.eventBus = eventBus;
    this.components = [];
  }

  addComponent(comp) {
    comp.render(this.core.scene);
    comp.element.addEventListener('dragstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    comp.element.dataset.compId = comp.id;
    comp.element.setAttribute('tabindex', '-1');
    comp.element.setAttribute('role', 'group');
    comp.element.setAttribute('aria-label', `${comp.type} component`);

    // NOTE: Do NOT add mousedown+stopPropagation on connector dots.
    // CanvasEvents handles connector clicks for wiring start.
    // Previously, e.stopPropagation() here prevented the mousedown
    // from bubbling to CanvasEvents, which broke all wire creation.

    this.components.push(comp);
  }

  _deleteComponent(compId) {
    const comp = this.components.find(c => c.id === compId);
    if (comp) {
      if (comp.element) comp.element.remove();
      this.components = this.components.filter(c => c.id !== compId);
      this.engine.removeComponent(compId);
    }
  }

  /**
   * Called after a component is modified (e.g., property change), re-attaches listeners.
   */
  _onComponentModified(comp) {
    if (!comp.element) return;
    comp.element.setAttribute('draggable', 'false');
    comp.element.draggable = false;
    comp.element.addEventListener('dragstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    comp.element.dataset.compId = comp.id;
    comp.element.setAttribute('tabindex', '-1');
    comp.element.setAttribute('role', 'group');
    comp.element.setAttribute('aria-label', `${comp.type} component`);

    // NOTE: No connector mousedown listener with stopPropagation here.
    // CanvasEvents handles connector clicks for wiring.
  }

  getComponentById(id) {
    return this.components.find(c => c.id === id);
  }

  clear() {
    this.components.forEach(comp => {
      if (comp.element) comp.element.remove();
    });
    this.components = [];
  }
}
