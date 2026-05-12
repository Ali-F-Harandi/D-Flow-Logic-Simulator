import { GateBase } from '../GateBase.js';
import { Value } from '../simulation/Value.js';

export class OrGate extends GateBase {
  static label = 'OR';
  constructor(id, inputsCount = 2) {
    super(id, 'OR', inputsCount, 1);
  }

  _computeGateLogic() {
    const out = this.inputs.some(inp => inp.value);
    return { outputs: [out] };
  }

  _applyBusOperation(inputValues) {
    let result = inputValues[0] || Value.createUnknown(this.bitWidth);
    for (let i = 1; i < inputValues.length; i++) result = result.or(inputValues[i]);
    return result;
  }

  render(container) {
    super.render(container, 'OR');
  }
}
