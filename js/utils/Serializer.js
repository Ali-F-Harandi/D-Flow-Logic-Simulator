export class Serializer {
  /**
   * Export the state of the engine and its components as a plain object.
   * @param {Engine} engine
   * @returns {Object}
   */
  static exportState(engine) {
    const components = [];
    for (const comp of engine.components.values()) {
      const inputStates = comp.inputs.map(inp => ({
        nodeId: inp.id,
        connectedTo: inp.connectedTo ? { componentId: inp.connectedTo.componentId, nodeId: inp.connectedTo.nodeId } : null
      }));
      const outputStates = comp.outputs.map(o => ({ nodeId: o.id, value: o.value }));
      components.push({
        id: comp.id,
        type: comp.type,
        position: { x: comp.position.x, y: comp.position.y },
        properties: comp.getProperties().reduce((acc, prop) => {
          acc[prop.name] = prop.value;
          return acc;
        }, {}),
        inputs: inputStates,
        outputs: outputStates
      });
    }
    const wires = engine.wires.map(w => ({
      id: w.id,
      from: w.from,
      to: w.to
    }));
    return { components, wires, speed: engine.speed };
  }

  /**
   * Import the state into the engine, canvas, and factory.
   * Clears any existing circuit first (both engine AND canvas visuals).
   * @param {Object} data - The exported state.
   * @param {Engine} engine
   * @param {Canvas} canvas
   * @param {ComponentFactory} factory
   */
  static importState(data, engine, canvas, factory) {
    // Stop simulation
    engine.stop();

    // Deep clone to avoid mutation
    const componentsData = JSON.parse(JSON.stringify(data.components));
    const wiresData = JSON.parse(JSON.stringify(data.wires));

    // FIX: Clear canvas visual elements FIRST (before engine removes components)
    canvas.clearAll();

    // Remove all existing components from engine (this will also remove wires)
    const existingIds = Array.from(engine.components.keys());
    existingIds.forEach(id => engine.removeComponent(id));

    // Create and place components
    for (const compData of componentsData) {
      const comp = factory.createComponent(compData.type, compData.id);
      comp.position.x = compData.position.x;
      comp.position.y = compData.position.y;
      // Apply properties
      const props = comp.getProperties();
      if (props) {
        props.forEach(prop => {
          if (compData.properties.hasOwnProperty(prop.name)) {
            comp.setProperty(prop.name, compData.properties[prop.name]);
          }
        });
      }
      engine.addComponent(comp);
      canvas.addComponent(comp);
    }

    // Restore connections
    for (const wire of wiresData) {
      engine.connect(wire.from.nodeId, wire.to.nodeId, wire.id);
      canvas._addVisualWire(wire.id, wire.from.nodeId, wire.to.nodeId);
    }

    // Restore simulation speed
    if (data.speed) engine.setSpeed(data.speed);

    // Re-evaluate everything
    engine.reset();
    engine.step();
    if (engine.onUpdate) engine.onUpdate();
  }
}
