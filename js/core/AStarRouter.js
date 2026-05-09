import { GRID_SIZE } from '../config.js';

/**
 * MinHeap — binary min-heap for A* open set.
 * O(log n) insert/extract-min vs O(n) linear scan on Map.
 */
class MinHeap {
  constructor() {
    this._data = [];
  }

  get size() { return this._data.length; }

  push(item) {
    this._data.push(item);
    this._bubbleUp(this._data.length - 1);
  }

  pop() {
    const top = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0) {
      this._data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._data[i].f < this._data[parent].f) {
        [this._data[i], this._data[parent]] = [this._data[parent], this._data[i]];
        i = parent;
      } else break;
    }
  }

  _sinkDown(i) {
    const n = this._data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this._data[left].f < this._data[smallest].f) smallest = left;
      if (right < n && this._data[right].f < this._data[smallest].f) smallest = right;
      if (smallest !== i) {
        [this._data[i], this._data[smallest]] = [this._data[smallest], this._data[i]];
        i = smallest;
      } else break;
    }
  }
}

/**
 * A* Wire Router — computes Manhattan-routed paths that avoid
 * overlapping with components and other wires.
 *
 * Improvements over original:
 * - sourceNodeId correctly propagated to _isBlocked (fixes fan-out bug)
 * - Binary MinHeap replaces Map for O(log n) open-set operations
 * - Increased bend penalty (1.5) for cleaner L/U-shaped wires
 * - ObstacleCache integration for fast grid rebuilding
 * - Bidirectional fallback (top + bottom bus bar)
 */
export class AStarRouter {
  /**
   * @param {Object} obstacleCache - Cached obstacle grid (ObstacleCache instance)
   * @param {Array} wires - Array of visual wire objects with fromNode/toNode
   * @param {Object} positionCache - For getting connector positions
   * @param {Object} engine - For looking up component by node ID
   */
  constructor(obstacleCache, wires, positionCache, engine) {
    this.obstacleCache = obstacleCache;
    this.wires = wires;
    this.positionCache = positionCache;
    this.engine = engine;
    this.gridSize = GRID_SIZE;
    this.blockedCells = new Map();
  }

  /**
   * Compute an A*-routed path between two connector positions.
   * @param {Object} fromPos - {x, y} scene coordinates of source connector
   * @param {Object} toPos - {x, y} scene coordinates of target connector
   * @param {string} [sourceNodeId] - The output node ID of the source (for overlap checking)
   * @param {Object} [opts] - Optional parameters
   * @param {number} [opts.minClearY] - Y level below all components (fallback bus bar)
   * @param {number} [opts.maxClearY] - Y level above all components (fallback top bus bar)
   * @returns {string} SVG path data string
   */
  computePath(fromPos, toPos, sourceNodeId = null, opts = {}) {
    this._buildBlockedGrid(sourceNodeId);

    const gs = this.gridSize;
    const startCell = { x: Math.round(fromPos.x / gs), y: Math.round(fromPos.y / gs) };
    const endCell = { x: Math.round(toPos.x / gs), y: Math.round(toPos.y / gs) };

    // Ensure start/end are not blocked
    this._unblockCell(startCell.x, startCell.y);
    this._unblockCell(endCell.x, endCell.y);
    // Also unblock neighbors of start/end for routing flexibility
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      this._unblockCell(startCell.x + dx, startCell.y + dy);
      this._unblockCell(endCell.x + dx, endCell.y + dy);
    }

    // Run A* search — pass sourceNodeId so fan-out works correctly
    const path = this._astar(startCell, endCell, sourceNodeId);

    if (path && path.length >= 2) {
      return this._pathToSVG(path, fromPos, toPos);
    }

