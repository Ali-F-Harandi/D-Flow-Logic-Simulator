import { GRID_SIZE } from '../config.js';

/**
 * A* Wire Router — computes Manhattan-routed paths that avoid
 * overlapping with components and other wires.
 *
 * Key features:
 * - Uses A* pathfinding on a grid aligned to GRID_SIZE
 * - Component bounding boxes are marked as blocked areas
 *   (expanded by 1 grid cell on all 4 sides)
 * - Existing wire segments from DIFFERENT sources are blocked
 *   (wires from the same source can share path segments)
 * - Crossing (perpendicular intersection) is allowed
 * - Manhattan-distance heuristic for optimal routing
 * - Output path uses only horizontal and vertical segments
 */
export class AStarRouter {
  /**
   * @param {Array} components - Array of component objects with position and element
   * @param {Array} wires - Array of visual wire objects with fromNode/toNode
   * @param {Object} positionCache - For getting connector positions
   * @param {Object} engine - For looking up component by node ID
   */
  constructor(components, wires, positionCache, engine) {
    this.components = components;
    this.wires = wires;
    this.positionCache = positionCache;
    this.engine = engine;
    this.gridSize = GRID_SIZE;
    this.blockedCells = new Map();  // "x,y" -> Set<sourceNodeId> or 'component'
  }

  /**
   * Compute an A*-routed path between two connector positions.
   * @param {Object} fromPos - {x, y} scene coordinates of source connector
   * @param {Object} toPos - {x, y} scene coordinates of target connector
   * @param {string} [sourceNodeId] - The output node ID of the source (for overlap checking)
   * @param {Object} [opts] - Optional parameters
   * @param {number} [opts.minClearY] - Y level below all components (fallback bus bar)
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

    // Run A* search
    const path = this._astar(startCell, endCell);

    if (path && path.length >= 2) {
      // Convert grid path to scene coordinates and build SVG path
      return this._pathToSVG(path, fromPos, toPos);
    }

    // Fallback: use simple Manhattan routing if A* fails
    return this._fallbackPath(fromPos, toPos, opts);
  }

  /**
   * Build the blocked cell grid from components and existing wires.
   * @param {string} sourceNodeId - The current wire's source node ID
   *   (wires from the same source are NOT blocked)
   */
  _buildBlockedGrid(sourceNodeId) {
    this.blockedCells.clear();
    const gs = this.gridSize;

    // Mark component bounding boxes as blocked (expanded by 1 cell on all sides)
    for (const comp of this.components) {
      if (!comp.element) continue;
      const x1 = Math.floor(comp.position.x / gs) - 1;
      const y1 = Math.floor(comp.position.y / gs) - 1;
      const x2 = Math.ceil((comp.position.x + comp.element.offsetWidth) / gs) + 1;
      const y2 = Math.ceil((comp.position.y + comp.element.offsetHeight) / gs) + 1;

      for (let x = x1; x <= x2; x++) {
        for (let y = y1; y <= y2; y++) {
          const key = `${x},${y}`;
          this.blockedCells.set(key, 'component');
        }
      }
    }

    // Mark existing wire segments as blocked (only from different sources)
    // A wire from the same source can share path segments (fan-out)
    if (this.wires && sourceNodeId) {
      for (const wire of this.wires) {
        if (!wire.element) continue;

        // Get the source node ID for this wire
        const wireSourceNodeId = wire.fromNode?.nodeId;
        if (wireSourceNodeId === sourceNodeId) continue;  // Same source = allowed

        // Parse the wire's visual path to find occupied grid cells
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
        // Handle additional coordinate pairs
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
   * Only marks cells where the wire runs parallel (not perpendicular crossing).
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
      // Blocked if any wire from a different source occupies this cell
      // (wires from the same source can share cells = fan-out)
      for (const src of val) {
        if (src !== sourceNodeId) return true;
      }
    }
    return false;
  }

  /**
   * A* search on the grid.
   * Returns array of {x, y} grid cells from start to end, or null if no path found.
   */
  _astar(start, end) {
    const gs = this.gridSize;
    const maxIterations = 20000;
    const openSet = new Map();   // key -> node
    const closedSet = new Set(); // key
    const gScore = new Map();    // key -> cost
    const fScore = new Map();    // key -> estimated total cost
    const cameFrom = new Map();  // key -> parent key

    const startKey = `${start.x},${start.y}`;
    const endKey = `${end.x},${end.y}`;

    const heuristic = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

    gScore.set(startKey, 0);
    fScore.set(startKey, heuristic(start, end));
    openSet.set(startKey, { ...start, key: startKey });

    // Direction penalties: prefer moving in the same direction (fewer bends)
    // and prefer routing down/right over up/left (more natural for left-to-right circuits)
    const dirs = [
      { dx: 1, dy: 0, name: 'right' },   // prefer right
      { dx: 0, dy: 1, name: 'down' },     // prefer down
      { dx: -1, dy: 0, name: 'left' },
      { dx: 0, dy: -1, name: 'up' }
    ];

    let iterations = 0;
    while (openSet.size > 0 && iterations < maxIterations) {
      iterations++;

      // Find node with lowest fScore in openSet
      let currentKey = null;
      let lowestF = Infinity;
      for (const [key, node] of openSet) {
        const f = fScore.get(key) || Infinity;
        if (f < lowestF) {
          lowestF = f;
          currentKey = key;
        }
      }

      if (currentKey === endKey) {
        // Reconstruct path
        return this._reconstructPath(cameFrom, currentKey);
      }

      const current = openSet.get(currentKey);
      openSet.delete(currentKey);
      closedSet.add(currentKey);

      const currentG = gScore.get(currentKey) || 0;

      // Check if we can jump directly to end (if unblocked and within reasonable distance)
      if (!closedSet.has(endKey)) {
        const distToEnd = heuristic(current, end);
        if (distToEnd <= 2) {
          // Try direct connection if cells between are clear
          let directClear = true;
          if (current.x !== end.x && current.y !== end.y) {
            // Need an L-shaped path — check intermediate cells
            const mid1Key = `${end.x},${current.y}`;
            const mid2Key = `${current.x},${end.y}`;
            const mid1Blocked = this._isBlocked(end.x, current.y, null);
            const mid2Blocked = this._isBlocked(current.x, end.y, null);
            if (mid1Blocked && mid2Blocked) directClear = false;
          }
          if (directClear) {
            // Add end to path
            const tentativeG = currentG + distToEnd;
            const prevG = gScore.get(endKey) || Infinity;
            if (tentativeG < prevG) {
              cameFrom.set(endKey, currentKey);
              gScore.set(endKey, tentativeG);
              fScore.set(endKey, tentativeG + 0);
              if (!openSet.has(endKey)) {
                openSet.set(endKey, { ...end, key: endKey });
              }
            }
          }
        }
      }

      for (const dir of dirs) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        const nKey = `${nx},${ny}`;

        if (closedSet.has(nKey)) continue;
        if (this._isBlocked(nx, ny, null)) continue;

        // Small direction penalty to prefer right/down and reduce bends
        let moveCost = 1;
        const parentKey = cameFrom.get(currentKey);
        if (parentKey) {
          const [px, py] = parentKey.split(',').map(Number);
          const prevDx = current.x - px;
          const prevDy = current.y - py;
          // Penalty for changing direction (encourages straighter paths)
          if (prevDx !== dir.dx || prevDy !== dir.dy) {
            moveCost += 0.1;  // Small bend penalty
          }
        }

        const tentativeG = currentG + moveCost;
        const prevG = gScore.get(nKey) || Infinity;

        if (tentativeG < prevG) {
          cameFrom.set(nKey, currentKey);
          gScore.set(nKey, tentativeG);
          fScore.set(nKey, tentativeG + heuristic({ x: nx, y: ny }, end));
          if (!openSet.has(nKey)) {
            openSet.set(nKey, { x: nx, y: ny, key: nKey });
          }
        }
      }
    }

    // No path found
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
   * Simplifies the path by removing unnecessary waypoints
   * (collinear points are merged into single line segments).
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
      // Check if points are collinear
      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;
      if (dx1 !== dx2 || dy1 !== dy2) {
        simplified.push(curr);
      }
    }
    simplified.push(path[path.length - 1]);

