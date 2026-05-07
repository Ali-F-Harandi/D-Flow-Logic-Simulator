import { GateBase } from '../GateBase.js';

export class AndGate extends GateBase {
  static label = 'AND';
  constructor(id, inputsCount = 2) {
    super(id, 'AND', inputsCount, 1);
  }

  computeNextState() {
    const out = this.inputs.every(inp => inp.value);
    return { outputs: [out] };
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
    super.render(container, 'AND');
  }
}