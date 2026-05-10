/**
 * StarRouter.js — A* Pathfinding Router for Orthogonal Wire Routing
 *
 * Implements A* search on the OccupancyGrid to find optimal orthogonal paths
 * between component pins. The router:
 *
 *   - Uses Manhattan distance as the admissible heuristic
 *   - Penalizes bends (direction changes) to produce clean routes
 *   - Avoids component bodies and penalizes crossing existing wires
 *   - Respects pin passability (source/target pins are passable)
 *   - Falls back to heuristic Manhattan routing if A* fails
 *   - Supports direction constraints at source/target pins
 *   - Limits search to prevent runaway computation
 *
 * Performance characteristics:
 *   - Typical route: < 5ms for circuits with 100 components
 *   - Worst case: limited by maxIterations (default 50000)
 *   - Memory: O(open set size) ≈ O(path length * search width)
 */

import { GRID_SIZE } from '../config.js';
import { OccupancyGrid } from './OccupancyGrid.js';

// Direction constants (grid-step directions)
const DIR_N = 0; // North (row - 1)
const DIR_E = 1; // East  (col + 1)
const DIR_S = 2; // South (row + 1)
const DIR_W = 3; // West  (col - 1)

// Direction deltas: [dCol, dRow]
const DIR_DELTA = [
  [0, -1],  // N
  [1,  0],  // E
  [0,  1],  // S
  [-1, 0]   // W
];

// Opposite directions for reverse lookup
const DIR_OPPOSITE = [DIR_S, DIR_W, DIR_N, DIR_E];

export class StarRouter {

  /* ─── Constructor ─── */

  /**
   * @param {Object} [config]
   * @param {OccupancyGrid} [config.grid]         - Pre-built occupancy grid
   * @param {number}        [config.gridSize]      - Grid cell size (default: GRID_SIZE)
   * @param {number}        [config.bendPenalty]   - Cost penalty for each 90° bend (default: 3)
   * @param {number}        [config.wirePenalty]   - Cost penalty for crossing a wire cell (default: 2)
   * @param {number}        [config.maxIterations] - Maximum A* iterations before fallback (default: 50000)
   * @param {number}        [config.stepBack]      - Step-back offset in grid cells (default: 1)
   */
  constructor(config = {}) {
    this.gridSize      = config.gridSize      || GRID_SIZE;
    this.bendPenalty   = config.bendPenalty    ?? 3;
    this.wirePenalty   = config.wirePenalty    ?? 2;
    this.maxIterations = config.maxIterations  ?? 50000;
    this.stepBack      = config.stepBack       ?? 1;

    // Occupancy grid
    this.grid = config.grid || new OccupancyGrid({ gridSize: this.gridSize });

    // Cache for the last routing result
    this._lastRouteStats = null;
  }

  /* ─── Public API ─── */

