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
    this.GRID = 20;
    this.isWrapped = false;   // <-- NEW: prevents double-wrapping
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

  reset() {
    this.outputs.forEach(o => o.value = false);
    this.inputs.forEach(i => i.value = false);
    this._updateConnectorStates();
  }

  getProperties() { return []; }
  setProperty(name, value) { return false; }

  _getStateColor(value) {
    if (value === true)  return '#4ec9b0';
    if (value === false) return '#666';
    return '#666';
  }

  _updateConnectorStates() {
    if (!this.element) return;
    const dots = this.element.querySelectorAll('.connector');
    dots.forEach(dot => {
      const nid = dot.dataset.node;
      const node = [...this.inputs, ...this.outputs].find(n => n.id === nid);
      if (node) dot.style.backgroundColor = this._getStateColor(node.value);
    });
    this._updateBorderState();
  }

  _updateBorderState() {
    if (!this.element) return;
    if (this.outputs.length > 0 && this.outputs.some(o => o.value === true)) {
      this.element.style.borderColor = '#4ec9b0';
      this.element.style.boxShadow = '0 0 8px rgba(78,201,176,0.5)';
    } else {
      this.element.style.borderColor = 'var(--color-border)';
      this.element.style.boxShadow = 'var(--shadow-sm)';
    }
  }

  rerender() {
    if (this.element && this.container) {
      const oldEl = this.element;
      this.render(this.container);
      oldEl.remove();
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

  _createConnectorBlock(node, isInput, labelText, dotCenterY) {
    const block = document.createElement('div');
    block.style.position = 'absolute';
    block.style.top = `${dotCenterY - 6}px`;
    if (isInput) block.style.left = '0px';
    else block.style.right = '0px';
    block.style.width = '40px';
    block.style.height = '12px';

    const dot = document.createElement('div');
    dot.className = `connector ${isInput ? 'input' : 'output'}`;
    dot.dataset.node = node.id;
    dot.style.backgroundColor = this._getStateColor(node.value);
    dot.style.position = 'absolute';
    dot.style.top = '1px';
    if (isInput) dot.style.left = '-5px';
    else dot.style.right = '-5px';

    const label = document.createElement('span');
    label.className = 'connector-label';
    label.textContent = labelText;
    label.style.position = 'absolute';
    label.style.top = '0px';
    if (isInput) label.style.left = '10px';
    else label.style.right = '10px';

    block.appendChild(dot);
    block.appendChild(label);
    return block;
  }
}