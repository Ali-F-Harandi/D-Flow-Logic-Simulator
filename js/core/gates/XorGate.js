import { GateBase } from '../GateBase.js';

export class XorGate extends GateBase {
  static label = 'XOR';
  constructor(id, inputsCount = 2) {
    super(id, 'XOR', inputsCount, 1);
  }

  _computeGateLogic() {
    const parity = this.inputs.reduce((acc, inp) => acc ^ (inp.value ? 1 : 0), 0);
    return { outputs: [Boolean(parity)] };
  }

  render(container) {
    super.render(container, 'XOR');
  }
}