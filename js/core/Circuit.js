/**
 * Circuit.js — Pure data model for a digital logic circuit.
 *
 * Manages two primary collections:
 *   - components: Map of component ID → Component instance
 *   - wires: Array of wire objects connecting component ports
 *
 * Performance features:
 *   - Wires are indexed by ID (_wireIndex Map) for O(1) lookups
 *   - Wires are indexed by target node ID (_nodeToWireIndex Map) for
 *     O(1) "which wire connects to this input?" queries
 *   - Serialization/deserialization handles Value objects and bus widths
 *
 * Note: Wire validation on deserialization (fromJSON) ensures corrupted
 * save data with dangling wire references is gracefully skipped.
 */
import { Value } from './simulation/Value.js';

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

  /**
   * Recursively convert Value objects in a state object to JSON-friendly format.
   * Value objects are tagged as { __value__: true, width, error, unknown, value }.
   */
  static _serializeStateObj(obj) {
    if (obj instanceof Value) {
      return { __value__: true, width: obj.width, error: obj.error, unknown: obj.unknown, value: obj.value };
    }
    if (Array.isArray(obj)) {
      return obj.map(item => Circuit._serializeStateObj(item));
    }
    if (obj !== null && typeof obj === 'object') {
      const result = {};
      for (const key of Object.keys(obj)) {
        result[key] = Circuit._serializeStateObj(obj[key]);
      }
      return result;
    }
    return obj;
  }

  /**
   * Recursively restore Value objects from their serialized format.
   */
  static _deserializeStateObj(obj) {
    if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
      if (obj.__value__) {
        return new Value(obj.width, obj.error, obj.unknown, obj.value);
      }
      const result = {};
      for (const key of Object.keys(obj)) {
        result[key] = Circuit._deserializeStateObj(obj[key]);
      }
      return result;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => Circuit._deserializeStateObj(item));
    }
    return obj;
  }

  toJSON() {
    const components = [];
    for (const comp of this.components.values()) {
      const inputStates = comp.inputs.map(inp => ({
        nodeId: inp.id,
        connectedTo: inp.connectedTo ? { componentId: inp.connectedTo.componentId, nodeId: inp.connectedTo.nodeId } : null
      }));
      const outputStates = comp.outputs.map(o => ({
        nodeId: o.id,
        value: o.value instanceof Value ? o.value.toLongValue() : o.value,
        width: o.width || 1
      }));
      let internalState = {};
      if (comp._state !== undefined) {
        internalState._state = Circuit._serializeStateObj(comp._state);
      }
      if (comp._prevClk !== undefined) internalState._prevClk = comp._prevClk;
      if (comp.frequency !== undefined) internalState.frequency = comp.frequency;
      if (comp._triggerEdge !== undefined) internalState._triggerEdge = comp._triggerEdge;
      // Subcircuit-specific: save inner circuit and port labels
      if (comp.type === 'Subcircuit') {
        if (comp._innerCircuit) internalState.innerCircuit = comp._innerCircuit;
        if (comp._inputLabels) internalState.inputLabels = [...comp._inputLabels];
        if (comp._outputLabels) internalState.outputLabels = [...comp._outputLabels];
      }
      // ToggleSwitch label
      if (comp._label !== undefined) internalState._label = comp._label;
      // Save busInput/busOutput flags for components that have them
      if (comp._busInput !== undefined) internalState._busInput = comp._busInput;
      if (comp._busOutput !== undefined) internalState._busOutput = comp._busOutput;
      // Save outputValue for ToggleSwitch bus mode
      if (comp._outputValue !== undefined) internalState._outputValue = comp._outputValue;
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
          // Deserialize internal state, restoring Value objects
          comp._state = Circuit._deserializeStateObj(compData.internalState._state);
        }
        if (compData.internalState._prevClk !== undefined) comp._prevClk = compData.internalState._prevClk;
        if (compData.internalState.frequency !== undefined && comp.setFrequency) comp.setFrequency(compData.internalState.frequency);
        if (compData.internalState._triggerEdge !== undefined) comp._triggerEdge = compData.internalState._triggerEdge;
        // Subcircuit: restore inner circuit and port labels
        if (comp.type === 'Subcircuit') {
          if (compData.internalState.innerCircuit) comp._innerCircuit = compData.internalState.innerCircuit;
          if (compData.internalState.inputLabels) comp._inputLabels = [...compData.internalState.inputLabels];
          if (compData.internalState.outputLabels) comp._outputLabels = [...compData.internalState.outputLabels];
        }
        // ToggleSwitch label
        if (compData.internalState._label !== undefined && comp._label !== undefined) comp._label = compData.internalState._label;
        // Restore busInput/busOutput flags
        if (compData.internalState._busInput !== undefined && comp._busInput !== undefined) comp._busInput = compData.internalState._busInput;
        if (compData.internalState._busOutput !== undefined && comp._busOutput !== undefined) comp._busOutput = compData.internalState._busOutput;
        // Restore outputValue for ToggleSwitch bus mode
        if (compData.internalState._outputValue !== undefined && comp._outputValue !== undefined) comp._outputValue = compData.internalState._outputValue;
      }
      // FIX: Restore output values (e.g., ToggleSwitch/DipSwitch positions)
      // so that switch states are preserved after save/load.
      // For bus ports (width > 1), convert numeric values back to Value objects.
      if (compData.outputs) {
        for (let i = 0; i < compData.outputs.length && i < comp.outputs.length; i++) {
          const outData = compData.outputs[i];
          const port = comp.outputs[i];
          if (port.width > 1 && typeof outData.value === 'number') {
            // Restore bus Value from serialized number
            port.value = Value.createKnown(port.width, outData.value);
          } else {
            port.value = outData.value;
          }
          if (outData.width && outData.width > 1) {
            port.width = outData.width;
          }
        }
      }
      circuit.addComponent(comp);
    }
    for (const w of data.wires) {
      // Validate that both endpoints reference existing components
      // to prevent dangling wire references from corrupted save data
      if (!w.from || !w.to || !w.from.componentId || !w.to.componentId) {
        console.warn('Circuit.fromJSON: Skipping wire with missing endpoint data:', w.id);
        continue;
      }
      if (!circuit.components.has(w.from.componentId) || !circuit.components.has(w.to.componentId)) {
        console.warn(`Circuit.fromJSON: Skipping wire ${w.id} — component not found (from=${w.from.componentId}, to=${w.to.componentId})`);
        continue;
      }
      circuit.addWire(w);
    }
    return circuit;
  }
}
