import { GateBase } from '../GateBase.js';
import { Value } from '../simulation/Value.js';

export class NandGate extends GateBase {
  static label = 'NAND';
  constructor(id, inputsCount = 2) {
    super(id, 'NAND', inputsCount, 1);
  }

  _computeGateLogic() {
    return { outputs: [!this.inputs.every(inp => inp.value)] };
  }

  _applyBusOperation(inputValues) {
    let result = inputValues[0] || Value.createUnknown(this.bitWidth);
    for (let i = 1; i < inputValues.length; i++) result = result.and(inputValues[i]);
    return result.not();
  }

  render(container) {
    super.render(container, 'NAND');
  }
}
