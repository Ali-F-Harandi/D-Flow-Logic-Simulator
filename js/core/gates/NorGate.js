import { Component } from '../Component.js';

export class NorGate extends Component {
  static label = 'NOR';
  constructor(id, inputsCount = 2) {
    super(id, 'NOR', inputsCount, 1);
  }

  computeNextState() {
    return { outputs: [!this.inputs.some(inp => inp.value)] };
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
    const H = Math.max(3, n + 1) * this.GRID;
    const el = document.createElement('div');
    el.className = 'component gate nor-gate';
    el.style.width = `${4 * this.GRID}px`;
    el.style.height = `${H}px`;
    el.style.left = `${this.position.x}px`;
    el.style.top = `${this.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.draggable = false;

    const body = document.createElement('div');
    body.className = 'gate-body';
    body.textContent = 'NOR';
    body.style.position = 'absolute';
    body.style.top = '50%';
    body.style.left = '50%';
    body.style.transform = 'translate(-50%, -50%)';
    el.appendChild(body);

    for (let i = 0; i < n; i++) {
      el.appendChild(this._createConnectorBlock(this.inputs[i], true, `I${i}`, (i + 1) * this.GRID));
    }
    el.appendChild(this._createConnectorBlock(this.outputs[0], false, 'O0', this.GRID));

    container.appendChild(el);
    this.element = el;
    this.container = container;
  }
}