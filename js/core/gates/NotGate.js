import { GateBase } from '../GateBase.js';

export class NotGate extends GateBase {
  static label = 'NOT';
  constructor(id) {
    super(id, 'NOT', 1, 1);
  }

  _computeGateLogic() {
    return { outputs: [!this.inputs[0].value] };
  }

  getProperties() {
    // NOT gate has fixed 1 input - skip GateBase's 'inputs' property
    return super.getProperties().filter(p => p.name !== 'inputs');
  }

  setProperty(name, value) {
    // Skip GateBase's 'inputs' handling - NOT gate always has 1 input
    const proto = Object.getPrototypeOf(Object.getPrototypeOf(this));
    return proto.setProperty.call(this, name, value);
  }

  render(container) {
    super.render(container, 'NOT');
  }
}