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
 * KEY DESIGN: Wire segments as "walls"
 * ─────────────────────────────────────
 * Each wire is a collection of vertical and horizontal line segments.
 * In the pathfinding grid, these segments act as WALLS:
 *   - A vertical wall at column X blocks OTHER vertical wires from using column X
 *   - A horizontal wall at row Y blocks OTHER horizontal wires from using row Y
 *   - Crossing is ALLOWED: a horizontal wire can cross a vertical wall,
 *     and a vertical wire can cross a horizontal wall
 *   - Same-source wires (fan-out) can share walls (bundling)
 *
 * This ensures each wire from a different source gets its own
 * vertical column and horizontal row, only crossing perpendicularly.
 */
export class AStarRouter {
  /**
   * @param {Object} obstacleCache - Cached obstacle grid (ObstacleCache instance)
   * @param {Array} wires - Array of visual wire objects with fromNode/toNode
   * @param {Object} positionCache - For getting connector positions
   * @param {Object} engine - For looking up component by node ID
   * @param {Object} [channelMap] - Optional Map<sourceNodeId, channelX> for
   *   proactive channel assignment to prevent overlap
   */
  constructor(obstacleCache, wires, positionCache, engine, channelMap = null) {
    this.obstacleCache = obstacleCache;
    this.wires = wires;
    this.positionCache = positionCache;
    this.engine = engine;
    this.gridSize = GRID_SIZE;
    this.blockedCells = new Map();
    this.channelMap = channelMap;
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
    const path = this._astar(startCell, endCell, sourceNodeId, opts);

    if (path && path.length >= 2) {
      return this._pathToSVG(path, fromPos, toPos);
    }

    // Fallback: use smart Manhattan routing if A* fails
    return this._smartFallbackPath(fromPos, toPos, sourceNodeId, opts);
  }

