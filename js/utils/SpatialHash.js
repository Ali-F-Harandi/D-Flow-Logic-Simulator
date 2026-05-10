/**
 * SpatialHash.js — Efficient spatial queries for circuit elements
 *
 * Provides O(1) lookup for "what's near point (x,y)?" using a hash grid.
 * Each cell in the hash grid stores references to components and wire segments
 * that intersect that cell.
 *
 * Used for:
 *   - Hit testing: find which wire/component is under the cursor
 *   - Collision detection: check if a wire crosses a component
 *   - Proximity queries: find nearby connectors for auto-magnet
 *   - Overlap detection: find parallel wire segments for nudging
 *
 * Performance:
 *   - Insert: O(1) amortized
 *   - Query: O(n) where n = elements in the cell (typically small)
 *   - Memory: O(elements * average_span_in_cells)
 */

import { GRID_SIZE } from '../config.js';

export class SpatialHash {

  /* ─── Constructor ─── */

  /**
   * @param {Object} [config]
   * @param {number} [config.cellSize] - Hash cell size in pixels (default: GRID_SIZE * 4)
   */
  constructor(config = {}) {
    this.cellSize = config.cellSize || GRID_SIZE * 4;
    this._cells = new Map(); // "cx,cy" → Set of entries
    this._entries = new Map(); // id → entry data
  }

  /* ─── Insertion ─── */

  /**
   * Insert a component into the spatial hash.
   * @param {Object} comp - Component with id, position, element
   */
  insertComponent(comp) {
    if (!comp.position || !comp.element) return;

    const x = comp.position.x;
    const y = comp.position.y;
    const w = comp._cachedWidth  || comp.element.offsetWidth  || 80;
    const h = comp._cachedHeight || comp.element.offsetHeight || 60;

    const entry = {
      id: comp.id,
      type: 'component',
      data: comp,
      bounds: { x, y, w, h }
    };

    this._insertEntry(entry);
  }

  /**
   * Insert a wire into the spatial hash.
   * Stores each segment as a separate entry.
   * @param {Object} wire - Wire with id, pathPoints
   */
  insertWire(wire) {
    if (!wire.pathPoints || wire.pathPoints.length < 2) return;

    for (let i = 0; i < wire.pathPoints.length - 1; i++) {
      const p1 = wire.pathPoints[i];
      const p2 = wire.pathPoints[i + 1];

      const entry = {
        id: `${wire.id}:seg:${i}`,
        type: 'wire-segment',
        data: wire,
        segIndex: i,
        bounds: {
          x: Math.min(p1.x, p2.x),
          y: Math.min(p1.y, p2.y),
          w: Math.abs(p2.x - p1.x),
          h: Math.abs(p2.y - p1.y)
        }
      };

      this._insertEntry(entry);
    }
  }

  /**
   * Insert a connector (pin) into the spatial hash.
   * @param {Object} pinData - { id, x, y, isOutput, compId }
   */
  insertPin(pinData) {
    const entry = {
      id: pinData.id,
      type: 'pin',
      data: pinData,
      bounds: { x: pinData.x - 5, y: pinData.y - 5, w: 10, h: 10 }
    };

    this._insertEntry(entry);
  }