    // Fallback: use smart Manhattan routing if A* fails
    return this._fallbackPath(fromPos, toPos, opts);
  }

  /**
   * Build the blocked cell grid from the obstacle cache and existing wires.
   * Uses the cached component grid for fast rebuilds.
   * @param {string} sourceNodeId - The current wire's source node ID
   */
  _buildBlockedGrid(sourceNodeId) {
    // Start with the cached component obstacle grid (fast copy)
    if (this.obstacleCache && this.obstacleCache.componentGrid) {
      this.blockedCells = new Map(this.obstacleCache.componentGrid);
    } else {
      this.blockedCells.clear();
    }

    // Mark existing wire segments as blocked (only from different sources)
    // Wires from the same source can share path segments (fan-out)
    if (this.wires && sourceNodeId) {
      for (const wire of this.wires) {
        if (!wire.element) continue;

        const wireSourceNodeId = wire.fromNode?.nodeId;
        if (wireSourceNodeId === sourceNodeId) continue;  // Same source = allowed

        // Use cached occupiedCells if available (fast path)
        if (wire.occupiedCells && wire.occupiedCells.size > 0) {
          for (const key of wire.occupiedCells) {
            if (this.blockedCells.get(key) !== 'component') {
              if (!this.blockedCells.has(key)) {
                this.blockedCells.set(key, new Set());
              }
              const val = this.blockedCells.get(key);
              if (val instanceof Set) {
                val.add(wireSourceNodeId || 'unknown');
              }
            }
          }
        } else {
          // Fallback: parse SVG DOM (slow path, for backwards compatibility)
          const visualPath = wire.element.querySelector('.wire-visual');
          if (visualPath) {
            const d = visualPath.getAttribute('d');
            if (d) {
              const segments = this._parseSVGPath(d);
              for (const seg of segments) {
                this._markWireSegment(seg, wireSourceNodeId);
              }
            }
          }
        }
      }
    }
  }

  _unblockCell(x, y) {
    const key = `${x},${y}`;
    this.blockedCells.delete(key);
  }

  /**
   * Parse an SVG path string into a list of line segments.
   * Returns [{x1,y1,x2,y2}, ...]
   */
  _parseSVGPath(d) {
    const segments = [];
    const commands = d.match(/[ML]\s*[\d.e+-]+/gi);
    if (!commands) return segments;

    let cx = 0, cy = 0;
    for (const cmd of commands) {
      const type = cmd[0];
      const nums = cmd.slice(1).trim().split(/[\s,]+/).map(Number);
      if (nums.length >= 2) {
        const nx = nums[0];
        const ny = nums[1];
        if (type === 'L') {
          segments.push({ x1: cx, y1: cy, x2: nx, y2: ny });
        }
        cx = nx;
        cy = ny;
        for (let i = 2; i + 1 < nums.length; i += 2) {
          const nnx = nums[i];
          const nny = nums[i + 1];
          if (type === 'L') {
            segments.push({ x1: cx, y1: cy, x2: nnx, y2: nny });
          }
          cx = nnx;
          cy = nny;
        }
        if (type === 'M') {
          cx = nums[0];
          cy = nums[1];
        }
      }
    }
    return segments;
  }

  /**
   * Mark grid cells along a wire segment as blocked (for different sources only).
   */
  _markWireSegment(seg, sourceNodeId) {
    const gs = this.gridSize;
    const isHorizontal = Math.abs(seg.y2 - seg.y1) < 1;
    const isVertical = Math.abs(seg.x2 - seg.x1) < 1;

    if (isHorizontal) {
      const y = Math.round(seg.y1 / gs);
      const x1 = Math.round(Math.min(seg.x1, seg.x2) / gs);
      const x2 = Math.round(Math.max(seg.x1, seg.x2) / gs);
      for (let x = x1; x <= x2; x++) {
        const key = `${x},${y}`;
        if (this.blockedCells.get(key) !== 'component') {
          if (!this.blockedCells.has(key)) {
            this.blockedCells.set(key, new Set());
          }
          const val = this.blockedCells.get(key);
          if (val instanceof Set) {
            val.add(sourceNodeId || 'unknown');
          }
        }
      }
    } else if (isVertical) {
      const x = Math.round(seg.x1 / gs);
      const y1 = Math.round(Math.min(seg.y1, seg.y2) / gs);
      const y2 = Math.round(Math.max(seg.y1, seg.y2) / gs);
      for (let y = y1; y <= y2; y++) {
        const key = `${x},${y}`;
        if (this.blockedCells.get(key) !== 'component') {
          if (!this.blockedCells.has(key)) {
            this.blockedCells.set(key, new Set());
          }
          const val = this.blockedCells.get(key);
          if (val instanceof Set) {
            val.add(sourceNodeId || 'unknown');
          }
        }
      }
    }
  }

  /**
   * Check if a cell is blocked for the current wire.
   * A cell is blocked if:
   * - It's occupied by a component, OR
   * - It's occupied by a wire from a DIFFERENT source
   */
  _isBlocked(x, y, sourceNodeId) {
    const key = `${x},${y}`;
    const val = this.blockedCells.get(key);
    if (val === 'component') return true;
    if (val instanceof Set) {
      for (const src of val) {
        if (src !== sourceNodeId) return true;
      }
    }
    return false;
  }

  /**
   * A* search on the grid using a Binary MinHeap.
   * Returns array of {x, y} grid cells from start to end, or null if no path found.
   * @param {Object} start - Start cell {x, y}
   * @param {Object} end - End cell {x, y}
   * @param {string} sourceNodeId - Source node ID for correct fan-out blocking
   */
  _astar(start, end, sourceNodeId = null) {
    const maxIterations = 20000;
    const closedSet = new Set();
    const gScore = new Map();
    const cameFrom = new Map();

    const startKey = `${start.x},${start.y}`;
    const endKey = `${end.x},${end.y}`;

    const heuristic = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

    gScore.set(startKey, 0);

    // Use MinHeap for O(log n) extract-min
    const openHeap = new MinHeap();
    openHeap.push({ x: start.x, y: start.y, key: startKey, f: heuristic(start, end) });

    const dirs = [
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 }
    ];

    let iterations = 0;
    while (openHeap.size > 0 && iterations < maxIterations) {
      iterations++;

      const current = openHeap.pop();
      const currentKey = current.key;

      if (closedSet.has(currentKey)) continue;
      closedSet.add(currentKey);

      if (currentKey === endKey) {
        return this._reconstructPath(cameFrom, currentKey);
      }

      const currentG = gScore.get(currentKey) || 0;

      // Check if we can jump directly to end (if unblocked and within reasonable distance)
      if (!closedSet.has(endKey)) {
        const distToEnd = heuristic(current, end);
        if (distToEnd <= 2) {
          let directClear = true;
          if (current.x !== end.x && current.y !== end.y) {
            // FIX: pass sourceNodeId to _isBlocked for correct fan-out handling
            const mid1Blocked = this._isBlocked(end.x, current.y, sourceNodeId);
            const mid2Blocked = this._isBlocked(current.x, end.y, sourceNodeId);
            if (mid1Blocked && mid2Blocked) directClear = false;
          }
          if (directClear) {
            const tentativeG = currentG + distToEnd;
            const prevG = gScore.get(endKey) || Infinity;
            if (tentativeG < prevG) {
              cameFrom.set(endKey, currentKey);
              gScore.set(endKey, tentativeG);
              openHeap.push({ x: end.x, y: end.y, key: endKey, f: tentativeG });
            }
          }
        }
      }

      for (const dir of dirs) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        const nKey = `${nx},${ny}`;

        if (closedSet.has(nKey)) continue;
        // FIX: pass sourceNodeId to _isBlocked for correct fan-out handling
        if (this._isBlocked(nx, ny, sourceNodeId)) continue;

        // Direction penalty: increased from 0.1 to 1.5 for cleaner L/U-shaped paths
        let moveCost = 1;
        const parentKey = cameFrom.get(currentKey);
        if (parentKey) {
          const [px, py] = parentKey.split(',').map(Number);
          const prevDx = current.x - px;
          const prevDy = current.y - py;
          if (prevDx !== dir.dx || prevDy !== dir.dy) {
            moveCost += 1.5;  // Strong bend penalty for straighter, cleaner wires
          }
        }

        const tentativeG = currentG + moveCost;
        const prevG = gScore.get(nKey) || Infinity;

        if (tentativeG < prevG) {
          cameFrom.set(nKey, currentKey);
          gScore.set(nKey, tentativeG);
          openHeap.push({ x: nx, y: ny, key: nKey, f: tentativeG + heuristic({ x: nx, y: ny }, end) });
        }
      }
    }

    return null;
  }

  _reconstructPath(cameFrom, currentKey) {
    const path = [];
    let key = currentKey;
    while (key) {
      const [x, y] = key.split(',').map(Number);
      path.unshift({ x, y });
      key = cameFrom.get(key) || null;
    }
    return path;
  }

  /**
   * Convert a grid-cell path to an SVG path string.
   * Simplifies the path by removing collinear intermediate points.
   */
  _pathToSVG(path, fromPos, toPos) {
    if (path.length < 2) {
      return `M ${fromPos.x} ${fromPos.y} L ${toPos.x} ${toPos.y}`;
    }

    const gs = this.gridSize;

    // Simplify: remove intermediate points that are collinear
    const simplified = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const prev = simplified[simplified.length - 1];
      const next = path[i + 1];
      const curr = path[i];
      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;
      if (dx1 !== dx2 || dy1 !== dy2) {
        simplified.push(curr);
      }
    }
    simplified.push(path[path.length - 1]);

    // Build SVG path: use exact connector positions for start/end, grid for intermediate
    let d = `M ${fromPos.x} ${fromPos.y}`;
    for (let i = 1; i < simplified.length - 1; i++) {
      d += ` L ${simplified[i].x * gs} ${simplified[i].y * gs}`;
    }
    d += ` L ${toPos.x} ${toPos.y}`;

    return d;
  }

  /**
   * Fallback Manhattan routing when A* fails.
   * Now supports bidirectional bus bar (top AND bottom).
   */
  _fallbackPath(fromPos, toPos, opts = {}) {
    const startX = fromPos.x;
    const startY = fromPos.y;
    const endX = toPos.x;
    const endY = toPos.y;
    const { minClearY, maxClearY } = opts;

    if (endX >= startX + 20) {
      const midX = startX + (endX - startX) / 2;
      return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
    } else if (endX >= startX - 10) {
      const midX = startX + 30;
      const midX2 = endX - 30;
      if (Math.abs(endY - startY) < 20) {
        // Try top route first, fall back to bottom
        const topY = Math.min(startY, endY) - 40;
        if (maxClearY !== undefined && topY < maxClearY) {
          // Top is blocked, use bottom
          const bottomY = Math.max(minClearY !== undefined ? minClearY + 20 : Math.max(startY, endY) + 70, Math.max(startY, endY) + 40);
          return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${bottomY} L ${midX2} ${bottomY} L ${midX2} ${endY} L ${endX} ${endY}`;
        }
        return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${topY} L ${midX2} ${topY} L ${midX2} ${endY} L ${endX} ${endY}`;
      }
      return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
    } else {
      const offset = 40;

      // Calculate both top and bottom bus levels
      const bottomLevel = Math.max(
        Math.max(startY, endY) + offset,
        minClearY !== undefined ? minClearY + 20 : 0
      ) + 30;

      const topLevel = maxClearY !== undefined
        ? Math.min(startY, endY) - offset - 30
        : Math.min(startY, endY) - offset - 30;

      // Choose shorter route: top or bottom
      const bottomPathLength = Math.abs(startY - bottomLevel) + Math.abs(endY - bottomLevel) + Math.abs(startX + offset - (endX - offset));
      const topPathLength = (maxClearY !== undefined)
        ? Infinity  // No top route available if maxClearY not provided
        : Math.abs(startY - topLevel) + Math.abs(endY - topLevel) + Math.abs(startX + offset - (endX - offset));

      const busLevel = topPathLength < bottomPathLength ? topLevel : bottomLevel;
      const isTop = topPathLength < bottomPathLength;

      if (isTop) {
        return `M ${startX} ${startY} ` +
               `L ${startX + offset} ${startY} ` +
               `L ${startX + offset} ${busLevel} ` +
               `L ${endX - offset} ${busLevel} ` +
               `L ${endX - offset} ${endY} ` +
               `L ${endX} ${endY}`;
      }

      return `M ${startX} ${startY} ` +
             `L ${startX + offset} ${startY} ` +
             `L ${startX + offset} ${busLevel} ` +
             `L ${endX - offset} ${busLevel} ` +
             `L ${endX - offset} ${endY} ` +
             `L ${endX} ${endY}`;
    }
  }
}

