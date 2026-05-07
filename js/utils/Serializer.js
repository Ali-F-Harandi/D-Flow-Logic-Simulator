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