  /**
   * Internal: insert an entry into all cells it overlaps.
   */
  _insertEntry(entry) {
    const { x, y, w, h } = entry.bounds;

    const minCX = Math.floor(x / this.cellSize);
    const maxCX = Math.floor((x + w) / this.cellSize);
    const minCY = Math.floor(y / this.cellSize);
    const maxCY = Math.floor((y + h) / this.cellSize);

    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const key = `${cx},${cy}`;
        if (!this._cells.has(key)) this._cells.set(key, new Set());
        this._cells.get(key).add(entry);
      }
    }

    this._entries.set(entry.id, entry);
  }

  /* ─── Removal ─── */

  /**
   * Remove all entries for a given ID prefix.
   * @param {string} idPrefix
   */
  remove(idPrefix) {
    const keysToRemove = [];

    for (const [key, cell] of this._cells) {
      for (const entry of cell) {
        if (entry.id === idPrefix || entry.id.startsWith(idPrefix + ':')) {
          cell.delete(entry);
        }
      }
      if (cell.size === 0) keysToRemove.push(key);
    }

    for (const key of keysToRemove) {
      this._cells.delete(key);
    }

    // Remove from entries map
    for (const key of [...this._entries.keys()]) {
      if (key === idPrefix || key.startsWith(idPrefix + ':')) {
        this._entries.delete(key);
      }
    }
  }

  /**
   * Clear all entries.
   */
  clear() {
    this._cells.clear();
    this._entries.clear();
  }

  /* ─── Queries ─── */

  /**
   * Find all entries near a point.
   * @param {number} x - X coordinate (pixels)
   * @param {number} y - Y coordinate (pixels)
   * @param {number} [radius=0] - Search radius (pixels)
   * @param {string} [typeFilter] - Optional type filter ('component', 'wire-segment', 'pin')
   * @returns {Array} Matching entries
   */
  query(x, y, radius = 0, typeFilter = null) {
    const results = new Set();

    const minCX = Math.floor((x - radius) / this.cellSize);
    const maxCX = Math.floor((x + radius) / this.cellSize);
    const minCY = Math.floor((y - radius) / this.cellSize);
    const maxCY = Math.floor((y + radius) / this.cellSize);

    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const key = `${cx},${cy}`;
        const cell = this._cells.get(key);
        if (!cell) continue;

        for (const entry of cell) {
          if (typeFilter && entry.type !== typeFilter) continue;

          // Check if entry is within radius
          const b = entry.bounds;
          const nearestX = Math.max(b.x, Math.min(x, b.x + b.w));
          const nearestY = Math.max(b.y, Math.min(y, b.y + b.h));
          const dist = Math.hypot(x - nearestX, y - nearestY);

          if (dist <= radius || radius === 0) {
            results.add(entry);
          }
        }
      }
    }

    return [...results];
  }

  /**
   * Find the nearest pin to a point.
   * @param {number} x
   * @param {number} y
   * @param {number} [maxRadius=30] - Maximum search radius (pixels)
   * @param {Function} [filter] - Optional filter: pinData → boolean
   * @returns {Object|null} Nearest pin entry data, or null
   */
  findNearestPin(x, y, maxRadius = 30, filter = null) {
    const pins = this.query(x, y, maxRadius, 'pin');
    let nearest = null;
    let nearestDist = maxRadius;

    for (const entry of pins) {
      const pin = entry.data;
      if (filter && !filter(pin)) continue;

      const dist = Math.hypot(x - pin.x, y - pin.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = entry;
      }
    }

    return nearest;
  }

  /**
   * Find all wire segments near a point.
   * Used for wire hit testing.
   * @param {number} x
   * @param {number} y
   * @param {number} [tolerance=8] - Hit tolerance (pixels)
   * @returns {Array} Matching wire segment entries
   */
  findWireSegments(x, y, tolerance = 8) {
    return this.query(x, y, tolerance, 'wire-segment').filter(entry => {
      const wire = entry.data;
      const p1 = wire.pathPoints[entry.segIndex];
      const p2 = wire.pathPoints[entry.segIndex + 1];
      return this._pointToSegmentDist(x, y, p1.x, p1.y, p2.x, p2.y) <= tolerance;
    });
  }

  /**
   * Check if a bounding box overlaps any component.
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @returns {Array} Overlapping component entries
   */
  findOverlappingComponents(x, y, w, h) {
    const results = new Set();

    const minCX = Math.floor(x / this.cellSize);
    const maxCX = Math.floor((x + w) / this.cellSize);
    const minCY = Math.floor(y / this.cellSize);
    const maxCY = Math.floor((y + h) / this.cellSize);

    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const key = `${cx},${cy}`;
        const cell = this._cells.get(key);
        if (!cell) continue;

        for (const entry of cell) {
          if (entry.type !== 'component') continue;

          // AABB overlap test
          const b = entry.bounds;
          if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y) {
            results.add(entry);
          }
        }
      }
    }

    return [...results];
  }

  /* ─── Geometry Helpers ─── */

  /**
   * Distance from point to line segment.
   */
  _pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) return Math.hypot(px - x1, py - y1);

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  /* ─── Statistics ─── */

  getStats() {
    let totalEntries = 0;
    for (const cell of this._cells.values()) {
      totalEntries += cell.size;
    }
    return {
      cells: this._cells.size,
      entries: this._entries.size,
      totalCellReferences: totalEntries
    };
  }
}