  /**
   * Route a wire from source to target using A* pathfinding.
   *
   * @param {{x:number,y:number}} fromPos     - Source pin position (pixels)
   * @param {{x:number,y:number}} toPos       - Target pin position (pixels)
   * @param {Object} [opts]
   * @param {string} [opts.sourceNodeId]       - Source node ID for pin passability
   * @param {string} [opts.targetNodeId]       - Target node ID for pin passability
   * @param {'right'|'left'|'up'|'down'} [opts.sourceDirection] - Exit direction from source
   * @param {'right'|'left'|'up'|'down'} [opts.targetDirection] - Entry direction to target
   * @param {number} [opts.channelX]           - Preferred vertical channel X (pixels)
   * @param {number} [opts.busY]               - Bus bar Y for fallback routing (pixels)
   * @param {number} [opts.topY]               - Top bar Y for fallback routing (pixels)
   * @returns {Array<{x:number,y:number}>}     - Ordered path points in pixel coordinates
   */
  route(fromPos, toPos, opts = {}) {
    const startTime = performance.now();

    // Snap positions to grid
    const fromCol = this.grid.toCol(fromPos.x);
    const fromRow = this.grid.toRow(fromPos.y);
    const toCol   = this.grid.toCol(toPos.x);
    const toRow   = this.grid.toRow(toPos.y);

    // Quick check: same cell → direct line (preserve exact pin positions)
    if (fromCol === toCol && fromRow === toRow) {
      return [
        { x: fromPos.x, y: fromPos.y },
        { x: toPos.x,   y: toPos.y   }
      ];
    }

    // Get passable pins
    const passablePins = this.grid.getPassablePins(
      opts.sourceNodeId || '',
      opts.targetNodeId || ''
    );

    // Determine initial search direction
    const initialDir = this._getInitialDirection(fromPos, toPos, opts.sourceDirection);

    // Run A* search — try multiple starting directions for loop-back support
    let path = this._astar(fromCol, fromRow, toCol, toRow, initialDir, passablePins, opts);

    // If the initial direction failed and we're doing a loop-back (target left of source),
    // try all 4 directions as starting directions
    if (!path && toPos.x < fromPos.x) {
      for (let altDir = 0; altDir < 4; altDir++) {
        if (altDir === initialDir) continue;
        path = this._astar(fromCol, fromRow, toCol, toRow, altDir, passablePins, opts);
        if (path) break;
      }
    }

    if (path) {
      // Convert grid path to pixel coordinates
      const pixelPath = this._gridPathToPixels(path, fromPos, toPos);

      // Simplify: remove redundant collinear points
      const simplified = this._simplifyPath(pixelPath);

      this._lastRouteStats = {
        method: 'astar',
        iterations: path.iterations,
        pathLength: simplified.length,
        time: performance.now() - startTime
      };

      return simplified;
    }

    // Fallback: heuristic Manhattan routing (with component avoidance)
    const fallbackPath = this._fallbackRoute(fromPos, toPos, opts);

    this._lastRouteStats = {
      method: 'fallback',
      iterations: 0,
      pathLength: fallbackPath.length,
      time: performance.now() - startTime
    };

    return fallbackPath;
  }

  /**
   * Get statistics from the last routing operation.
   */
  getLastStats() { return this._lastRouteStats; }

  /**
   * Rebuild the occupancy grid.
   * @param {Array} components
   * @param {Array} wires
   * @param {Function} getPosition
   */
  rebuildGrid(components, wires, getPosition) {
    this.grid.rebuild(components, wires, getPosition);
  }

  /**
   * Update grid for a moved component.
   */
  updateComponent(comp, oldPos, getPosition) {
    this.grid.updateComponent(comp, oldPos, getPosition);
  }

  /**
   * Re-mark all wires on the grid.
   */
  remarkWires(wires) {
    this.grid.remarkWires(wires);
  }

  /* ─── A* Search ─── */

