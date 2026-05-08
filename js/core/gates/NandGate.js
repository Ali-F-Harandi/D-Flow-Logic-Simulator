import { GateBase } from '../GateBase.js';

export class NandGate extends GateBase {
  static label = 'NAND';
  constructor(id, inputsCount = 2) {
    super(id, 'NAND', inputsCount, 1);
  }

  computeNextState() {
    return { outputs: [!this.inputs.every(inp => inp.value)] };
  }

  render(container) {
    super.render(container, 'NAND');
  }
}