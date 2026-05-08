import { GateBase } from '../GateBase.js';

export class OrGate extends GateBase {
  static label = 'OR';
  constructor(id, inputsCount = 2) {
    super(id, 'OR', inputsCount, 1);
  }

  computeNextState() {
    const out = this.inputs.some(inp => inp.value);
    return { outputs: [out] };
  }

  render(container) {
    super.render(container, 'OR');
  }
}