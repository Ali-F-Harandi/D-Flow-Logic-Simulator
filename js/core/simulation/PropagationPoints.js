/**
 * PropagationPoints.js — Tracks which points changed during propagation.
 *
 * Inspired by Logisim-Evolution's PropagationPoints class.
 * Used for:
 *   1. Oscillation detection visualization (highlighting oscillating nodes)
 *   2. Single-step mode display (showing which signals just changed)
 *   3. Debugging (identifying which components caused oscillation)
 *
 * In Logisim, this is used both for drawing oscillating points on the
 * canvas and for displaying the single-step message.
 */
export class PropagationPoints {
  constructor() {
    /** @type {Set<string>} Node IDs that changed */
    this.changedNodes = new Set();
    /** @type {Set<string>} Component IDs whose inputs changed */
    this.pendingInputs = new Set();
  }

  /**
   * Record that a node changed value during propagation.
   * @param {string} nodeId
   */
  addNode(nodeId) {
    this.changedNodes.add(nodeId);
  }

  /**
   * Record that a component has pending input changes.
   * @param {string} componentId
   */
  addPendingInput(componentId) {
    this.pendingInputs.add(componentId);
  }

  /**
   * Clear all tracked points.
   */
  clear() {
    this.changedNodes.clear();
    this.pendingInputs.clear();
  }

  /**
   * Check if any points are tracked.
   * @returns {boolean}
   */
  isEmpty() {
    return this.changedNodes.size === 0 && this.pendingInputs.size === 0;
  }

  /**
   * Get a human-readable summary for single-step display.
   * @returns {string}
   */
  getSingleStepMessage() {
    const signals = this.changedNodes.size === 0 ? 'no' : String(this.changedNodes.size);
    const inputs = this.pendingInputs.size === 0 ? 'no' : String(this.pendingInputs.size);
    return `${signals} signal(s) changed, ${inputs} input(s) pending`;
  }

  /**
   * Get all changed node IDs.
   * @returns {string[]}
   */
  getChangedNodes() {
    return [...this.changedNodes];
  }

  /**
   * Get all pending input component IDs.
   * @returns {string[]}
   */
  getPendingInputs() {
    return [...this.pendingInputs];
  }
}
