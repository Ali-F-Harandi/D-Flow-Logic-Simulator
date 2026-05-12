import { GateBase } from '../GateBase.js';
import { Value } from '../simulation/Value.js';

export class AndGate extends GateBase {
  static label = 'AND';
  constructor(id, inputsCount = 2) {
    super(id, 'AND', inputsCount, 1);
  }

  _computeGateLogic() {
    const out = this.inputs.every(inp => inp.value);
    return { outputs: [out] };
  }

  _applyBusOperation(inputValues) {
    let result = inputValues[0] || Value.createUnknown(this.bitWidth);
    for (let i = 1; i < inputValues.length; i++) result = result.and(inputValues[i]);
    return result;
  }

  render(container) {
    super.render(container, 'AND');
  }
}
