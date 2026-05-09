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
}