  /**
   * Build the blocked cell grid from the obstacle cache and existing wires.
   * Stores direction info (horizontal/vertical) per wire segment so that
   * same-direction overlaps are blocked but perpendicular crossings are allowed.
   *
   * Data structure for wire-occupied cells:
   *   Map<cellKey, Map<sourceNodeId, Set<'h'|'v'>>>
   * - Each cell can be occupied by multiple sources, each with a set of directions.
   * - A cell is "overlap-blocked" if a different-source wire passes in the SAME direction.
   * - A cell is "crossing-allowed" if a different-source wire passes in a DIFFERENT direction.
   *
   * @param {string} sourceNodeId - The current wire's source node ID
   */
  _buildBlockedGrid(sourceNodeId) {
    // Start with the cached component obstacle grid (fast copy)
    if (this.obstacleCache && this.obstacleCache.componentGrid) {
      this.blockedCells = new Map(this.obstacleCache.componentGrid);
    } else {
      this.blockedCells.clear();
    }

    // Mark existing wire segments with direction info (only from different sources)
    // Wires from the same source can share path segments (fan-out)
    if (this.wires && sourceNodeId) {
      for (const wire of this.wires) {
        if (!wire.element) continue;

        const wireSourceNodeId = wire.fromNode?.nodeId;
        if (wireSourceNodeId === sourceNodeId) continue;  // Same source = allowed (fan-out)

        // Use pathPoints for direction info (preferred, fast path)
        if (wire.pathPoints && wire.pathPoints.length >= 2) {
          this._markWirePathPoints(wire.pathPoints, wireSourceNodeId);
        } else if (wire.occupiedCells && wire.occupiedCells.size > 0) {
          // Fallback: use occupiedCells without direction (treat as both h and v = fully blocked)
          for (const key of wire.occupiedCells) {
            if (this.blockedCells.get(key) !== 'component') {
              this._addWireCell(key, wireSourceNodeId, 'h');
              this._addWireCell(key, wireSourceNodeId, 'v');
            }
          }
        } else {
          // Last fallback: parse SVG DOM (slow path)
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

    // Mark channel assignments for other sources as blocked
    // This proactively prevents overlaps by giving each source its own column
    if (this.channelMap && sourceNodeId) {
      for (const [srcId, channelX] of this.channelMap) {
        if (srcId === sourceNodeId) continue;  // Our own channel = free to use
        const col = Math.round(channelX / this.gridSize);
        // Mark this entire column as blocked for vertical movement
        // but NOT for horizontal movement (crossing allowed)
        // We mark a vertical wall segment that spans a large Y range
        const yRange = 500; // large enough to cover the canvas
        for (let dy = -yRange; dy <= yRange; dy++) {
          const key = `${col},${dy}`;
          const existing = this.blockedCells.get(key);
          if (existing !== 'component') {
            this._addWireCell(key, srcId, 'v');
          }
        }
      }
    }
  }

  /**
   * Mark grid cells from pathPoints with direction info.
   * For each segment (pair of consecutive points), determines if horizontal or vertical
   * and marks each cell along the segment with the appropriate direction.
   */
  _markWirePathPoints(points, sourceNodeId) {
    const gs = this.gridSize;
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const isHorizontal = Math.abs(p2.y - p1.y) < 1;
      const isVertical = Math.abs(p2.x - p1.x) < 1;

      if (isHorizontal) {
        const y = Math.round(p1.y / gs);
        const x1 = Math.round(Math.min(p1.x, p2.x) / gs);
        const x2 = Math.round(Math.max(p1.x, p2.x) / gs);
        for (let x = x1; x <= x2; x++) {
          const key = `${x},${y}`;
          if (this.blockedCells.get(key) !== 'component') {
            this._addWireCell(key, sourceNodeId, 'h');
          }
        }
      } else if (isVertical) {
        const x = Math.round(p1.x / gs);
        const y1 = Math.round(Math.min(p1.y, p2.y) / gs);
        const y2 = Math.round(Math.max(p1.y, p2.y) / gs);
        for (let y = y1; y <= y2; y++) {
          const key = `${x},${y}`;
          if (this.blockedCells.get(key) !== 'component') {
            this._addWireCell(key, sourceNodeId, 'v');
          }
        }
      }
    }
  }

  /**
   * Add a wire occupancy record to a cell.
   * @param {string} key - Cell key "x,y"
   * @param {string} sourceNodeId - Source node ID of the wire
   * @param {string} direction - 'h' for horizontal, 'v' for vertical
   */
  _addWireCell(key, sourceNodeId, direction) {
    const existing = this.blockedCells.get(key);
    if (existing === 'component') return;

    if (!existing || !(existing instanceof Map)) {
      // Replace old Set-based format or empty cell with new Map format
      this.blockedCells.set(key, new Map([[sourceNodeId || 'unknown', new Set([direction])]]));
    } else {
      // existing is Map<sourceNodeId, Set<'h'|'v'>>
      const srcId = sourceNodeId || 'unknown';
      if (existing.has(srcId)) {
        existing.get(srcId).add(direction);
      } else {
        existing.set(srcId, new Set([direction]));
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
   * Mark grid cells along a wire segment with direction info.
   */
  _markWireSegment(seg, sourceNodeId) {
    const gs = this.gridSize;
    const isHorizontal = Math.abs(seg.y2 - seg.y1) < 1;
    const isVertical = Math.abs(seg.x2 - seg.x1) < 1;
    const direction = isHorizontal ? 'h' : (isVertical ? 'v' : null);
    if (!direction) return;

    if (isHorizontal) {
      const y = Math.round(seg.y1 / gs);
      const x1 = Math.round(Math.min(seg.x1, seg.x2) / gs);
      const x2 = Math.round(Math.max(seg.x1, seg.x2) / gs);
      for (let x = x1; x <= x2; x++) {
        const key = `${x},${y}`;
        if (this.blockedCells.get(key) !== 'component') {
          this._addWireCell(key, sourceNodeId, direction);
        }
      }
    } else if (isVertical) {
      const x = Math.round(seg.x1 / gs);
      const y1 = Math.round(Math.min(seg.y1, seg.y2) / gs);
      const y2 = Math.round(Math.max(seg.y1, seg.y2) / gs);
      for (let y = y1; y <= y2; y++) {
        const key = `${x},${y}`;
        if (this.blockedCells.get(key) !== 'component') {
          this._addWireCell(key, sourceNodeId, direction);
        }
      }
    }
  }

  /**
   * Check if a cell is blocked for the current wire traveling in a given direction.
   *
   * WALL MODEL: Wire segments act as walls.
   * - Component cells: always blocked
   * - Same source (fan-out): never blocked, regardless of direction
   * - Different source, SAME direction: BLOCKED (wall — cannot travel alongside)
   * - Different source, DIFFERENT direction: NOT blocked (crossing allowed)
   *
   * @param {number} x - Grid cell X
   * @param {number} y - Grid cell Y
   * @param {string} sourceNodeId - Current wire's source node ID
   * @param {string} direction - 'h' or 'v' — the direction the current wire would travel
   * @returns {boolean} True if the cell is blocked
   */
  _isBlocked(x, y, sourceNodeId, direction) {
    const key = `${x},${y}`;
    const val = this.blockedCells.get(key);
    if (val === 'component') return true;

    if (val instanceof Map) {
      // Direction-aware Map: Map<sourceNodeId, Set<'h'|'v'>>
      for (const [src, dirs] of val) {
        if (src === sourceNodeId) continue;  // Same source = fan-out, never blocked
        if (dirs.has(direction)) return true; // Same direction = WALL, BLOCKED
        // Different direction = crossing, allowed (not blocked)
      }
    } else if (val instanceof Set) {
      // Legacy format: Set of source IDs (no direction info)
      // Treat as fully blocked for different sources (conservative)
      for (const src of val) {
        if (src !== sourceNodeId) return true;
      }
    }

    return false;
  }

  /**
   * Check if a cell has a crossing (different-source wire in perpendicular direction).
   * Returns the number of crossing wires for cost calculation.
   * @param {number} x - Grid cell X
   * @param {number} y - Grid cell Y
   * @param {string} sourceNodeId - Current wire's source node ID
   * @param {string} direction - 'h' or 'v' — the direction the current wire would travel
   * @returns {number} Number of crossing wires at this cell
   */
  _countCrossings(x, y, sourceNodeId, direction) {
    const key = `${x},${y}`;
    const val = this.blockedCells.get(key);
    if (!(val instanceof Map)) return 0;

    let count = 0;
    for (const [src, dirs] of val) {
      if (src === sourceNodeId) continue;  // Same source = not a crossing
      // If the other wire has a direction different from ours, it's a crossing
      for (const d of dirs) {
        if (d !== direction) count++;
      }
    }
    return count;
  }

  /**
   * Check if a cell has a same-net wire (same source) for bus bundling bonus.
   * @param {number} x - Grid cell X
   * @param {number} y - Grid cell Y
   * @param {string} sourceNodeId - Current wire's source node ID
   * @returns {boolean} True if a same-net wire occupies this cell
   */
  _hasSameNetWire(x, y, sourceNodeId) {
    const key = `${x},${y}`;
    const val = this.blockedCells.get(key);
    if (!(val instanceof Map)) return false;

    return val.has(sourceNodeId);
  }

  /**
   * Check if an adjacent cell (±1 in the perpendicular direction) has a same-direction
   * wall from a different source. This discourages routing right next to a wall,
   * providing visual separation between wires.
   *
   * @param {number} x - Grid cell X
   * @param {number} y - Grid cell Y
   * @param {string} sourceNodeId - Current wire's source node ID
   * @param {string} direction - 'h' or 'v'
   * @returns {number} Number of adjacent same-direction walls (0, 1, or 2)
   */
  _countAdjacentWalls(x, y, sourceNodeId, direction) {
    let count = 0;
    if (direction === 'v') {
      // Check left and right neighbors for vertical walls
      for (const dx of [-1, 1]) {
        const key = `${x + dx},${y}`;
        const val = this.blockedCells.get(key);
        if (val instanceof Map) {
          for (const [src, dirs] of val) {
            if (src !== sourceNodeId && dirs.has('v')) { count++; break; }
          }
        }
      }
    } else {
      // Check above and below neighbors for horizontal walls
      for (const dy of [-1, 1]) {
        const key = `${x},${y + dy}`;
        const val = this.blockedCells.get(key);
        if (val instanceof Map) {
          for (const [src, dirs] of val) {
            if (src !== sourceNodeId && dirs.has('h')) { count++; break; }
          }
        }
      }
    }
    return count;
  }

  /**
   * A* search on the grid using a Binary MinHeap.
   * Direction-aware: prevents overlap (same-direction parallel) but allows crossings.
   *
   * @param {Object} start - Start cell {x, y}
   * @param {Object} end - End cell {x, y}
   * @param {string} sourceNodeId - Source node ID for correct fan-out handling
   * @param {Object} [opts] - Optional parameters
   */
  _astar(start, end, sourceNodeId = null, opts = {}) {
    const maxIterations = 80000;
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
      { dx: 1, dy: 0, dir: 'h' },
      { dx: -1, dy: 0, dir: 'h' },
      { dx: 0, dy: 1, dir: 'v' },
      { dx: 0, dy: -1, dir: 'v' }
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
        if (distToEnd <= 3) {
          let directClear = true;
          if (current.x !== end.x && current.y !== end.y) {
            // Need to go through an intermediate cell — check both paths
            const mid1Blocked_h = this._isBlocked(end.x, current.y, sourceNodeId, 'h');
            const mid1Blocked_v = this._isBlocked(end.x, current.y, sourceNodeId, 'v');
            const mid1Blocked = mid1Blocked_h && mid1Blocked_v;

            const mid2Blocked_h = this._isBlocked(current.x, end.y, sourceNodeId, 'h');
            const mid2Blocked_v = this._isBlocked(current.x, end.y, sourceNodeId, 'v');
            const mid2Blocked = mid2Blocked_h && mid2Blocked_v;

            if (mid1Blocked && mid2Blocked) directClear = false;
          } else if (current.x === end.x) {
            // Same column — check vertical movement to end
            directClear = !this._isBlocked(end.x, end.y, sourceNodeId, 'v');
          } else {
            // Same row — check horizontal movement to end
            directClear = !this._isBlocked(end.x, end.y, sourceNodeId, 'h');
          }
          if (directClear) {
            const tentativeG = currentG + distToEnd;
            const prevG = gScore.get(endKey) || Infinity;
            if (tentativeG < prevG) {
              cameFrom.set(endKey, currentKey);
              gScore.set(endKey, tentativeG);
              openHeap.push({ x: end.x, y: end.y, key: endKey, f: tentativeG + heuristic(end, end) });
            }
          }
        }
      }

      for (const dir of dirs) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        const nKey = `${nx},${ny}`;

        if (closedSet.has(nKey)) continue;

        // WALL MODEL: same-direction = BLOCKED, crossing = allowed
        if (this._isBlocked(nx, ny, sourceNodeId, dir.dir)) continue;

        // Multi-layer cost function
        let moveCost = 1;

        // --- Bend penalty: strongly prefer straight paths ---
        const parentKey = cameFrom.get(currentKey);
        if (parentKey) {
          const [px, py] = parentKey.split(',').map(Number);
          const prevDx = current.x - px;
          const prevDy = current.y - py;
          if (prevDx !== dir.dx || prevDy !== dir.dy) {
            moveCost += 4.0;  // High bend penalty for clean L/U-shaped paths
          }
        }

        // --- Near-obstacle penalty: clearance from components ---
        for (const [adx, ady] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const adjKey = `${nx + adx},${ny + ady}`;
          if (this.blockedCells.get(adjKey) === 'component') {
            moveCost += 2.5;  // Clearance from components
            break;
          }
        }

        // --- Wire crossing cost (perpendicular crossing with different-source wire) ---
        const crossingCount = this._countCrossings(nx, ny, sourceNodeId, dir.dir);
        if (crossingCount > 0) {
          moveCost += 4.0 * crossingCount;  // Strongly discourage crossings but don't block them
        }

        // --- Adjacent wall separation penalty ---
        // If we're right next to a same-direction wall from another source,
        // add a small penalty to encourage separation
        const adjacentWalls = this._countAdjacentWalls(nx, ny, sourceNodeId, dir.dir);
        if (adjacentWalls > 0) {
          moveCost += 1.5 * adjacentWalls;
        }

        // --- Same-net proximity bonus (bus bundling) ---
        if (this._hasSameNetWire(nx, ny, sourceNodeId)) {
          moveCost -= 0.5;  // Encourage same-net wires to bundle together
        }

        // --- Channel preference bonus ---
        // If we have a channel assignment, prefer routing through our channel
        if (this.channelMap && sourceNodeId) {
          const myChannel = this.channelMap.get(sourceNodeId);
          if (myChannel !== undefined) {
            const myChannelCol = Math.round(myChannel / this.gridSize);
            if (dir.dir === 'v' && nx === myChannelCol) {
              moveCost -= 0.3;  // Prefer our assigned vertical channel
            }
          }
        }

        // Ensure minimum cost is positive
        moveCost = Math.max(0.1, moveCost);

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
   * Smart fallback Manhattan routing when A* fails.
   * Tries multiple vertical and horizontal channel offsets to find
   * a path that minimizes same-direction overlaps with existing wires.
   */
  _smartFallbackPath(fromPos, toPos, sourceNodeId, opts = {}) {
    const gs = this.gridSize;
    const startX = fromPos.x;
    const startY = fromPos.y;
    const endX = toPos.x;
    const endY = toPos.y;

    const candidates = [];

    // --- Standard L-shaped and Z-shaped paths with offset channels ---
    const midXbase = startX + (endX - startX) / 2;

    // Try routing through different vertical channels
    for (let offset = -4; offset <= 4; offset++) {
      const channelX = this._snapToGrid(midXbase + offset * gs);

      // Skip channels that would be behind start or beyond end
      if (channelX < startX - gs || channelX > endX + gs * 4) continue;

      // L-shape: right → down/up → right
      if (endX > startX) {
        const path = `M ${startX} ${startY} L ${channelX} ${startY} L ${channelX} ${endY} L ${endX} ${endY}`;
        candidates.push(path);
      }

      // Reverse L: down/up → right → down/up
      if (Math.abs(endY - startY) > gs) {
        const midY = this._snapToGrid((startY + endY) / 2);
        const path = `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
        candidates.push(path);
      }
    }

    // --- Z-shape with top/bottom bus bar ---
    const busLevelBottom = opts.minClearY || Math.max(startY, endY) + 80;
    const busLevelTop = opts.maxClearY || Math.min(startY, endY) - 80;

    // Bottom bus bar
    candidates.push(
      `M ${startX} ${startY} L ${startX + gs} ${startY} L ${startX + gs} ${busLevelBottom} L ${endX - gs} ${busLevelBottom} L ${endX - gs} ${endY} L ${endX} ${endY}`
    );

    // Top bus bar
    if (busLevelTop > 0) {
      candidates.push(
        `M ${startX} ${startY} L ${startX + gs} ${startY} L ${startX + gs} ${busLevelTop} L ${endX - gs} ${busLevelTop} L ${endX - gs} ${endY} L ${endX} ${endY}`
      );
    }

    // --- Backward routing (source is to the right of destination) ---
    if (endX <= startX) {
      const rightOffset = gs * 3;
      const leftOffset = gs * 3;

      // Route right, then down/up, then left
      for (let offset = 0; offset <= 4; offset++) {
        const channelX = startX + rightOffset + offset * gs;
        candidates.push(
          `M ${startX} ${startY} L ${channelX} ${startY} L ${channelX} ${endY} L ${endX} ${endY}`
        );

        // Route left, then down/up, then right
        const channelX2 = startX - leftOffset - offset * gs;
        if (channelX2 > 0) {
          candidates.push(
            `M ${startX} ${startY} L ${channelX2} ${startY} L ${channelX2} ${endY} L ${endX} ${endY}`
          );
        }
      }

      // U-shape: bottom bus
      candidates.push(
        `M ${startX} ${startY} L ${startX + rightOffset} ${startY} L ${startX + rightOffset} ${busLevelBottom} L ${endX - rightOffset} ${busLevelBottom} L ${endX - rightOffset} ${endY} L ${endX} ${endY}`
      );
    }

    // --- Channel-assigned path ---
    if (this.channelMap && sourceNodeId) {
      const channelX = this.channelMap.get(sourceNodeId);
      if (channelX !== undefined) {
        candidates.push(
          `M ${startX} ${startY} L ${channelX} ${startY} L ${channelX} ${endY} L ${endX} ${endY}`
        );
      }
    }

    // Evaluate all candidates and pick the one with fewest same-direction overlaps
    let bestPath = null;
    let bestOverlapCount = Infinity;
    let bestLength = Infinity;

    for (const candidatePath of candidates) {
      const overlapCount = this._countPathOverlaps(candidatePath, sourceNodeId);
      const pathLength = this._estimatePathLength(candidatePath);

      // Prefer: 1) fewer overlaps, 2) shorter path
      if (overlapCount < bestOverlapCount ||
          (overlapCount === bestOverlapCount && pathLength < bestLength)) {
        bestOverlapCount = overlapCount;
        bestLength = pathLength;
        bestPath = candidatePath;
      }
    }

    return bestPath || this._fallbackPath(fromPos, toPos, opts);
  }

  /**
   * Snap a coordinate to the grid.
   */
  _snapToGrid(value) {
    return Math.round(value / this.gridSize) * this.gridSize;
  }

  /**
   * Estimate the total length of an SVG path.
   */
  _estimatePathLength(d) {
    const segments = this._parseSVGPath(d);
    let length = 0;
    for (const seg of segments) {
      length += Math.abs(seg.x2 - seg.x1) + Math.abs(seg.y2 - seg.y1);
    }
    return length;
  }

  /**
   * Count the number of same-direction overlaps between a candidate path
   * and existing wires from different sources.
   * This is used to evaluate fallback path candidates.
   *
   * @param {string} d - SVG path data string
   * @param {string} sourceNodeId - Current wire's source node ID
   * @returns {number} Number of same-direction overlap cells
   */
  _countPathOverlaps(d, sourceNodeId) {
    const gs = this.gridSize;
    let overlaps = 0;

    const segments = this._parseSVGPath(d);
    for (const seg of segments) {
      const isHorizontal = Math.abs(seg.y2 - seg.y1) < 1;
      const isVertical = Math.abs(seg.x2 - seg.x1) < 1;
      const direction = isHorizontal ? 'h' : (isVertical ? 'v' : null);
      if (!direction) continue;

      if (isHorizontal) {
        const y = Math.round(seg.y1 / gs);
        const x1 = Math.round(Math.min(seg.x1, seg.x2) / gs);
        const x2 = Math.round(Math.max(seg.x1, seg.x2) / gs);
        for (let x = x1; x <= x2; x++) {
          const key = `${x},${y}`;
          const val = this.blockedCells.get(key);
          if (val instanceof Map) {
            for (const [src, dirs] of val) {
              if (src === sourceNodeId) continue;
              if (dirs.has(direction)) overlaps++;
            }
          }
        }
      } else {
        const x = Math.round(seg.x1 / gs);
        const y1 = Math.round(Math.min(seg.y1, seg.y2) / gs);
        const y2 = Math.round(Math.max(seg.y1, seg.y2) / gs);
        for (let y = y1; y <= y2; y++) {
          const key = `${x},${y}`;
          const val = this.blockedCells.get(key);
          if (val instanceof Map) {
            for (const [src, dirs] of val) {
              if (src === sourceNodeId) continue;
              if (dirs.has(direction)) overlaps++;
            }
          }
        }
      }
    }

    return overlaps;
  }

  /**
   * Original fallback Manhattan routing (used as last resort).
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
        const topY = Math.min(startY, endY) - 40;
        if (maxClearY !== undefined && topY < maxClearY) {
          const bottomY = Math.max(minClearY !== undefined ? minClearY + 20 : Math.max(startY, endY) + 70, Math.max(startY, endY) + 40);
          return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${bottomY} L ${midX2} ${bottomY} L ${midX2} ${endY} L ${endX} ${endY}`;
        }
        return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${topY} L ${midX2} ${topY} L ${midX2} ${endY} L ${endX} ${endY}`;
      }
      return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
    } else {
      const offset = 40;

      const bottomLevel = Math.max(
        Math.max(startY, endY) + offset,
        minClearY !== undefined ? minClearY + 20 : 0
      ) + 30;

      const topLevel = maxClearY !== undefined
        ? Math.min(startY, endY) - offset - 30
        : Math.min(startY, endY) - offset - 30;

      const bottomPathLength = Math.abs(startY - bottomLevel) + Math.abs(endY - bottomLevel) + Math.abs(startX + offset - (endX - offset));
      const topPathLength = (maxClearY !== undefined)
        ? Infinity
        : Math.abs(startY - topLevel) + Math.abs(endY - topLevel) + Math.abs(startX + offset - (endX - offset));

      const busLevel = topPathLength < bottomPathLength ? topLevel : bottomLevel;

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
 */
export class ObstacleCache {
  constructor(gridSize) {
    this.gridSize = gridSize;
    this.componentGrid = new Map();
    this._version = 0;
  }

  /**
   * Rebuild the component obstacle grid from the current component list.
   */
  rebuildComponentGrid(components) {
    this.componentGrid.clear();
    const gs = this.gridSize;

    for (const comp of components) {
      if (!comp.element) continue;

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
