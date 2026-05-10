/**
 * OccupancyGrid.js — Grid-based obstacle map for A* wire routing
 *
 * Maintains a 2D grid where each cell can be:
 *   - FREE (0)              : available for routing
 *   - BLOCKED_COMPONENT (1) : occupied by a component body
 *   - BLOCKED_WIRE (2)      : occupied by an existing wire segment
 *   - BLOCKED_PIN (3)       : component pin (passable for matching wire)
 *
 * The grid resolution matches GRID_SIZE so that routing snaps naturally.
 * Provides O(1) lookup for any grid position.
 *
 * Performance optimizations:
 *   - Uses Uint8Array for compact storage (1 byte per cell)
 *   - Dirty-region tracking: only rebuild changed areas
 *   - Sparse blocked-cell set for fast iteration
 */

import { GRID_SIZE } from '../config.js';

// Cell type constants
export const CELL_FREE             = 0;
export const CELL_BLOCKED_COMP     = 1;
export const CELL_BLOCKED_WIRE     = 2;
export const CELL_PIN              = 3;

export class OccupancyGrid {

  /* ─── Constructor ─── */

  /**
   * @param {Object} [config]
   * @param {number} [config.gridSize]     - Grid cell size (default: GRID_SIZE)
   * @param {number} [config.worldWidth]   - World width in pixels (default: 20000)
   * @param {number} [config.worldHeight]  - World height in pixels (default: 20000)
   * @param {number} [config.wireMargin]   - Extra clearance around components (grid cells, default: 1)
   */
  constructor(config = {}) {
    this.gridSize    = config.gridSize    || GRID_SIZE;
    this.worldWidth  = config.worldWidth  || 20000;
    this.worldHeight = config.worldHeight || 20000;

    // Grid dimensions
    this.cols = Math.ceil(this.worldWidth  / this.gridSize);
    this.rows = Math.ceil(this.worldHeight / this.gridSize);

    // Flat array for grid data
    this.data = new Uint8Array(this.cols * this.rows);

    // Wire margin: how many extra grid cells to block around components
    this.wireMargin = config.wireMargin ?? 1;

    // Sparse set of blocked cells for fast iteration
    this._blockedCells = new Set();

    // Pin positions for passable routing endpoints
    this._pinPositions = new Map(); // "col,row" → nodeId

    // Version counter for cache invalidation
    this.version = 0;

    // Dirty region tracking
    this._dirtyMinCol = this.cols;
    this._dirtyMaxCol = 0;
    this._dirtyMinRow = this.rows;
    this._dirtyMaxRow = 0;
  }

  /* ─── Coordinate Conversion ─── */

  /** Convert pixel X to grid column */
  toCol(x) { return Math.floor(x / this.gridSize); }

  /** Convert pixel Y to grid row */
  toRow(y) { return Math.floor(y / this.gridSize); }

  /** Convert grid column to pixel X (left edge of cell) */
  toX(col) { return col * this.gridSize; }

  /** Convert grid row to pixel Y (top edge of cell) */
  toY(row) { return row * this.gridSize; }

  /** Snap pixel coordinate to grid center */
  snapToGrid(value) {
    return Math.round(value / this.gridSize) * this.gridSize;
  }

  /* ─── Cell Access ─── */

