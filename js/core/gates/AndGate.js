import { Component } from '../Component.js';

export class AndGate extends Component {
  static label = 'AND';
  constructor(id, inputsCount = 2) {
    super(id, 'AND', inputsCount, 1);
  }

  computeOutput() {
    const out = this.inputs.every(inp => inp.value);
    this.outputs[0].value = out;
    this._updateConnectorStates();
    return this.outputs;
  }

  getProperties() {
    return [{ name: 'inputs', label: 'Inputs', type: 'number', value: this.inputs.length, min: 2, max: 8 }];
  }

  setProperty(name, value) {
    if (name === 'inputs') {
      const newCount = parseInt(value, 10);
      if (newCount === this.inputs.length || newCount < 2 || newCount > 8) return false;
      const old = this.inputs;
      this.inputs = [];
      for (let i = 0; i < newCount; i++) {
        this.inputs.push({
          id: `${this.id}.input.${i}`,
          value: (old[i] ? old[i].value : false),
          connectedTo: (old[i] ? old[i].connectedTo : null)
        });
      }
      this.rerender();
      return true;
    }
    return false;
  }

  render(container) {
    const n = this.inputs.length;
    const H = Math.max(3, n + 1) * this.GRID; // height in grid units
    const el = document.createElement('div');
    el.className = 'component gate and-gate';
    el.style.width = `${4 * this.GRID}px`;   // 80
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'gate-body';
    body.textContent = 'AND';
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    el.appendChild(body);

    // Input connectors – centres at y = 20, 40, 60, …
    for (let i = 0; i < n; i++) {
      el.appendChild(this._createConnectorBlock(
        this.inputs[i], true, `I${i}`,
        (i + 1) * this.GRID
      ));
    }

    // Output connector – centre at same Y as first input (20)
    el.appendChild(this._createConnectorBlock(
      this.outputs[0], false, 'O0',
      this.GRID
    ));

    container.appendChild(el);
    this.element = el;
    this.container = container;
  }
}