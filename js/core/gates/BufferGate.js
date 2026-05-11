import { GateBase } from '../GateBase.js';

export class BufferGate extends GateBase {
  static label = 'BUFFER';
  constructor(id) {
    super(id, 'Buffer', 1, 1);
  }

  _computeGateLogic() {
    return { outputs: [Boolean(this.inputs[0].value)] };
  }

  getProperties() { return []; }

  render(container) {
    super.render(container, 'BUF');
  }
}
