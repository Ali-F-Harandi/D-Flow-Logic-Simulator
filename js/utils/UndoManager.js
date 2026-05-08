export class UndoManager {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
  }

  execute(command) {
    const success = command.execute();
    if (success) {
      this.undoStack.push(command);
      this.redoStack = [];
    }
    return success;
  }

  undo() {
    const cmd = this.undoStack.pop();
    if (cmd) {
      cmd.undo();
      this.redoStack.push(cmd);
    }
  }

  redo() {
    const cmd = this.redoStack.pop();
    if (cmd) {
      cmd.execute();
      this.undoStack.push(cmd);
    }
  }
}

// Command for adding a component
export class AddComponentCommand {
  constructor(engine, canvas, component) {
    this.engine = engine;
    this.canvas = canvas;
    this.component = component;
  }
  execute() {
    this.engine.addComponent(this.component);
    this.canvas.addComponent(this.component);
    return true;
  }
  undo() {
    // Also remove visual wires connected to this component
    const relatedWires = this.engine.wires.filter(w =>
      w.from.componentId === this.component.id || w.to.componentId === this.component.id
    );
    for (const w of relatedWires) {
      this.canvas._removeVisualWireByEngineId(w.id);
    }
    this.canvas._deleteComponent(this.component.id, { skipEngine: true });
    this.engine.removeComponent(this.component.id);
  }
}

// Command for deleting a component
export class DeleteComponentCommand {
  constructor(engine, canvas, component) {
    this.engine = engine;
    this.canvas = canvas;
    this.component = component;
    this.savedWires = [];
  }
  execute() {
    // Save wire data for undo before removing anything
    const relatedWires = this.engine.wires.filter(w =>
      w.from.componentId === this.component.id || w.to.componentId === this.component.id
    );
    this.savedWires = relatedWires.map(w => ({
      wireId: w.id,
      fromNodeId: w.from.nodeId,
      toNodeId: w.to.nodeId
    }));
    // Remove visual wires BEFORE deleting the component
    for (const w of relatedWires) {
      this.canvas._removeVisualWireByEngineId(w.id);
    }
    // FIX (Bug #2 High): Explicitly remove from engine – the command is the
    // sole authority for state changes. CanvasComponentManager._deleteComponent
    // should only handle DOM removal (see Bug #3 fix).
    this.engine.removeComponent(this.component.id);
    this.canvas._deleteComponent(this.component.id, { skipEngine: true });
    return true;
  }
  undo() {
    this.engine.addComponent(this.component);
    this.canvas.addComponent(this.component);
    this.savedWires.forEach(w => {
      const engineId = this.engine.connect(w.fromNodeId, w.toNodeId, w.wireId);
      this.canvas._reconnectWire(engineId, w.fromNodeId, w.toNodeId);
    });
  }
}

// Command for wiring (now returns success)
export class ConnectWireCommand {
  constructor(engine, canvas, fromNodeId, toNodeId) {
    this.engine = engine;
    this.canvas = canvas;
    this.fromNodeId = fromNodeId;
    this.toNodeId = toNodeId;
    this.engineWireId = null;
  }
  execute() {
    this.engineWireId = this.engine.connect(this.fromNodeId, this.toNodeId);
    if (this.engineWireId) {
      this.canvas._addVisualWire(this.engineWireId, this.fromNodeId, this.toNodeId);
      return true;
    }
    return false;
  }
  undo() {
    if (this.engineWireId) {
      this.engine.disconnect(this.engineWireId);
      this.canvas._removeVisualWireByEngineId(this.engineWireId);
    }
  }
}

// Command for disconnecting
export class DisconnectWireCommand {
  constructor(engine, canvas, wireId) {
    this.engine = engine;
    this.canvas = canvas;
    this.wireId = wireId;
    this.wireData = null;
  }
  execute() {
    const wire = this.engine.wires.find(w => w.id === this.wireId);
    if (wire) {
      this.wireData = {
        fromNodeId: wire.from.nodeId,
        toNodeId: wire.to.nodeId
      };
    }
    this.engine.disconnect(this.wireId);
    this.canvas._removeVisualWireByEngineId(this.wireId);
    return true;
  }
  undo() {
    if (this.wireData) {
      const engineId = this.engine.connect(this.wireData.fromNodeId, this.wireData.toNodeId, this.wireId);
      this.canvas._reconnectWire(engineId, this.wireData.fromNodeId, this.wireData.toNodeId);
    }
  }
}