/**
 * ObstacleCache — caches component obstacle grid for fast A* rebuilds.
 * Instead of rebuilding the entire blocked grid from scratch for every wire,
 * we cache the static component obstacles and only add wire obstacles dynamically.
 */
export class ObstacleCache {
  constructor(gridSize) {
    this.gridSize = gridSize;
    this.componentGrid = new Map();
    this._version = 0;
    this._lastVersion = -1;
  }

  /**
   * Rebuild the component obstacle grid from the current component list.
   * Should be called when components are added, removed, or moved.
   * @param {Array} components - Array of component objects
   */
  rebuildComponentGrid(components) {
    this.componentGrid.clear();
    const gs = this.gridSize;

    for (const comp of components) {
      if (!comp.element) continue;

      // Use cached dimensions to avoid layout reflow from offsetWidth/offsetHeight
      const w = comp._cachedWidth || comp.element.offsetWidth;
      const h = comp._cachedHeight || comp.element.offsetHeight;

      const x1 = Math.floor(comp.position.x / gs) - 1;
      const y1 = Math.floor(comp.position.y / gs) - 1;
      const x2 = Math.ceil((comp.position.x + w) / gs) + 1;
      const y2 = Math.ceil((comp.position.y + h) / gs) + 1;

      for (let x = x1; x <= x2; x++) {
        for (let y = y1; y <= y2; y++) {
          this.componentGrid.set(`${x},${y}`, 'component');
        }
      }
    }
    this._version++;
  }