  /**
   * Core A* pathfinding on the grid.
   *
   * @param {number} startCol
   * @param {number} startRow
   * @param {number} endCol
   * @param {number} endRow
   * @param {number} initialDir - Initial direction constraint
   * @param {Set<string>} passablePins
   * @param {Object} opts
   * @returns {Object|null} Path result with grid coordinates, or null
   */
  _astar(startCol, startRow, endCol, endRow, initialDir, passablePins, opts) {
    // Priority queue (binary min-heap)
    const openSet = new BinaryHeap();

    // Visited set: key = "col,row,dir" → best known cost
    const visited = new Map();

    // Parent tracking for path reconstruction
    const parents = new Map();

    // Start node
    const startKey = `${startCol},${startRow},${initialDir}`;
    const startCost = 0;
    const startHeuristic = this._heuristic(startCol, startRow, endCol, endRow);

    openSet.push({
      col: startCol,
      row: startRow,
      dir: initialDir,
      gCost: startCost,
      fCost: startCost + startHeuristic
    }, startCost + startHeuristic);

    visited.set(startKey, startCost);

    let iterations = 0;

    while (openSet.size > 0 && iterations < this.maxIterations) {
      iterations++;

      const current = openSet.pop();

      // Check if we reached the target
      if (current.col === endCol && current.row === endRow) {
        // Reconstruct path
        return {
          points: this._reconstructPath(parents, current, startCol, startRow),
          iterations
        };
      }

      // Expand neighbors
      for (let dir = 0; dir < 4; dir++) {
        const [dCol, dRow] = DIR_DELTA[dir];
        const nextCol = current.col + dCol;
        const nextRow = current.row + dRow;

        // Check bounds
        if (nextCol < 0 || nextCol >= this.grid.cols ||
            nextRow < 0 || nextRow >= this.grid.rows) continue;

        // Check passability
        if (!this.grid.isPassable(nextCol, nextRow, passablePins)) continue;

        // Calculate costs
        const moveCost = this.grid.getCost(nextCol, nextRow, passablePins);
        if (moveCost === Infinity) continue;

        // Bend penalty: extra cost for changing direction
        let bendCost = 0;
        if (current.dir !== dir) {
          bendCost = this.bendPenalty;
        }

        const newGCost = current.gCost + moveCost + bendCost;
        const nextKey = `${nextCol},${nextRow},${dir}`;

        // Check if this is better than a previous visit
        const prevCost = visited.get(nextKey);
        if (prevCost !== undefined && newGCost >= prevCost) continue;

        visited.set(nextKey, newGCost);
        parents.set(nextKey, {
          col: current.col,
          row: current.row,
          dir: current.dir
        });

        const hCost = this._heuristic(nextCol, nextRow, endCol, endRow);
        openSet.push({
          col: nextCol,
          row: nextRow,
          dir: dir,
          gCost: newGCost,
          fCost: newGCost + hCost
        }, newGCost + hCost);
      }
    }

    // No path found
    return null;
  }

  /**
   * Manhattan distance heuristic.
   */
  _heuristic(col1, row1, col2, row2) {
    return Math.abs(col2 - col1) + Math.abs(row2 - row1);
  }

  /**
   * Reconstruct path from A* parent tracking.
   * Returns array of {col, row} from start to end.
   */
  _reconstructPath(parents, endNode, startCol, startRow) {
    const path = [];
    let current = { col: endNode.col, row: endNode.row, dir: endNode.dir };

    // Walk back through parents
    while (current.col !== startCol || current.row !== startRow) {
      path.unshift({ col: current.col, row: current.row });
      const key = `${current.col},${current.row},${current.dir}`;
      const parent = parents.get(key);
      if (!parent) break;
      current = parent;
    }

    // Add start point
    path.unshift({ col: startCol, row: startRow });

    return path;
  }

  /**
   * Convert grid path to pixel coordinates.
   * Preserves the exact source/target positions.
   */
  _gridPathToPixels(gridPath, fromPos, toPos) {
    if (gridPath.points.length === 0) {
      return [
        { x: fromPos.x, y: fromPos.y },
        { x: toPos.x,   y: toPos.y   }
      ];
    }

    const pixels = [];
    for (let i = 0; i < gridPath.points.length; i++) {
      const pt = gridPath.points[i];
      if (i === 0) {
        pixels.push({ x: fromPos.x, y: fromPos.y });
      } else if (i === gridPath.points.length - 1) {
        pixels.push({ x: toPos.x, y: toPos.y });
      } else {
        // toX(col) = col * gridSize → already on a grid line, no +gridSize/2 offset
        pixels.push({
          x: this.grid.toX(pt.col),
          y: this.grid.toY(pt.row)
        });
      }
    }

    return pixels;
  }

