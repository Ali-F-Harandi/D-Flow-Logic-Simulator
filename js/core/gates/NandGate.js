import { GateBase } from '../GateBase.js';

export class NandGate extends GateBase {
  static label = 'NAND';
  constructor(id, inputsCount = 2) {
    super(id, 'NAND', inputsCount, 1);
  }

  computeNextState() {
    return { outputs: [!this.inputs.every(inp => inp.value)] };
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
    super.render(container, 'NAND');
  }
}