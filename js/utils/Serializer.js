import { Circuit } from '../core/Circuit.js';
import { resetIdCounter } from './IdGenerator.js';

export class Serializer {
  /**
   * Export the state of the engine as a plain object.
   * @param {Engine} engine
   * @returns {Object}
   */
  static exportState(engine) {
    const circuitData = engine.circuit.toJSON();
    return {
      components: circuitData.components,
      wires: circuitData.wires,
      speed: engine.speed
    };
  }

  /**
   * Import the state into the engine, canvas, and factory.
   * @param {Object} data
   * @param {Engine} engine
   * @param {Canvas} canvas
   * @param {ComponentFactory} factory
   */
  static importState(data, engine, canvas, factory) {
    engine.stop();

    // Build a new Circuit from the data
    const circuit = Circuit.fromJSON(data, factory);

    // Clear canvas visuals first
    canvas.clearAll();

    // Load the circuit into the engine (replaces internal state)
    engine.loadCircuit(circuit);

    // FIX (from critical): Restore connectedTo on component inputs from wire data.
    for (const wire of engine.wires) {
      const toComp = engine.components.get(wire.to.componentId);
      if (toComp) {
        const input = toComp.inputs.find(inp => inp.id === wire.to.nodeId);
        if (input) {
          input.connectedTo = { componentId: wire.from.componentId, nodeId: wire.from.nodeId };
        }
      }
    }

    // Restore output values for I/O components
    for (const comp of engine.components.values()) {
      if (typeof comp._updateAppearance === 'function') comp._updateAppearance();
      if (typeof comp._updateDisplay === 'function') comp._updateDisplay();
      if (typeof comp._updateConnectorStates === 'function') comp._updateConnectorStates();
    }

    // Restore simulation speed
    if (data.speed) engine.setSpeed(data.speed);

    // HP-3 FIX: Pass the loaded components map to resetIdCounter so it
    // can scan existing IDs and set the counter ABOVE the highest found.
    // Previously, resetIdCounter() simply set counter=1, which caused
    // ID collisions when the next generated ID matched an imported one.
    resetIdCounter(engine.components);

    // Re-render all components on canvas
    for (const comp of engine.components.values()) {
      canvas.addComponent(comp);
    }

    // Add visual wires (re-created from engine's wires)
    for (const wire of engine.wires) {
      canvas._addVisualWire(wire.id, wire.from.nodeId, wire.to.nodeId);
    }

    // Final evaluation
    engine.reset();
    engine.step();
    if (engine.onUpdate) engine.onUpdate();
  }
}
