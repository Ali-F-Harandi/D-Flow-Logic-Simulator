import { GateBase } from '../GateBase.js';

export class AndGate extends GateBase {
  static label = 'AND';
  constructor(id, inputsCount = 2) {
    super(id, 'AND', inputsCount, 1);
  }

  _computeGateLogic() {
    const out = this.inputs.every(inp => inp.value);
    return { outputs: [out] };
  }

  render(container) {
    super.render(container, 'AND');
  }
}