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
      
      // Capture internal state for flip-flops and shift registers
      let internalState = {};
      if (comp._state !== undefined) {
        internalState._state = Array.isArray(comp._state) ? [...comp._state] : { ...comp._state };
      }
      if (comp._prevClk !== undefined) {
        internalState._prevClk = comp._prevClk;
      }
      if (comp.frequency !== undefined) {
        internalState.frequency = comp.frequency;
      }
      
      components.push({
        id: comp.id,
        type: comp.type,
        position: { x: comp.position.x, y: comp.position.y },
        properties: comp.getProperties().reduce((acc, prop) => {
          acc[prop.name] = prop.value;
          return acc;
        }, {}),
        inputs: inputStates,
        outputs: outputStates,
        internalState: Object.keys(internalState).length > 0 ? internalState : undefined
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

    // Clear canvas visual elements FIRST (before engine removes components)
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
          if (compData.properties && compData.properties.hasOwnProperty(prop.name)) {
            comp.setProperty(prop.name, compData.properties[prop.name]);
          }
        });
      }
      // Restore internal state
      if (compData.internalState) {
        if (compData.internalState._state !== undefined) {
          comp._state = Array.isArray(compData.internalState._state)
            ? [...compData.internalState._state]
            : { ...compData.internalState._state };
        }
        if (compData.internalState._prevClk !== undefined) {
          comp._prevClk = compData.internalState._prevClk;
        }
        if (compData.internalState.frequency !== undefined && comp.setFrequency) {
          comp.setFrequency(compData.internalState.frequency);
        }
      }
      engine.addComponent(comp);
      canvas.addComponent(comp);
    }

    // Restore connections
    for (const wire of wiresData) {
      const engineId = engine.connect(wire.from.nodeId, wire.to.nodeId, wire.id);
      if (engineId) {
        canvas._addVisualWire(engineId, wire.from.nodeId, wire.to.nodeId);
      }
    }

    // Restore output values for I/O components (switches, clocks)
    for (const compData of componentsData) {
      if (compData.outputs) {
        const comp = engine.components.get(compData.id);
        if (comp) {
          compData.outputs.forEach((outData, idx) => {
            if (comp.outputs[idx]) {
              comp.outputs[idx].value = outData.value;
            }
          });
          // Update visual state for I/O components
          if (typeof comp._updateAppearance === 'function') comp._updateAppearance();
          if (typeof comp._updateDisplay === 'function') comp._updateDisplay();
          if (typeof comp._updateConnectorStates === 'function') comp._updateConnectorStates();
        }
      }
    }

    // Restore simulation speed
    if (data.speed) engine.setSpeed(data.speed);

    // Re-evaluate everything
    engine.reset();
    engine.step();
    if (engine.onUpdate) engine.onUpdate();
  }
}