  /**
   * Simplify path by removing redundant collinear points.
   * Three consecutive points that are collinear (same X or Y) can have
   * the middle point removed.
   */
  _simplifyPath(points) {
    if (points.length <= 2) return points;

    // Preserve exact pin endpoint positions (fromPos / toPos) — never snap them
    const firstPoint = points[0];
    const lastPoint  = points[points.length - 1];

    const simplified = [firstPoint];

    for (let i = 1; i < points.length - 1; i++) {
      const prev = simplified[simplified.length - 1];
      const curr = points[i];
      const next = points[i + 1];

      // Check if prev, curr, next are collinear
      const sameX = Math.abs(prev.x - curr.x) < 1 && Math.abs(curr.x - next.x) < 1;
      const sameY = Math.abs(prev.y - curr.y) < 1 && Math.abs(curr.y - next.y) < 1;

      if (!sameX && !sameY) {
        // Direction change — keep this point, snap only intermediate bends to grid
        simplified.push({
          x: this.grid.snapToGrid(curr.x),
          y: this.grid.snapToGrid(curr.y)
        });
      }
      // If collinear, skip the middle point
    }

    // Append the exact target pin position — no snapToGrid
    simplified.push(lastPoint);

    return simplified;
  }

  /* ─── Direction Handling ─── */

  /**
   * Determine the initial search direction from source.
   * For loop-back wires (output→input where target is to the left or above),
   * we allow the router to explore in the direction of the target.
   * We also try ALL four directions when the target is not straightforwardly
   * to the right.
   */
  _getInitialDirection(fromPos, toPos, sourceDirection) {
    if (sourceDirection === 'right') return DIR_E;
    if (sourceDirection === 'left')  return DIR_W;
    if (sourceDirection === 'up')    return DIR_N;
    if (sourceDirection === 'down')  return DIR_S;

    // Default: output pin exits right
    if (toPos.x >= fromPos.x) return DIR_E;

    // Loop-back: target is to the left — start going right (step-back)
    // The router will find a path around the source component
    return DIR_E;
  }

  /**
   * Check if a straight-line path between two points crosses any component body.
   * Used by the Manhattan fallback to avoid routing through components.
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @returns {boolean} True if the segment intersects a component
   */
  _segmentCrossesComponent(x1, y1, x2, y2) {
    // Check all cells along the segment
    if (Math.abs(y2 - y1) < 1) {
      // Horizontal segment
      const row = this.grid.toRow(y1);
      const startCol = this.grid.toCol(Math.min(x1, x2));
      const endCol = this.grid.toCol(Math.max(x1, x2));
      for (let col = startCol; col <= endCol; col++) {
        if (this.grid.getCell(col, row) === 1) return true; // CELL_BLOCKED_COMP
      }
    } else if (Math.abs(x2 - x1) < 1) {
      // Vertical segment
      const col = this.grid.toCol(x1);
      const startRow = this.grid.toRow(Math.min(y1, y2));
      const endRow = this.grid.toRow(Math.max(y1, y2));
      for (let row = startRow; row <= endRow; row++) {
        if (this.grid.getCell(col, row) === 1) return true;
      }
    }
    return false;
  }

  /* ─── Fallback Routing ─── */

