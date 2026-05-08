/**
 * Pure data model for a circuit: components and wires.
 */
export class Circuit {
  constructor() {
    this.components = new Map();   // id -> Component
    this.wires = [];               // { id, from: {componentId, nodeId}, to: {componentId, nodeId} }
  }

  addComponent(component) {
    this.components.set(component.id, component);
  }

  removeComponent(compId) {
    // Wire cleanup is handled by Engine.disconnect() before this call
    this.components.delete(compId);
  }

  addWire(wire) {
    this.wires.push(wire);
  }

  removeWire(wireId) {
    const idx = this.wires.findIndex(w => w.id === wireId);
    if (idx !== -1) this.wires.splice(idx, 1);
  }

  clear() {
    this.components.clear();
    this.wires = [];
  }

  toJSON() {
    const components = [];
    for (const comp of this.components.values()) {
      const inputStates = comp.inputs.map(inp => ({
        nodeId: inp.id,
        connectedTo: inp.connectedTo ? { componentId: inp.connectedTo.componentId, nodeId: inp.connectedTo.nodeId } : null
      }));
      const outputStates = comp.outputs.map(o => ({ nodeId: o.id, value: o.value }));
      let internalState = {};
      if (comp._state !== undefined) {
        internalState._state = Array.isArray(comp._state) ? [...comp._state] : { ...comp._state };
      }
      if (comp._prevClk !== undefined) internalState._prevClk = comp._prevClk;
      if (comp.frequency !== undefined) internalState.frequency = comp.frequency;
      components.push({
        id: comp.id,
        type: comp.type,
        position: { x: comp.position.x, y: comp.position.y },
        properties: comp.getProperties().reduce((acc, p) => { acc[p.name] = p.value; return acc; }, {}),
        inputs: inputStates,
        outputs: outputStates,
        internalState: Object.keys(internalState).length ? internalState : undefined
      });
    }
    const wires = this.wires.map(w => ({
      id: w.id,
      from: w.from,
      to: w.to
    }));
    return { components, wires };
  }

  static fromJSON(data, factory) {
    const circuit = new Circuit();
    for (const compData of data.components) {
      const comp = factory.createComponent(compData.type, compData.id);
      comp.position.x = compData.position.x;
      comp.position.y = compData.position.y;
      const props = comp.getProperties();
      if (props) {
        props.forEach(prop => {
          if (compData.properties && compData.properties.hasOwnProperty(prop.name)) {
            comp.setProperty(prop.name, compData.properties[prop.name]);
          }
        });
      }
      if (compData.internalState) {
        if (compData.internalState._state !== undefined) {
          comp._state = Array.isArray(compData.internalState._state)
            ? [...compData.internalState._state]
            : { ...compData.internalState._state };
        }
        if (compData.internalState._prevClk !== undefined) comp._prevClk = compData.internalState._prevClk;
        if (compData.internalState.frequency !== undefined && comp.setFrequency) comp.setFrequency(compData.internalState.frequency);
      }
      circuit.addComponent(comp);
    }
    for (const w of data.wires) {
      circuit.addWire(w);
    }
    return circuit;
  }
}