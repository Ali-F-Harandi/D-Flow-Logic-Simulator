export class UndoManager {
  constructor(maxStackSize = 100) {
    this.undoStack = [];
    this.redoStack = [];
    this.maxStackSize = maxStackSize;
  }

  execute(command) {
    const success = command.execute();
    if (success) {
      this.undoStack.push(command);
      // Limit stack size to prevent unbounded memory growth
      if (this.undoStack.length > this.maxStackSize) {
        this.undoStack.shift();
      }
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

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }
}

/**
 * CompositeCommand — groups multiple commands into a single undo/redo unit.
 * Undo is applied in reverse order.
 */
export class CompositeCommand {
  constructor(commands = []) {
    this.commands = commands;
  }
  execute() {
    let success = false;
    for (const cmd of this.commands) {
      if (cmd.execute()) success = true;
    }
    return success;
  }
  undo() {
    // Reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
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

/**
 * Command for moving a component (undo/redo support).
 */
export class MoveComponentCommand {
  constructor(engine, canvas, compManager, wiring, positionCache, componentId, oldPos, newPos) {
    this.engine = engine;
    this.canvas = canvas;
    this.compManager = compManager;
    this.wiring = wiring;
    this.positionCache = positionCache;
    this.componentId = componentId;
    this.oldPos = { ...oldPos };
    this.newPos = { ...newPos };
  }
  execute() {
    const comp = this.compManager.getComponentById(this.componentId);
    if (comp) {
      comp.updatePosition(this.newPos.x, this.newPos.y);
      this.wiring.updateWiresForComponent(comp);
      this.positionCache.invalidate();
      return true;
    }
    return false;
  }
  undo() {
    const comp = this.compManager.getComponentById(this.componentId);
    if (comp) {
      comp.updatePosition(this.oldPos.x, this.oldPos.y);
      this.wiring.updateWiresForComponent(comp);
      this.positionCache.invalidate();
      return true;
    }
    return false;
  }
}

/**
 * Command for adding a wire control point (undo/redo support).
 */
export class AddWirePointCommand {
  constructor(wiring, wireId, index, point) {
    this.wiring = wiring;
    this.wireId = wireId;
    this.index = index;
    this.point = { ...point };
  }
  execute() {
    const wire = this.wiring.wires.find(w => w.id === this.wireId);
    if (wire) {
      wire.addControlPoint(this.index, this.point);
      wire.refreshControlHandles();
      return true;
    }
    return false;
  }
  undo() {
    const wire = this.wiring.wires.find(w => w.id === this.wireId);
    if (wire) {
      wire.removeControlPoint(this.index);
      wire.refreshControlHandles();
      return true;
    }
    return false;
  }
}

/**
 * Command for removing a wire control point / waypoint (undo/redo support).
 * index is in pathPoints terms (1 = first waypoint, etc.)
 */
export class RemoveWirePointCommand {
  constructor(wiring, wireId, index) {
    this.wiring = wiring;
    this.wireId = wireId;
    this.index = index;  // pathPoints index
    this.savedPoint = null;
  }
  execute() {
    const wire = this.wiring.wires.find(w => w.id === this.wireId);
    if (wire) {
      const wpIndex = this.index - 1;  // Convert pathPoints index to waypoints index
      if (wpIndex >= 0 && wpIndex < wire.waypoints.length) {
        this.savedPoint = { ...wire.waypoints[wpIndex] };
        wire.removeControlPoint(wpIndex);
        wire.refreshControlHandles();
        return true;
      }
    }
    return false;
  }
  undo() {
    const wire = this.wiring.wires.find(w => w.id === this.wireId);
    if (wire && this.savedPoint) {
      const wpIndex = this.index - 1;  // Convert back to waypoints index
      wire.addControlPoint(wpIndex, this.savedPoint);
      wire.refreshControlHandles();
      return true;
    }
    return false;
  }
}

/**
 * Command for setting a component property (undo/redo support).
 * Saves wires that will be disconnected when reducing input count,
 * and restores them on undo.
 */
export class SetPropertyCommand {
  constructor(engine, canvas, component, propName, oldValue, newValue) {
    this.engine = engine;
    this.canvas = canvas;
    this.component = component;
    this.propName = propName;
    this.oldValue = oldValue;
    this.newValue = newValue;
    this.savedWires = [];
  }
  execute() {
    // Properties that cause wire disconnection — save ALL wires before executing
    const wireDisconnectingProps = new Set([
      'inputs', 'bitWidth', 'bits', 'switches', 'busOutput', 'grouping',
      'busInput', 'busOutput', 'inputWidth', 'outputWidth'
    ]);
    if (wireDisconnectingProps.has(this.propName)) {
      // Save all wires connected to this component before the property change
      const relatedWires = this.engine.wires.filter(w =>
        w.from.componentId === this.component.id || w.to.componentId === this.component.id
      );
      this.savedWires = relatedWires.map(w => ({
        wireId: w.id, fromNodeId: w.from.nodeId, toNodeId: w.to.nodeId
      }));
    }
    this.component.setProperty(this.propName, this.newValue);
    this.canvas._onComponentModified(this.component);
    return true;
  }
  undo() {
    this.component.setProperty(this.propName, this.oldValue);
    this.canvas._onComponentModified(this.component);
    // Restore saved wires
    for (const w of this.savedWires) {
      const engineId = this.engine.connect(w.fromNodeId, w.toNodeId, w.wireId);
      this.canvas._reconnectWire(engineId, w.fromNodeId, w.toNodeId);
    }
    this.savedWires = [];
    return true;
  }
}

/**
 * Command for changing a wire's routing mode (undo/redo support).
 */
export class SetRoutingModeCommand {
  constructor(wiring, wireId, oldMode, oldControlPoints, newMode, newControlPoints) {
    this.wiring = wiring;
    this.wireId = wireId;
    this.oldMode = oldMode;
    this.oldControlPoints = oldControlPoints ? oldControlPoints.map(p => ({...p})) : [];
    this.newMode = newMode;
    this.newControlPoints = newControlPoints ? newControlPoints.map(p => ({...p})) : [];
  }
  execute() {
    const wire = this.wiring.wires.find(w => w.id === this.wireId);
    if (wire) {
      wire.routingMode = this.newMode;
      wire.controlPoints = this.newControlPoints.map(p => ({...p}));
      wire.pathPoints = []; // Force recompute
      this.wiring.rerouteWithFanOut();
      wire.refreshControlHandles();
      return true;
    }
    return false;
  }
  undo() {
    const wire = this.wiring.wires.find(w => w.id === this.wireId);
    if (wire) {
      wire.routingMode = this.oldMode;
      wire.controlPoints = this.oldControlPoints.map(p => ({...p}));
      wire.pathPoints = [];
      this.wiring.rerouteWithFanOut();
      wire.refreshControlHandles();
      return true;
    }
    return false;
  }
}
