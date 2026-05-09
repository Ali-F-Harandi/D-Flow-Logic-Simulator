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
      const success = cmd.execute();
      if (success) {
        this.undoStack.push(cmd);
      }
      // If redo fails, the command is discarded — correct behavior
      // since the state it was supposed to produce didn't happen.
    }
  }
}

// Command for adding a component
export class AddComponentCommand {
  constructor(engine, canvas, component) {
    this.engine = engine;
    this.canvas = canvas;
    this.component = component;
    this.savedWires = [];
  }
  execute() {
    this.engine.addComponent(this.component);
    this.canvas.addComponent(this.component);
    // Restore wires that were saved from a previous undo
    if (this.savedWires.length > 0) {
      this.savedWires.forEach(w => {
        const engineId = this.engine.connect(w.fromNodeId, w.toNodeId, w.wireId);
        this.canvas._reconnectWire(engineId, w.fromNodeId, w.toNodeId);
      });
    }
    return true;
  }
  undo() {
    // Save wire data before removing so redo can restore them
    const relatedWires = this.engine.wires.filter(w =>
      w.from.componentId === this.component.id || w.to.componentId === this.component.id
    );
    this.savedWires = relatedWires.map(w => ({
      wireId: w.id,
      fromNodeId: w.from.nodeId,
      toNodeId: w.to.nodeId
    }));
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

/**
 * Command for moving a wire control point (undo/redo support).
 */
export class MoveWirePointCommand {
  constructor(wiring, wireId, pointIndex, oldPos, newPos) {
    this.wiring = wiring;
    this.wireId = wireId;
    this.pointIndex = pointIndex;
    this.oldPos = { ...oldPos };
    this.newPos = { ...newPos };
  }

  execute() {
    const wire = this.wiring.wires.find(w => w.id === this.wireId);
    if (wire) {
      wire.moveControlPoint(this.pointIndex, this.newPos, false);
      wire.refreshControlHandles();
    }
  }

  undo() {
    const wire = this.wiring.wires.find(w => w.id === this.wireId);
    if (wire) {
      wire.moveControlPoint(this.pointIndex, this.oldPos, false);
      wire.refreshControlHandles();
    }
  }
}