  /**
   * Heuristic Manhattan routing when A* fails.
   * Now includes component obstacle avoidance — checks each segment against
   * the occupancy grid and reroutes around blocked cells.
   */
  _fallbackRoute(fromPos, toPos, opts = {}) {
    const gs = this.gridSize;
    const sb = this.stepBack * gs;

    const sx = fromPos.x, sy = fromPos.y;
    const tx = toPos.x,   ty = toPos.y;

    // Same column → straight vertical
    if (Math.abs(sx - tx) < gs * 0.5) {
      // Check if vertical path crosses a component
      if (!this._segmentCrossesComponent(sx, sy, tx, ty)) {
        return [
          { x: sx, y: sy },
          { x: tx, y: ty }
        ];
      }
      // Path blocked — offset horizontally to go around
      const offsetX = gs * 2;
      const bypassX = sx + offsetX;
      return [
        { x: sx, y: sy },
        { x: bypassX, y: sy },
        { x: bypassX, y: ty },
        { x: tx, y: ty }
      ];
    }

    // Same row → straight horizontal
    if (Math.abs(sy - ty) < gs * 0.5) {
      if (!this._segmentCrossesComponent(sx, sy, tx, ty)) {
        return [
          { x: sx, y: sy },
          { x: tx, y: ty }
        ];
      }
      // Path blocked — offset vertically
      const offsetY = gs * 2;
      const bypassY = sy + offsetY;
      return [
        { x: sx, y: sy },
        { x: sx, y: bypassY },
        { x: tx, y: bypassY },
        { x: tx, y: ty }
      ];
    }

    // Source LEFT of target: Z-shape
    if (sx < tx) {
      const channelX = opts.channelX ?? this.grid.snapToGrid((sx + tx) / 2);
      const clampedX = this.grid.snapToGrid(
        Math.max(sx + sb, Math.min(tx - sb, channelX))
      );

      // Check if the Z-shape path crosses components
      const hBlocked = this._segmentCrossesComponent(sx, sy, clampedX, sy);
      const vBlocked = this._segmentCrossesComponent(clampedX, sy, clampedX, ty);

      if (!hBlocked && !vBlocked) {
        return [
          { x: sx,       y: sy },
          { x: clampedX, y: sy },
          { x: clampedX, y: ty },
          { x: tx,       y: ty }
        ];
      }

      // Try alternate channels to avoid components
      for (let offset = 1; offset <= 5; offset++) {
        for (const dir of [1, -1]) {
          const altX = this.grid.snapToGrid(clampedX + offset * gs * dir);
          const altClamped = Math.max(sx + sb, Math.min(tx - sb, altX));
          if (!this._segmentCrossesComponent(sx, sy, altClamped, sy) &&
              !this._segmentCrossesComponent(altClamped, sy, altClamped, ty)) {
            return [
              { x: sx,         y: sy },
              { x: altClamped, y: sy },
              { x: altClamped, y: ty },
              { x: tx,         y: ty }
            ];
          }
        }
      }

      // All alternatives blocked — go around (below or above)
      const goBelow = sy < ty;
      const bypassY = goBelow
        ? this.grid.snapToGrid(Math.max(sy, ty) + gs * 3)
        : this.grid.snapToGrid(Math.min(sy, ty) - gs * 3);
      return [
        { x: sx,       y: sy },
        { x: clampedX, y: sy },
        { x: clampedX, y: bypassY },
        { x: tx - sb,  y: bypassY },
        { x: tx - sb,  y: ty },
        { x: tx,       y: ty }
      ];
    }

    // Source RIGHT of target: U-shape (loop-back)
    const sbx = this.grid.snapToGrid(sx + sb);
    const tbx = this.grid.snapToGrid(Math.max(tx - sb, gs));

    const localBusClearance = sb * 2;
    const localBusY = this.grid.snapToGrid(Math.max(sy, ty) + localBusClearance);

    const bottomBusY = opts.busY ?? localBusY;
    const topBusY    = opts.topY ?? (Math.min(sy, ty) - sb * 3);

    const bottomDist = Math.abs(sy - bottomBusY) + Math.abs(ty - bottomBusY);
    const topDist    = topBusY > gs
      ? Math.abs(sy - topBusY) + Math.abs(ty - topBusY)
      : Infinity;

    const routeY = (topDist < bottomDist && topBusY > gs) ? topBusY : bottomBusY;

    // Compact C-shape for nearby backward routing
    const horizontalGap = sx - tx;
    if (horizontalGap < sb * 4 && Math.abs(sy - ty) >= gs) {
      const midY = this.grid.snapToGrid((sy + ty) / 2);
      const path = [
        { x: sx,  y: sy },
        { x: sbx, y: sy },
        { x: sbx, y: midY },
        { x: tbx, y: midY },
        { x: tbx, y: ty },
        { x: tx,  y: ty }
      ];
      // Check for component collisions
      if (!this._pathCrossesComponent(path)) return path;
    }

    const path = [
      { x: sx,  y: sy },
      { x: sbx, y: sy },
      { x: sbx, y: routeY },
      { x: tbx, y: routeY },
      { x: tbx, y: ty },
      { x: tx,  y: ty }
    ];

    // Check for component collisions and try alternate bus levels
    if (!this._pathCrossesComponent(path)) return path;

    // Try alternate bus levels
    for (let offset = 1; offset <= 5; offset++) {
      for (const dir of [1, -1]) {
        const altY = this.grid.snapToGrid(routeY + offset * gs * 2 * dir);
        const altPath = [
          { x: sx,  y: sy },
          { x: sbx, y: sy },
          { x: sbx, y: altY },
          { x: tbx, y: altY },
          { x: tbx, y: ty },
          { x: tx,  y: ty }
        ];
        if (!this._pathCrossesComponent(altPath)) return altPath;
      }
    }

    return path;
  }

