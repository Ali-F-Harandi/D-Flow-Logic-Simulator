import { GateBase } from '../GateBase.js';
import { Value } from '../simulation/Value.js';

export class XnorGate extends GateBase {
  static label = 'XNOR';
  constructor(id, inputsCount = 2) {
    super(id, 'XNOR', inputsCount, 1);
  }

  _computeGateLogic() {
    const parity = this.inputs.reduce((acc, inp) => acc ^ (inp.value ? 1 : 0), 0);
    return { outputs: [Boolean(parity === 0)] };
  }

  _applyBusOperation(inputValues) {
    let result = inputValues[0] || Value.createUnknown(this.bitWidth);
    for (let i = 1; i < inputValues.length; i++) result = result.xor(inputValues[i]);
    return result.not();
  }

  render(container) {
    super.render(container, 'XNOR');
  }
}
