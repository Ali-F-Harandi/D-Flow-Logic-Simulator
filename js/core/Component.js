import { GRID_SIZE } from '../config.js';

// Rotation facing direction constants
const FACING_ORDER = ['east', 'south', 'west', 'north'];
const FACING_ANGLES = { east: 0, south: 90, west: 180, north: 270 };

export class Component {
  constructor(id, type, inputsCount = 0, outputsCount = 1) {
    this.id = id;
    this.type = type;
    this.inputs = [];
    for (let i = 0; i < inputsCount; i++) {
      this.inputs.push({ id: `${this.id}.input.${i}`, value: false, connectedTo: null });
    }
    this.outputs = [];
    for (let i = 0; i < outputsCount; i++) {
      this.outputs.push({ id: `${this.id}.output.${i}`, value: false });
    }
    this.position = { x: 100, y: 100 };
    this.element = null;
    this.container = null;
    this.GRID = GRID_SIZE;
    this.isWrapped = false;
    this._errorState = false;

    // Feature 1: Gate Rotation — facing direction
    this.facing = 'east'; // 'east' | 'south' | 'west' | 'north'

    // Feature 2: Gate Mirroring — Y-axis flip
    this.mirrored = false;
  }

  getType() { return this.type; }
  getInputNodes() { return this.inputs; }
  getOutputNodes() { return this.outputs; }

  setInputValue(index, value) {
    if (this.inputs[index]) {
      this.inputs[index].value = value;
      this.computeOutput();
    }
  }

  computeOutput() {
    const ns = this.computeNextState();
    this.applyNextState(ns);
    return this.outputs;
  }

  computeNextState() {
    return { outputs: this.outputs.map(o => o.value) };
  }

  applyNextState(nextState) {
    const { outputs } = nextState;
    for (let i = 0; i < this.outputs.length; i++) {
      this.outputs[i].value = outputs[i];
    }
    this._updateConnectorStates();
  }

  /**
   * Full reset: clears all outputs and inputs.
   * Used by Engine.reset() for gates and output-only components.
   * Input components (DipSwitch, Clock, etc.) override this to
   * preserve their user-set toggle state.
   * Sequential components override this to also reset internal state.
   */
  reset() {
    this.outputs.forEach(o => o.value = false);
    this.inputs.forEach(i => i.value = false);
    this._updateConnectorStates();
  }

  /**
   * Sequential-state-only reset: clears internal sequential state
   * (flip-flop _state, _prevClk) but preserves output values that
   * are set by user interaction (e.g. DipSwitch toggle positions).
   * Input components override this as a no-op.
   */
  resetState() {
    // Default: same as reset() for combinational components
    this.reset();
  }

  getProperties() { return []; }
  setProperty(name, value) { return false; }

  /* ================================================================
   *  Feature 1: Gate Rotation
   * ================================================================ */

  /**
   * Rotate the component 90° clockwise.
   * Cycles through east → south → west → north.
   */
  rotate() {
    const idx = FACING_ORDER.indexOf(this.facing);
    this.facing = FACING_ORDER[(idx + 1) % 4];
    this._applyTransform();
  }

  /**
   * Get the CSS rotation angle for the current facing direction.
   * @returns {number} degrees
   */
  getFacingAngle() {
    return FACING_ANGLES[this.facing] || 0;
  }

  /* ================================================================
   *  Feature 2: Gate Mirroring
   * ================================================================ */

  /**
   * Toggle the Y-axis mirror (horizontal flip) of the component.
   */
  toggleMirror() {
    this.mirrored = !this.mirrored;
    this._applyTransform();
  }

  /* ================================================================
   *  Combined Transform (Rotation + Mirror)
   * ================================================================ */

  /**
   * Apply CSS transform combining rotation and optional mirror.
   * Uses transform-origin at the center of the component.
   */
  _applyTransform() {
    if (!this.element) return;
    const angle = this.getFacingAngle();
    let transform = `rotate(${angle}deg)`;
    if (this.mirrored) {
      transform += ' scaleX(-1)';
    }
    this.element.style.transformOrigin = 'center center';
    this.element.style.transform = transform;
  }

  _getStateColor(value) {
    if (value === true)  return 'var(--color-success)';
    if (value === false) return 'var(--color-text-muted)';
    return 'var(--color-text-muted)';
  }

  _updateConnectorStates() {
    if (!this.element) return;
    const dots = this.element.querySelectorAll('.connector');
    dots.forEach(dot => {
      const nid = dot.dataset.node;
      const node = [...this.inputs, ...this.outputs].find(n => n.id === nid);
      if (node) {
        const color = this._getStateColor(node.value);
        dot.style.backgroundColor = color;
        // Also update the connector line color to match the dot state
        const block = dot.parentElement;
        if (block) {
          const line = block.querySelector('.connector-line');
          if (line) {
            line.style.backgroundColor = node.value === true
              ? 'var(--color-success, #00cc66)'
              : 'var(--color-border, #888)';
          }
        }
      }
    });
    this._updateBorderState();
  }