  /**
   * Incremental update: remove a single component's obstacles.
   * More efficient than full rebuild when only one component moves.
   */
  removeComponentObstacles(comp) {
    const gs = this.gridSize;
    if (!comp.element) return;

    const w = comp._cachedWidth || comp.element.offsetWidth;
    const h = comp._cachedHeight || comp.element.offsetHeight;

    const x1 = Math.floor(comp.position.x / gs) - 1;
    const y1 = Math.floor(comp.position.y / gs) - 1;
    const x2 = Math.ceil((comp.position.x + w) / gs) + 1;
    const y2 = Math.ceil((comp.position.y + h) / gs) + 1;

    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        const key = `${x},${y}`;
        if (this.componentGrid.get(key) === 'component') {
          this.componentGrid.delete(key);
        }
      }
    }
  }

  /**
   * Incremental update: add a single component's obstacles.
   */
  addComponentObstacles(comp) {
    const gs = this.gridSize;
    if (!comp.element) return;

    const w = comp._cachedWidth || comp.element.offsetWidth;
    const h = comp._cachedHeight || comp.element.offsetHeight;

    const x1 = Math.floor(comp.position.x / gs) - 1;
    const y1 = Math.floor(comp.position.y / gs) - 1;
    const x2 = Math.ceil((comp.position.x + w) / gs) + 1;
    const y2 = Math.ceil((comp.position.y + h) / gs) + 1;

    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        this.componentGrid.set(`${x},${y}`, 'component');
      }
    }
  }

  get version() { return this._version; }
}