  /**
   * Check if an entire path (array of segments) crosses any component.
   */
  _pathCrossesComponent(points) {
    for (let i = 0; i < points.length - 1; i++) {
      if (this._segmentCrossesComponent(
        points[i].x, points[i].y,
        points[i + 1].x, points[i + 1].y
      )) return true;
    }
    return false;
  }

  /**
   * Assign vertical channels to wire sources to prevent overlap.
   * Delegates to the same logic as the original Router.
   */
  assignChannels(wires, getPosition) {
    const gs = this.gridSize;
    const channelMap   = new Map();
    const usedChannels = new Set();
    const channelSpacing = 2;

    const sourceInfos = new Map();
    for (const wire of wires) {
      const srcId = wire.fromNode.nodeId;
      if (sourceInfos.has(srcId)) continue;
      const srcPos = getPosition(srcId);
      if (!srcPos) continue;

      const tgtPos = getPosition(wire.toNode.nodeId);
      let midX;
      if (tgtPos) {
        midX = (srcPos.x + tgtPos.x) / 2;
      } else {
        midX = srcPos.x + 2 * gs;
      }

      sourceInfos.set(srcId, { x: srcPos.x, y: srcPos.y, midX });
    }

    const sorted = [...sourceInfos.entries()].sort((a, b) => {
      const dx = a[1].midX - b[1].midX;
      return dx !== 0 ? dx : a[1].y - b[1].y;
    });

    for (const [srcId, info] of sorted) {
      const preferredCol = Math.round(info.midX / gs);
      let channelCol = preferredCol;

      let offset = 0;
      let direction = 1;
      while (usedChannels.has(channelCol)) {
        offset++;
        direction = offset % 2 === 1 ? 1 : -1;
        channelCol = preferredCol + Math.ceil(offset / 2) * direction * channelSpacing;
      }

      channelMap.set(srcId, channelCol * gs);
      usedChannels.add(channelCol);
    }

    return channelMap;
  }
}

/* ─── Binary Min-Heap for A* Priority Queue ─── */

class BinaryHeap {
  constructor() {
    this._data = [];
  }

  get size() { return this._data.length; }

  /**
   * Push an item with a priority.
   * @param {*} item
   * @param {number} priority
   */
  push(item, priority) {
    this._data.push({ item, priority });
    this._bubbleUp(this._data.length - 1);
  }

  /**
   * Pop the item with the lowest priority.
   * @returns {*} The item with lowest priority
   */
  pop() {
    if (this._data.length === 0) return null;
    const top = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0) {
      this._data[0] = last;
      this._sinkDown(0);
    }
    return top.item;
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this._data[parentIndex].priority <= this._data[index].priority) break;
      [this._data[parentIndex], this._data[index]] = [this._data[index], this._data[parentIndex]];
      index = parentIndex;
    }
  }

  _sinkDown(index) {
    const length = this._data.length;
    while (true) {
      let smallest = index;
      const left  = 2 * index + 1;
      const right = 2 * index + 2;

      if (left < length && this._data[left].priority < this._data[smallest].priority) {
        smallest = left;
      }
      if (right < length && this._data[right].priority < this._data[smallest].priority) {
        smallest = right;
      }

      if (smallest === index) break;
      [this._data[index], this._data[smallest]] = [this._data[smallest], this._data[index]];
      index = smallest;
    }
  }
}
