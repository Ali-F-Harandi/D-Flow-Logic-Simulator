import { GateBase } from '../GateBase.js';
import { Value } from '../simulation/Value.js';

export class NorGate extends GateBase {
  static label = 'NOR';
  constructor(id, inputsCount = 2) {
    super(id, 'NOR', inputsCount, 1);
  }

  _computeGateLogic() {
    return { outputs: [!this.inputs.some(inp => inp.value)] };
  }

  _applyBusOperation(inputValues) {
    let result = inputValues[0] || Value.createUnknown(this.bitWidth);
    for (let i = 1; i < inputValues.length; i++) result = result.or(inputValues[i]);
    return result.not();
  }

  render(container) {
    super.render(container, 'NOR');
  }
}
