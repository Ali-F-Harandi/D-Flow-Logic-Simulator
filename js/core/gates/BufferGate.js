import { GateBase } from '../GateBase.js';

export class BufferGate extends GateBase {
  static label = 'BUFFER';
  constructor(id) {
    super(id, 'Buffer', 1, 1);
  }

  _computeGateLogic() {
    return { outputs: [Boolean(this.inputs[0].value)] };
  }

  getProperties() {
    // Buffer gate has fixed 1 input - skip GateBase's 'inputs' property
    return super.getProperties().filter(p => p.name !== 'inputs');
  }

  setProperty(name, value) {
    // Skip GateBase's 'inputs' handling - Buffer gate always has 1 input
    const proto = Object.getPrototypeOf(Object.getPrototypeOf(this));
    return proto.setProperty.call(this, name, value);
  }

  render(container) {
    super.render(container, 'BUF');
  }
}
