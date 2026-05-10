export class CanvasComponentManager {
  constructor(engine, core, eventBus) {
    this.engine = engine;
    this.core = core;
    this.eventBus = eventBus;
    this.components = [];

    // Component type descriptions for educational tooltips
    this._typeDescriptions = {
      'and': 'AND: Outputs HIGH only when ALL inputs are HIGH',
      'or': 'OR: Outputs HIGH when ANY input is HIGH',
      'not': 'NOT: Inverts the input signal',
      'nand': 'NAND: Outputs LOW only when ALL inputs are HIGH',
      'nor': 'NOR: Outputs HIGH only when ALL inputs are LOW',
      'xor': 'XOR: Outputs HIGH when inputs differ',
      'xnor': 'XNOR: Outputs HIGH when inputs are the same',
      'buffer': 'Buffer: Passes input to output without change',
      'tri_state_buffer': 'Tri-State Buffer: Passes signal only when enabled',
      'sr_latch': 'SR Latch: Stores one bit using Set and Reset',
      'd_flipflop': 'D Flip-Flop: Captures input on clock edge',
      'jk_flipflop': 'JK Flip-Flop: Versatile flip-flop with J, K, and Clock',
      't_flipflop': 'T Flip-Flop: Toggles output on clock edge when T=HIGH',
      'sr_flipflop': 'SR Flip-Flop: Clocked Set-Reset storage element',
      'shift_register': 'Shift Register: Shifts data on each clock pulse',
      'half_adder': 'Half Adder: Adds two bits, outputs Sum and Carry',
      'full_adder': 'Full Adder: Adds two bits with carry input',
      'multiplexer': 'Multiplexer: Selects one input from multiple sources',
      'toggle_switch': 'Toggle Switch: Click to switch between HIGH and LOW',
      'clock': 'Clock: Generates periodic HIGH/LOW signal',
      'high_constant': 'High Constant: Always outputs HIGH (1)',
      'low_constant': 'Low Constant: Always outputs LOW (0)',
      'dip_switch': 'DIP Switch: Multiple independent switches in one component',
      'light_bulb': 'Light Bulb: Lights up when input is HIGH',
      'logic_probe': 'Logic Probe: Displays the current signal value',
      'led_array': 'LED Array: Multiple LEDs to display binary values',
      'seven_segment': 'Seven Segment: Displays hexadecimal digits 0-F'
    };
  }

  addComponent(comp) {
    comp.render(this.core.scene);
    comp.element.addEventListener('dragstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    comp.element.dataset.compId = comp.id;
    comp.element.setAttribute('tabindex', '0');
    comp.element.setAttribute('role', 'group');
    comp.element.setAttribute('aria-label', `${comp.type} component`);

    // Add educational tooltip describing the component's logic
    const description = this._typeDescriptions[comp.type];
    if (description) {
      const title = comp.element.querySelector('title') || document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = description;
      title.classList.add('component-tooltip');
      if (!comp.element.querySelector('title')) {
        comp.element.insertBefore(title, comp.element.firstChild);
      }
    }

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