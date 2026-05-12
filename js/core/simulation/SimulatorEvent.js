/**
 * SimulatorEvent.js — A timestamped event in the simulation event queue.
 *
 * Inspired by Logisim-Evolution's Propagator.SimulatorEvent.
 * Each event represents a value change at a specific node (location)
 * at a specific simulation time. Events are ordered by (time, serialNumber)
 * for deterministic processing.
 *
 * Key concepts from Logisim:
 *   - Events carry a delay (gate delay) so components can have
 *     different propagation delays.
 *   - The serialNumber breaks ties for events at the same time,
 *     ensuring FIFO ordering within a time step.
 *   - The "cause" is the component that produced the value change,
 *     used for debugging and oscillation detection.
 */
export class SimulatorEvent {
  /**
   * @param {number} time - Simulation time when this event fires
   * @param {number} serialNumber - Breaks ties for same-time events
   * @param {string} nodeId - The output node ID where value is emitted
   * @param {string} componentId - The component emitting the value
   * @param {import('./Value.js').Value} value - The value being emitted
   */
  constructor(time, serialNumber, nodeId, componentId, value) {
    this.time = time;
    this.serialNumber = serialNumber;
    this.nodeId = nodeId;
    this.componentId = componentId;
    this.value = value;
  }

  /**
   * Compare two events for priority queue ordering.
   * Lower time comes first; for equal times, lower serialNumber comes first.
   * @param {SimulatorEvent} other
   * @returns {number} Negative if this < other
   */
  compareTo(other) {
    if (this.time !== other.time) return this.time - other.time;
    return this.serialNumber - other.serialNumber;
  }

  toString() {
    return `SimEvent(t=${this.time}, node=${this.nodeId}, val=${this.value}, comp=${this.componentId})`;
  }
}