  /**
   * Get cell type at grid position.
   * @param {number} col
   * @param {number} row
   * @returns {number} Cell type constant
   */
  getCell(col, row) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      return CELL_BLOCKED_COMP; // Out of bounds = blocked
    }
    return this.data[row * this.cols + col];
  }

  /**
   * Set cell type at grid position.
   * @param {number} col
   * @param {number} row
   * @param {number} type - Cell type constant
   */
  setCell(col, row, type) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
    const idx = row * this.cols + col;
    const oldType = this.data[idx];
    this.data[idx] = type;

    // Update sparse set
    const key = `${col},${row}`;
    if (type === CELL_FREE) {
      this._blockedCells.delete(key);
      this._pinPositions.delete(key);
    } else {
      this._blockedCells.add(key);
      if (type === CELL_PIN) {
        // Pin registration handled separately
      }
    }

    // Track dirty region
    this._markDirty(col, row);
  }

  /**
   * Check if a cell is passable for routing.
   * Pins are passable if they match the source/target of the current route.
   * @param {number} col
   * @param {number} row
   * @param {Set<string>} [passablePins] - Set of "col,row" keys for pins that should be passable
   * @returns {boolean}
   */
  isPassable(col, row, passablePins = null) {
    const cell = this.getCell(col, row);
    if (cell === CELL_FREE) return true;
    if (cell === CELL_PIN && passablePins && passablePins.has(`${col},${row}`)) return true;
    if (cell === CELL_BLOCKED_WIRE) return true; // Wires are soft blocks (penalized, not impassable)
    return false;
  }

  /**
   * Get the routing cost for a cell.
   * Components are impassable, wires are penalized, free cells are base cost.
   * @param {number} col
   * @param {number} row
   * @param {Set<string>} [passablePins]
   * @returns {number} Cost (Infinity = impassable)
   */
  getCost(col, row, passablePins = null) {
    const cell = this.getCell(col, row);
    if (cell === CELL_FREE) return 1;
    if (cell === CELL_PIN) {
      if (passablePins && passablePins.has(`${col},${row}`)) return 1;
      return Infinity;
    }
    if (cell === CELL_BLOCKED_WIRE) return 3; // Penalized but passable
    if (cell === CELL_BLOCKED_COMP) return Infinity;
    return Infinity;
  }

  /* ─── Bulk Operations ─── */

  /**
   * Clear the entire grid.
   */
  clear() {
    this.data.fill(CELL_FREE);
    this._blockedCells.clear();
    this._pinPositions.clear();
    this.version++;
  }

  /**
   * Rebuild the grid from scratch using component and wire data.
   * @param {Array} components - Array of component objects with position, element, inputs, outputs
   * @param {Array} wires - Array of Wire objects with pathPoints
   * @param {Function} getPosition - nodeId → {x, y} | null
   */
  rebuild(components, wires, getPosition) {
    this.clear();

    // Mark component bodies as blocked
    for (const comp of components) {
      this._markComponent(comp);
    }

    // Mark pin positions
    for (const comp of components) {
      this._markPins(comp, getPosition);
    }

    // Mark existing wire segments
    for (const wire of wires) {
      this._markWire(wire);
    }

    this.version++;
  }

  /**
   * Mark a component's bounding box as blocked, with margin.
   * @param {Object} comp - Component with position, element, _cachedWidth, _cachedHeight
   */
  _markComponent(comp) {
    if (!comp.position) return;

    const x = comp.position.x;
    const y = comp.position.y;
    const w = comp._cachedWidth  || (comp.element ? comp.element.offsetWidth  : 80);
    const h = comp._cachedHeight || (comp.element ? comp.element.offsetHeight : 60);

    const margin = this.wireMargin;

    const startCol = Math.max(0, this.toCol(x - margin * this.gridSize));
    const endCol   = Math.min(this.cols - 1, this.toCol(x + w + margin * this.gridSize));
    const startRow = Math.max(0, this.toRow(y - margin * this.gridSize));
    const endRow   = Math.min(this.rows - 1, this.toRow(y + h + margin * this.gridSize));

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        this.setCell(col, row, CELL_BLOCKED_COMP);
      }
    }
  }

  /**
   * Mark component pin positions.
   * Pins are special cells: they are passable for their own wire's routing.
   * @param {Object} comp
   * @param {Function} getPosition
   */
  _markPins(comp, getPosition) {
    const allNodes = [...comp.inputs, ...comp.outputs];
    for (const node of allNodes) {
      const pos = getPosition(node.id);
      if (!pos) continue;

      const col = this.toCol(pos.x);
      const row = this.toRow(pos.y);

      if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
        // Don't overwrite component block with pin — pins on component edges
        // are already inside the blocked area. Instead, register them.
        this._pinPositions.set(`${col},${row}`, node.id);
        // Clear the cell at the pin position so routing can reach it
        this.data[row * this.cols + col] = CELL_PIN;
      }
    }
  }

  /**
   * Mark wire segments as soft obstacles (penalized, not impassable).
   * @param {Wire} wire
   */
  _markWire(wire) {
    if (!wire.pathPoints || wire.pathPoints.length < 2) return;

    for (let i = 0; i < wire.pathPoints.length - 1; i++) {
      const p1 = wire.pathPoints[i];
      const p2 = wire.pathPoints[i + 1];

      // Horizontal segment
      if (Math.abs(p2.y - p1.y) < 1) {
        const row = this.toRow(p1.y);
        const startCol = Math.min(this.toCol(p1.x), this.toCol(p2.x));
        const endCol   = Math.max(this.toCol(p1.x), this.toCol(p2.x));
        for (let col = startCol; col <= endCol; col++) {
          if (this.getCell(col, row) === CELL_FREE) {
            this.setCell(col, row, CELL_BLOCKED_WIRE);
          }
        }
      }
      // Vertical segment
      else if (Math.abs(p2.x - p1.x) < 1) {
        const col = this.toCol(p1.x);
        const startRow = Math.min(this.toRow(p1.y), this.toRow(p2.y));
        const endRow   = Math.max(this.toRow(p1.y), this.toRow(p2.y));
        for (let row = startRow; row <= endRow; row++) {
          if (this.getCell(col, row) === CELL_FREE) {
            this.setCell(col, row, CELL_BLOCKED_WIRE);
          }
        }
      }
    }
  }

  /**
   * Update grid for a single moved component.
   * Clears old position and marks new position.
   * @param {Object} comp
   * @param {{x:number,y:number}} oldPos
   * @param {Function} getPosition
   */
  updateComponent(comp, oldPos, getPosition) {
    // Clear old position
    if (oldPos) {
      const w = comp._cachedWidth  || 80;
      const h = comp._cachedHeight || 60;
      const margin = this.wireMargin;

      const startCol = Math.max(0, this.toCol(oldPos.x - margin * this.gridSize));
      const endCol   = Math.min(this.cols - 1, this.toCol(oldPos.x + w + margin * this.gridSize));
      const startRow = Math.max(0, this.toRow(oldPos.y - margin * this.gridSize));
      const endRow   = Math.min(this.rows - 1, this.toRow(oldPos.y + h + margin * this.gridSize));

      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          this.setCell(col, row, CELL_FREE);
        }
      }
    }

    // Mark new position
    this._markComponent(comp);
    this._markPins(comp, getPosition);

    this.version++;
  }

  /**
   * Clear wire cells from the grid and remark them.
   * Used before re-routing a specific wire.
   * @param {Array} wires - All current wires
   */
  remarkWires(wires) {
    // Clear all wire cells
    for (const key of this._blockedCells) {
      const [col, row] = key.split(',').map(Number);
      if (this.data[row * this.cols + col] === CELL_BLOCKED_WIRE) {
        this.data[row * this.cols + col] = CELL_FREE;
        this._blockedCells.delete(key);
      }
    }

    // Re-mark all wires
    for (const wire of wires) {
      this._markWire(wire);
    }
  }

  /* ─── Pin Lookup ─── */

  /**
   * Get the passable pins set for routing between two nodes.
   * This allows the A* router to pass through source and target pin cells.
   * @param {string} sourceNodeId
   * @param {string} targetNodeId
   * @returns {Set<string>} Set of "col,row" keys
   */
  getPassablePins(sourceNodeId, targetNodeId) {
    const passable = new Set();
    for (const [key, nodeId] of this._pinPositions) {
      if (nodeId === sourceNodeId || nodeId === targetNodeId) {
        passable.add(key);
      }
    }
    return passable;
  }

  /* ─── Dirty Region Tracking ─── */

  _markDirty(col, row) {
    this._dirtyMinCol = Math.min(this._dirtyMinCol, col);
    this._dirtyMaxCol = Math.max(this._dirtyMaxCol, col);
    this._dirtyMinRow = Math.min(this._dirtyMinRow, row);
    this._dirtyMaxRow = Math.max(this._dirtyMaxRow, row);
  }

  /** Check if a region is dirty and needs rebuilding. */
  isDirty(col, row) {
    return col >= this._dirtyMinCol && col <= this._dirtyMaxCol &&
           row >= this._dirtyMinRow && row <= this._dirtyMaxRow;
  }

  /** Reset dirty region tracking after a rebuild. */
  resetDirty() {
    this._dirtyMinCol = this.cols;
    this._dirtyMaxCol = 0;
    this._dirtyMinRow = this.rows;
    this._dirtyMaxRow = 0;
  }

  /* ─── Debug ─── */

  /**
   * Get grid statistics.
   */
  getStats() {
    let free = 0, comp = 0, wire = 0, pin = 0;
    for (let i = 0; i < this.data.length; i++) {
      switch (this.data[i]) {
        case CELL_FREE: free++; break;
        case CELL_BLOCKED_COMP: comp++; break;
        case CELL_BLOCKED_WIRE: wire++; break;
        case CELL_PIN: pin++; break;
      }
    }
    return { free, comp, wire, pin, total: this.data.length };
  }
}