    // Build SVG path from simplified points
    // Use exact connector positions for start/end, grid positions for intermediate
    let d = `M ${fromPos.x} ${fromPos.y}`;
    for (let i = 1; i < simplified.length - 1; i++) {
      d += ` L ${simplified[i].x * gs} ${simplified[i].y * gs}`;
    }
    d += ` L ${toPos.x} ${toPos.y}`;

    return d;
  }

  /**
   * Fallback Manhattan routing when A* fails.
   * Uses the same logic as the original Wire.computePath.
   */
  _fallbackPath(fromPos, toPos, opts = {}) {
    const startX = fromPos.x;
    const startY = fromPos.y;
    const endX = toPos.x;
    const endY = toPos.y;
    const { minClearY } = opts;

    if (endX >= startX + 20) {
      const midX = startX + (endX - startX) / 2;
      return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
    } else if (endX >= startX - 10) {
      const midX = startX + 30;
      const midX2 = endX - 30;
      if (Math.abs(endY - startY) < 20) {
        const arcY = Math.min(startY, endY) - 40;
        return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${arcY} L ${midX2} ${arcY} L ${midX2} ${endY} L ${endX} ${endY}`;
      }
      return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
    } else {
      const offset = 40;
      let busLevel = Math.max(startY, endY) + offset;
      if (minClearY !== undefined) {
        busLevel = Math.max(busLevel, minClearY + 20);
      } else {
        busLevel += 30;
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
