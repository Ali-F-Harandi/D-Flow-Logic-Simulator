/**
 * Pure data model for a circuit: components and wires.
 *
 * Performance improvement: wires are now stored in both an Array (for
 * ordered iteration) AND a Map (for O(1) lookups by ID). The
 * _wireIndex Map is kept in sync with the wires Array automatically.
 */
export class Circuit {
  constructor() {
    this.components = new Map();   // id -> Component
    this.wires = [];               // { id, from: {componentId, nodeId}, to: {componentId, nodeId} }
    this._wireIndex = new Map();   // id -> wire object (O(1) lookup)
    this._nodeToWireIndex = new Map(); // toNodeId -> wire (O(1) lookup for disconnect)
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
    this._wireIndex.set(wire.id, wire);
    if (wire.to && wire.to.nodeId) {
      this._nodeToWireIndex.set(wire.to.nodeId, wire);
    }
  }

  removeWire(wireId) {
    const wire = this._wireIndex.get(wireId);
    if (wire) {
      // Remove from node index
      if (wire.to && wire.to.nodeId) {
        this._nodeToWireIndex.delete(wire.to.nodeId);
      }
      // Remove from wire index
      this._wireIndex.delete(wireId);
      // Remove from array
      const idx = this.wires.indexOf(wire);
      if (idx !== -1) this.wires.splice(idx, 1);
    }
  }

  /**
   * Find a wire by its ID in O(1) time.
   * @param {string} wireId
   * @returns {Object|undefined}
   */
  getWireById(wireId) {
    return this._wireIndex.get(wireId);
  }

  /**
   * Find a wire by the target (input) node ID in O(1) time.
   * Used when checking if an input is already connected.
   * @param {string} toNodeId
   * @returns {Object|undefined}
   */
  getWireByToNode(toNodeId) {
    return this._nodeToWireIndex.get(toNodeId);
  }

  /**
   * Find wires originating from a specific output node.
   * Returns an array of wires (there can be multiple fan-out wires).
   * @param {string} fromNodeId
   * @returns {Array}
   */
  getWiresFromNode(fromNodeId) {
    const result = [];
    for (const wire of this.wires) {
      if (wire.from.nodeId === fromNodeId) {
        result.push(wire);
      }
    }
    return result;
  }

  clear() {
    this.components.clear();
    this.wires = [];
    this._wireIndex.clear();
    this._nodeToWireIndex.clear();
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
      // Pass componentData so the factory can migrate old type names
      // (e.g., old 'DipSwitch' = single toggle → new 'ToggleSwitch')
      const comp = factory.createComponent(compData.type, compData.id, compData);
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
      // FIX: Restore output values (e.g., ToggleSwitch/DipSwitch positions)
      // so that switch states are preserved after save/load.
      if (compData.outputs) {
        for (let i = 0; i < compData.outputs.length && i < comp.outputs.length; i++) {
          comp.outputs[i].value = compData.outputs[i].value;
        }
      }
      circuit.addComponent(comp);
    }
    for (const w of data.wires) {
      circuit.addWire(w);
    }
    return circuit;
  }
}
