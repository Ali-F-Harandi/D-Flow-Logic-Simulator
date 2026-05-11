import { GateBase } from '../GateBase.js';

export class NotGate extends GateBase {
  static label = 'NOT';
  constructor(id) {
    super(id, 'NOT', 1, 1);
  }

  _computeGateLogic() {
    return { outputs: [!this.inputs[0].value] };
  }

  getProperties() { return []; }

  render(container) {
    super.render(container, 'NOT');
  }
}