/**
 * WireTracer.js — BFS Wire Net Tracing
 *
 * Traces all wires that are electrically connected (same net)
 * by following shared component nodes. When two wires share
 * the same node on a component, they are in the same net.
 *
 * Usage:
 *   const tracer = new WireTracer(wires, engine);
 *   const netIds = tracer.traceNet(startWireId);
 *   tracer.highlightNet(netIds);
 *   tracer.clearTrace();
 */

export class WireTracer {

  /**
   * @param {Array<Wire>} wires — the visual wire array from CanvasWiring
   * @param {Engine} engine — the simulation engine for node lookups
   */
  constructor(wires, engine) {
    this._wires = wires;
    this._engine = engine;
    this._tracedNetIds = [];
  }

  /**
   * BFS traversal to find all wires in the same electrical net.
   *
   * Two wires are in the same net if they share a node on a component:
   *   - Wire A's source → Component output → Wire B's source (fan-out)
   *   - Wire A's target → Component input  → Wire B's source (pass-through)
   *
   * @param {string} startWireId — the wire ID to start from
   * @returns {string[]} — array of wire IDs in the same net
   */
  traceNet(startWireId) {
    const visited = new Set();
    const queue = [startWireId];
    visited.add(startWireId);

    // Build a map: nodeId → [wireIds that touch this node]
    const nodeToWires = new Map();
    for (const wire of this._wires) {
      const sourceNode = wire.sourceNode.nodeId;
      const targetNode = wire.targetNode.nodeId;
      if (!nodeToWires.has(sourceNode)) nodeToWires.set(sourceNode, []);
      if (!nodeToWires.has(targetNode)) nodeToWires.set(targetNode, []);
      nodeToWires.get(sourceNode).push(wire.id);
      nodeToWires.get(targetNode).push(wire.id);
    }

    // Build a map: componentId → all nodeIds on that component
    // This lets us find all wires connected through a single component
    const compToNodes = new Map();
    if (this._engine) {
      for (const comp of this._engine.components.values()) {
        const nodeIds = [
          ...comp.inputs.map(i => i.id),
          ...comp.outputs.map(o => o.id)
        ];
        compToNodes.set(comp.id, nodeIds);
      }
    }

    // Build adjacency: nodeId → componentId
    const nodeToComp = new Map();
    if (this._engine) {
      for (const comp of this._engine.components.values()) {
        for (const inp of comp.inputs) {
          nodeToComp.set(inp.id, comp.id);
        }
        for (const out of comp.outputs) {
          nodeToComp.set(out.id, comp.id);
        }
      }
    }

    while (queue.length > 0) {
      const currentId = queue.shift();
      const currentWire = this._wires.find(w => w.id === currentId);
      if (!currentWire) continue;

      // Collect all nodes this wire touches
      const touchedNodes = [currentWire.sourceNode.nodeId, currentWire.targetNode.nodeId];

      // For each touched node, find the component and all its nodes,
      // then find all wires touching those component nodes
      const connectedWireIds = new Set();

      for (const nodeId of touchedNodes) {
        // Direct: wires sharing this exact node
        const directWires = nodeToWires.get(nodeId) || [];
        for (const wid of directWires) connectedWireIds.add(wid);

        // Indirect: wires sharing any node on the same component
        const compId = nodeToComp.get(nodeId);
        if (compId) {
          const compNodes = compToNodes.get(compId) || [];
          for (const cn of compNodes) {
            const compWires = nodeToWires.get(cn) || [];
            for (const wid of compWires) connectedWireIds.add(wid);
          }
        }
      }

      for (const wid of connectedWireIds) {
        if (!visited.has(wid)) {
          visited.add(wid);
          queue.push(wid);
        }
      }
    }

    return Array.from(visited);
  }

  /**
   * Highlight all wires in a net by setting their traced state.
   * @param {string[]} netWireIds — array of wire IDs to highlight
   */
  highlightNet(netWireIds) {
    this.clearTrace();
    this._tracedNetIds = netWireIds;
    for (const wid of netWireIds) {
      const wire = this._wires.find(w => w.id === wid);
      if (wire) wire.setTraced(true);
    }
  }

  /**
   * Remove the traced highlight from all wires in the current trace.
   */
  clearTrace() {
    for (const wid of this._tracedNetIds) {
      const wire = this._wires.find(w => w.id === wid);
      if (wire) wire.setTraced(false);
    }
    this._tracedNetIds = [];
  }

  /**
   * Check if any net is currently being traced.
   */
  get isTracing() {
    return this._tracedNetIds.length > 0;
  }
}
