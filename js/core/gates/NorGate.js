import { GateBase } from '../GateBase.js';

export class NorGate extends GateBase {
  static label = 'NOR';
  constructor(id, inputsCount = 2) {
    super(id, 'NOR', inputsCount, 1);
  }

  _computeGateLogic() {
    return { outputs: [!this.inputs.some(inp => inp.value)] };
  }

  render(container) {
    super.render(container, 'NOR');
  }
}