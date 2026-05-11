import { GRID_SIZE } from '../config.js';

export class ComponentLayoutPolicy {
  static GRID = GRID_SIZE; // 20px

  /**
   * Compute standardized dimensions for a component.
   * All widths are multiples of 4*GRID_SIZE, all heights are multiples of GRID_SIZE.
   */
  static computeDimensions(inputCount, outputCount, type) {
    // Special cases for specific component types
    if (type === 'SevenSegment') {
      return { width: 5 * this.GRID, height: 6 * this.GRID, rows: 6 };
    }
    if (type === 'Multiplexer') {
      return { width: 6 * this.GRID, height: Math.max(inputCount, outputCount, 3) * this.GRID, rows: Math.max(inputCount, outputCount, 3) };
    }
    if (['SRFlipFlop', 'DFlipFlop', 'JKFlipFlop', 'TFlipFlop', 'SRLatch'].includes(type)) {
      return { width: 4 * this.GRID, height: 4 * this.GRID, rows: 4 };
    }
    if (type === 'ShiftRegister') {
      const bits = Math.max(2, Math.min(8, outputCount || 2));
      return { width: 4 * this.GRID, height: Math.max(bits + 1, 3) * this.GRID, rows: Math.max(bits + 1, 3) };
    }

    // Standard components (gates, IO, chips)
    const rows = Math.max(inputCount + 1, outputCount + 1, 3);
    const width = 4 * this.GRID; // Always 80px
    const height = rows * this.GRID;
    return { width, height, rows };
  }

  /**
   * Get the Y position for an input connector, grid-aligned.
   */
  static getInputY(index, inputCount, height) {
    if (inputCount === 0) return 0;
    const spacing = height / (inputCount + 1);
    return Math.round(spacing * (index + 1) / this.GRID) * this.GRID;
  }

  /**
   * Get the Y position for an output connector, grid-aligned.
   */
  static getOutputY(index, outputCount, height) {
    if (outputCount === 0) return 0;
    const spacing = height / (outputCount + 1);
    return Math.round(spacing * (index + 1) / this.GRID) * this.GRID;
  }

  /**
   * Get component center offset for drop centering.
   */
  static getCenterOffset(type, inputCount, outputCount) {
    const { width, height } = this.computeDimensions(inputCount, outputCount, type);
    return { x: width / 2, y: height / 2 };
  }

  /* ================================================================
   *  Feature 1: Facing-Aware Connector Positions
   * ================================================================ */

  /**
   * Get the world position of an input connector for a component,
   * adjusted for the component's facing direction.
   *
   * @param {Component} comp
   * @param {number} inputIndex
   * @returns {{ x: number, y: number }}
   */
  static getInputPosition(comp, inputIndex) {
    const dims = this.computeDimensions(comp.inputs.length, comp.outputs.length, comp.type);
    const localY = this.getInputY(inputIndex, comp.inputs.length, dims.height);
    // Input connectors are offset 1 grid size to the left of the component body
    return this._localToWorld(comp, -this.GRID, localY);
  }

  /**
   * Get the world position of an output connector for a component,
   * adjusted for the component's facing direction.
   *
   * @param {Component} comp
   * @param {number} outputIndex
   * @returns {{ x: number, y: number }}
   */
  static getOutputPosition(comp, outputIndex) {
    const dims = this.computeDimensions(comp.inputs.length, comp.outputs.length, comp.type);
    const localY = this.getOutputY(outputIndex, comp.outputs.length, dims.height);
    // Output connectors are offset 1 grid size to the right of the component body
    return this._localToWorld(comp, dims.width + this.GRID, localY);
  }

  /**
   * Convert a local (un-rotated) coordinate to world coordinates
   * by applying rotation around the component center.
   *
   * @param {Component} comp
   * @param {number} localX — x relative to component top-left (un-rotated)
   * @param {number} localY — y relative to component top-left (un-rotated)
   * @returns {{ x: number, y: number }}
   */
  static _localToWorld(comp, localX, localY) {
    const dims = this.computeDimensions(comp.inputs.length, comp.outputs.length, comp.type);
    const cx = dims.width / 2;
    const cy = dims.height / 2;

    // Translate so center is at origin
    let dx = localX - cx;
    let dy = localY - cy;

    // Apply rotation based on facing
    const angle = this._facingToRadians(comp.facing);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;

    // Apply mirror if needed (scaleX(-1) around center)
    const mx = comp.mirrored ? -rx : rx;

    return {
      x: comp.position.x + cx + mx,
      y: comp.position.y + cy + ry
    };
  }

  /**
   * Get the port direction vector for a node, considering the component's facing.
   * Output pins exit right (east), input pins arrive from left (west) by default.
   * These rotate with the component's facing direction.
   *
   * @param {Component} comp
   * @param {string} nodeId
   * @returns {{ x: number, y: number }}
   */
  static getPortDirectionForNode(comp, nodeId) {
    const isOutput = nodeId.includes('.output.');
    // Base direction: output → right, input → left
    let dx = isOutput ? 1 : -1;
    let dy = 0;

    // Apply mirror (flip horizontal direction)
    if (comp.mirrored) dx = -dx;

    // Apply rotation
    const angle = this._facingToRadians(comp.facing);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos
    };
  }

  /**
   * Convert facing direction to radians.
   */
  static _facingToRadians(facing) {
    const map = { east: 0, south: Math.PI / 2, west: Math.PI, north: -Math.PI / 2 };
    return map[facing] || 0;
  }
}
