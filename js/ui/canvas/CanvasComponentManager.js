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

  /**
   * Remove a component from the canvas (DOM only).
   * @param {string} compId
   * @param {Object} [opts] - Options
   * @param {boolean} [opts.skipEngine] - If true, do NOT call engine.removeComponent()
   *   (the caller, e.g. a command, already did it).  FIX (Bug #3): Previously
   *   this method always called engine.removeComponent(), which caused double
   *   removal when called from DeleteComponentCommand and redundant engine
   *   state changes.  Now the command is the sole authority for engine state.
   */
  _deleteComponent(compId, opts = {}) {
    const comp = this.components.find(c => c.id === compId);
    if (comp) {
      if (comp.element) comp.element.remove();
      this.components = this.components.filter(c => c.id !== compId);
      if (!opts.skipEngine) {
        this.engine.removeComponent(compId);
      }
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