import { Circuit } from '../core/Circuit.js';
import { resetIdCounter } from './IdGenerator.js';

export class Serializer {
  /**
   * Export the state of the engine as a plain object.
   * @param {Engine} engine
   * @returns {Object}
   */
  static exportState(engine) {
    // Use engine's circuit to produce JSON
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

    // FIX BUG #2: Restore connectedTo on component inputs from wire data.
    // After Circuit.fromJSON + engine.loadCircuit, the wires array is
    // populated but each component input's `connectedTo` field is still
    // null. Without this, reconnecting to an already-loaded input fails
    // to detect the existing wire (toInput.connectedTo is null), causing
    // duplicate connections and data corruption.
    for (const wire of engine.wires) {
      const toComp = engine.components.get(wire.to.componentId);
      if (toComp) {
        const input = toComp.inputs.find(inp => inp.id === wire.to.nodeId);
        if (input) {
          input.connectedTo = { componentId: wire.from.componentId, nodeId: wire.from.nodeId };
        }
      }
    }

    // Restore output values for I/O components (switches, clocks) – they are already in place, but visual update needed.
    for (const comp of engine.components.values()) {
      if (typeof comp._updateAppearance === 'function') comp._updateAppearance();
      if (typeof comp._updateDisplay === 'function') comp._updateDisplay();
      if (typeof comp._updateConnectorStates === 'function') comp._updateConnectorStates();
    }

    // Restore simulation speed
    if (data.speed) engine.setSpeed(data.speed);

    // Avoid future ID clashes
    resetIdCounter();

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
