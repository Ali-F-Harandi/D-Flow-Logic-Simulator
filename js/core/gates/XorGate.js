import { GateBase } from '../GateBase.js';
import { Value } from '../simulation/Value.js';

export class XorGate extends GateBase {
  static label = 'XOR';
  constructor(id, inputsCount = 2) {
    super(id, 'XOR', inputsCount, 1);
  }

  _computeGateLogic() {
    const parity = this.inputs.reduce((acc, inp) => acc ^ (inp.value ? 1 : 0), 0);
    return { outputs: [Boolean(parity)] };
  }

  _applyBusOperation(inputValues) {
    let result = inputValues[0] || Value.createUnknown(this.bitWidth);
    for (let i = 1; i < inputValues.length; i++) result = result.xor(inputValues[i]);
    return result;
  }

  render(container) {
    super.render(container, 'XOR');
  }
}
