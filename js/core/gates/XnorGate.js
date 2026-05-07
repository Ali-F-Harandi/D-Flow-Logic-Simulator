import { GateBase } from '../GateBase.js';

export class XnorGate extends GateBase {
  static label = 'XNOR';
  constructor(id, inputsCount = 2) {
    super(id, 'XNOR', inputsCount, 1);
  }

  computeNextState() {
    const parity = this.inputs.reduce((acc, inp) => acc ^ (inp.value ? 1 : 0), 0);
    return { outputs: [Boolean(parity === 0)] };
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
    super.render(container, 'XNOR');
  }
}