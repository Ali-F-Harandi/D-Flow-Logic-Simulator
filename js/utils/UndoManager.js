export class UndoManager {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
  }

  execute(command) {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];
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
  }
  undo() {
    this.canvas._deleteComponent(this.component.id);
    this.engine.removeComponent(this.component.id);
  }
}

// Command for deleting a component (saves wires to reconnect on undo)
export class DeleteComponentCommand {
  constructor(engine, canvas, component) {
    this.engine = engine;
    this.canvas = canvas;
    this.component = component;
    this.savedWires = []; // each: { wireId, fromNodeId, toNodeId }
  }
  execute() {
    // Save wires to restore later
    const relatedWires = this.engine.wires.filter(w =>
      w.from.componentId === this.component.id || w.to.componentId === this.component.id
    );
    this.savedWires = relatedWires.map(w => ({
      wireId: w.id,              // store original ID
      fromNodeId: w.from.nodeId,
      toNodeId: w.to.nodeId
    }));
    this.canvas._deleteComponent(this.component.id);
  }
  undo() {
    // Re-add component
    this.engine.addComponent(this.component);
    this.canvas.addComponent(this.component);
    // Re-connect wires with original IDs
    this.savedWires.forEach(w => {
      const engineId = this.engine.connect(w.fromNodeId, w.toNodeId, w.wireId);
      this.canvas._reconnectWire(engineId, w.fromNodeId, w.toNodeId);
    });
  }
}

// Command for wiring
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
    this.canvas._addVisualWire(this.engineWireId, this.fromNodeId, this.toNodeId);
  }
  undo() {
    // Disconnect and remove visual
    this.engine.disconnect(this.engineWireId);
    this.canvas._removeVisualWireByEngineId(this.engineWireId);
  }
}

// Command for disconnecting
export class DisconnectWireCommand {
  constructor(engine, canvas, wireId) {
    this.engine = engine;
    this.canvas = canvas;
    this.wireId = wireId; // engine wire ID
    this.wireData = null; // stored for undo
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
  }
  undo() {
    if (this.wireData) {
      // Reconnect with original ID (it was saved as engine wire ID)
      const engineId = this.engine.connect(this.wireData.fromNodeId, this.wireData.toNodeId, this.wireId);
      this.canvas._reconnectWire(engineId, this.wireData.fromNodeId, this.wireData.toNodeId);
    }
  }
}