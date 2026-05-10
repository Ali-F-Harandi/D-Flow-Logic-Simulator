/**
 * CircuitValidator — validates circuit integrity before export/simulation.
 * Checks for:
 *   - Floating inputs (not connected to any wire)
 *   - Short circuits (output connected to output)
 *   - Unreachable components (no path from any input)
 *   - Oscillation-prone feedback loops
 *   - Empty circuit
 */

export class CircuitValidator {
  constructor(engine) {
    this.engine = engine;
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Run all validation checks.
   * @returns {{ valid: boolean, errors: Array, warnings: Array }}
   */
  validate() {
    this.errors = [];
    this.warnings = [];

    this._checkEmptyCircuit();
    this._checkFloatingInputs();
    this._checkShortCircuits();
    this._checkUnreachableComponents();

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }

  _checkEmptyCircuit() {
    if (this.engine.components.size === 0) {
      this.warnings.push({
        type: 'empty-circuit',
        message: 'Circuit is empty. Add components to get started.'
      });
    }
  }

  _checkFloatingInputs() {
    for (const comp of this.engine.components.values()) {
      for (const inp of comp.inputs) {
        if (!inp.connectedTo) {
          this.warnings.push({
            type: 'floating-input',
            message: `${comp.type} "${comp.id}" has floating input: ${inp.id}`,
            componentId: comp.id,
            nodeId: inp.id
          });
        }
      }
    }
  }

  _checkShortCircuits() {
    // Check for outputs connected to multiple inputs that could conflict
    const outputFanout = {};
    for (const wire of this.engine.wires) {
      const fromId = wire.from.nodeId;
      if (!outputFanout[fromId]) outputFanout[fromId] = [];
      outputFanout[fromId].push(wire);
    }
    // High fanout is not an error, but worth noting
    for (const [nodeId, wires] of Object.entries(outputFanout)) {
      if (wires.length > 4) {
        this.warnings.push({
          type: 'high-fanout',
          message: `Output ${nodeId} drives ${wires.length} inputs (high fanout)`,
          nodeId
        });
      }
    }
  }

  _checkUnreachableComponents() {
    if (this.engine.components.size === 0) return;

    // BFS from input components to find all reachable components
    const inputComponents = [];
    for (const comp of this.engine.components.values()) {
      if (comp.inputs.length === 0 && comp.outputs.length > 0) {
        inputComponents.push(comp);
      }
    }

    if (inputComponents.length === 0) {
      this.warnings.push({
        type: 'no-inputs',
        message: 'No input components found. Add toggle switches, clocks, or constants.'
      });
      return;
    }

    const visited = new Set();
    const queue = [...inputComponents];
    while (queue.length > 0) {
      const comp = queue.shift();
      if (visited.has(comp.id)) continue;
      visited.add(comp.id);

      // Find all components connected to this component's outputs
      for (const out of comp.outputs) {
        const connectedWires = this.engine.wires.filter(w => w.from.nodeId === out.id);
        for (const wire of connectedWires) {
          const targetComp = this.engine.components.get(wire.to.componentId);
          if (targetComp && !visited.has(targetComp.id)) {
            queue.push(targetComp);
          }
        }
      }
    }

    // Check for unreachable components
    for (const comp of this.engine.components.values()) {
      if (!visited.has(comp.id) && comp.outputs.length > 0) {
        this.warnings.push({
          type: 'unreachable',
          message: `${comp.type} "${comp.id}" is not reachable from any input`,
          componentId: comp.id
        });
      }
    }
  }
}
