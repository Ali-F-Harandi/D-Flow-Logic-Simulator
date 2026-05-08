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

  render(container) {
    super.render(container, 'XNOR');
  }
}