  _updateBorderState() {
    if (!this.element) return;
    if (this._errorState) {
      this.element.classList.add('error-state');
      return;
    }
    this.element.classList.remove('error-state');
    if (this.outputs.length > 0 && this.outputs.some(o => o.value === true)) {
      this.element.style.borderColor = 'var(--gate-highlight-border)';
      this.element.style.boxShadow = 'var(--gate-highlight-shadow)';
    } else {
      this.element.style.borderColor = 'var(--color-border)';
      this.element.style.boxShadow = 'var(--shadow-sm)';
    }
  }

  /**
   * Set or clear the error state for this component.
   * @param {boolean} hasError
   */
  setErrorState(hasError) {
    this._errorState = hasError;
    this._updateBorderState();
  }

  /**
   * Check if this component is in error state.
   */
  get isError() { return this._errorState; }

  rerender() {
    if (this.element && this.container) {
      const oldEl = this.element;
      const nextSibling = oldEl.nextSibling;
      this.render(this.container);
      // Preserve DOM order by inserting the new element where the old one was
      if (nextSibling) {
        this.container.insertBefore(this.element, nextSibling);
      }
      oldEl.remove();
      // Re-apply rotation/mirror transform after re-render
      this._applyTransform();
      return true;
    }
    return false;
  }

  render(container) { this.container = container; }

  updatePosition(x, y) {
    this.position.x = x;
    this.position.y = y;
    if (this.element) {
      this.element.style.left = `${x}px`;
      this.element.style.top = `${y}px`;
    }
  }

  /**
   * Create a connector block with dot, label, and a short line connecting
   * the dot to the component body edge.
   *
   * Layout:
   *   Input:  [dot]---line---| component body |  label
   *   Output:        label  | component body |---line---[dot]
   *
   * The dot is offset 1 grid size (GRID_SIZE) from the component body,
   * connected by a visible line. The label stays near the component body.
   */
  _createConnectorBlock(node, isInput, labelText, dotCenterY) {
    const block = document.createElement('div');
    block.style.position = 'absolute';
    block.style.top = `${dotCenterY - 4}px`;

    // Feature 4: Check if this input is negated — widen block for inversion bubble
    const isNegated = isInput && this.isInputNegated && this.isInputNegated(
      this.inputs.findIndex(inp => inp.id === node.id)
    );

    // Base width for label area + GRID_SIZE for the offset line
    const baseWidth = isNegated ? 48 : 36;
    const totalWidth = baseWidth + GRID_SIZE;

    if (isInput) {
      block.style.left = `-${GRID_SIZE}px`;
    } else {
      block.style.right = `-${GRID_SIZE}px`;
    }
    block.style.width = `${totalWidth}px`;
    block.style.height = '8px';

    // ─── Connector line (from component body edge to dot area) ───
    const line = document.createElement('div');
    line.className = 'connector-line';
    line.style.position = 'absolute';
    line.style.top = '3px';   // vertically center in 8px height (line is 2px)
    line.style.height = '2px';
    line.style.backgroundColor = 'var(--color-border, #888)';
    line.style.pointerEvents = 'none';

    if (isInput) {
      if (isNegated) {
        // Negated: dot at left: -10px → right edge at x=-2; bubble at left: GRID_SIZE-10
        // Line from dot right edge to bubble left edge
        line.style.left = '0px';
        line.style.width = `${GRID_SIZE - 10}px`;
      } else {
        // Standard: dot at left: -4px → right edge at x=4; component edge at GRID_SIZE
        line.style.left = '4px';
        line.style.width = `${GRID_SIZE - 4}px`;
      }
    } else {
      // Output line from component body edge to dot area
      // Component body edge at x = baseWidth relative to block
      // Dot at right: -4px → left edge at totalWidth - 4
      line.style.left = `${baseWidth}px`;
      line.style.width = `${GRID_SIZE - 4}px`;
    }
    block.appendChild(line);

    // ─── Inversion bubble (if negated input) ───
    if (isNegated) {
      const bubble = document.createElement('div');
      bubble.className = 'inversion-bubble input-bubble';
      // Position bubble at the component body edge (GRID_SIZE from block left)
      bubble.style.left = `${GRID_SIZE - 10}px`;
      block.appendChild(bubble);
    }

    // ─── Connector dot ───
    const dot = document.createElement('div');
    dot.className = `connector ${isInput ? 'input' : 'output'}`;
    dot.dataset.node = node.id;
    dot.style.backgroundColor = this._getStateColor(node.value);
    dot.style.position = 'absolute';
    dot.style.top = '0px';
    if (isInput) {
      dot.style.left = isNegated ? '-10px' : '-4px';
    } else {
      dot.style.right = '-4px';
    }
    block.appendChild(dot);

    // ─── Label ───
    const label = document.createElement('span');
    label.className = 'connector-label';
    label.textContent = labelText;
    label.style.position = 'absolute';
    label.style.top = '-1px';
    if (isInput) {
      // Label stays near the component body (after the line area)
      label.style.left = `${GRID_SIZE + (isNegated ? 18 : 8)}px`;
    } else {
      // Label stays near the component body (before the line area)
      label.style.right = `${GRID_SIZE + 8}px`;
    }
    block.appendChild(label);

    return block;
  }
}