/**
 * Router.js — Unified Routing Strategy Container (Enhanced)
 *
 * Four routing modes:
 *   Direct    — straight line from source to target
 *   Manhattan — orthogonal path with 90° bends (heuristic)
 *   A*        — grid-based A* pathfinding with obstacle avoidance (NEW)
 *   Manual    — user-defined control points, wire follows them exactly
 *
 * The A* mode uses StarRouter for automatic obstacle-avoiding routing,
 * with fallback to Manhattan heuristic if A* fails or times out.
 * After routing, the WireNudger offsets overlapping parallel segments.
 *
 * Integration: inject a Router instance into CanvasWiring / Wire.render().
 */

import { GRID_SIZE, ASTAR_BEND_PENALTY, ASTAR_WIRE_PENALTY, ASTAR_MAX_ITERATIONS, ASTAR_STEP_BACK, WIRE_NUDGE_SPACING, WIRE_NUDGE_MAX } from '../config.js';
import { StarRouter } from './StarRouter.js';
import { WireNudger } from './WireNudger.js';
import { OccupancyGrid } from './OccupancyGrid.js';

export class Router {

  /* ───────── Constructor ───────── */

  /**
   * @param {Object}  [config]
   * @param {number}  [config.gridSize]  – Grid cell size (default GRID_SIZE)
   * @param {number}  [config.stepBack]  – Step-back offset in grid cells (default 1)
   * @param {boolean} [config.useAStar]  – Enable A* routing (default true)
   * @param {boolean} [config.useNudging]– Enable wire nudging (default true)
   */
  constructor(config = {}) {
    this.gridSize = config.gridSize || GRID_SIZE;
    this.stepBack = config.stepBack ?? 1;
    this.useAStar  = config.useAStar  ?? true;
    this.useNudging = config.useNudging ?? true;

    // ─── A* Router (new) ───
    this._occupancyGrid = new OccupancyGrid({ gridSize: this.gridSize });
    this._starRouter = new StarRouter({
      grid: this._occupancyGrid,
      gridSize: this.gridSize,
      bendPenalty: ASTAR_BEND_PENALTY,
      wirePenalty: ASTAR_WIRE_PENALTY,
      maxIterations: ASTAR_MAX_ITERATIONS,
      stepBack: ASTAR_STEP_BACK
    });

    // ─── Wire Nudger (new) ───
    this._nudger = new WireNudger({
      gridSize: this.gridSize,
      wireSpacing: WIRE_NUDGE_SPACING,
      maxNudge: WIRE_NUDGE_MAX
    });

    // Track whether grid is built
    this._gridBuilt = false;

    // Routing stats
    this._lastStats = null;
  }

  /* ───────── Route Dispatcher ───────── */

  /**
   * Route a wire from source to target using the specified mode.
   *
   * @param {{x:number,y:number}} fromPos  – Source connector position (px)
   * @param {{x:number,y:number}} toPos    – Target connector position (px)
   * @param {'direct'|'manhattan'|'manual'|'astar'} mode
   * @param {Object} [opts]                – Mode-specific options
   * @returns {Array<{x:number,y:number}>} Ordered path points
   */
  route(fromPos, toPos, mode, opts = {}) {
    switch (mode) {
      case 'direct':   return this.routeDirect(fromPos, toPos);
      case 'manhattan': return this.routeManhattan(fromPos, toPos, opts);
      case 'manual':   return this.routeManual(fromPos, toPos, opts.controlPoints || []);
      case 'astar':    return this.routeAStar(fromPos, toPos, opts);
      default:
        // Default: use A* if enabled, otherwise Manhattan
        if (this.useAStar && this._gridBuilt) {
          return this.routeAStar(fromPos, toPos, opts);
        }
        return this.routeManhattan(fromPos, toPos, opts);
    }
  }

  /* ================================================================
   *  DIRECT STRATEGY
   * ================================================================ */

  /**
   * Straight line: source → target.  Exactly 2 points.
   */
  routeDirect(fromPos, toPos) {
    return [
      { x: fromPos.x, y: fromPos.y },
      { x: toPos.x,   y: toPos.y   }
    ];
  }

  /* ================================================================
   *  MANHATTAN STRATEGY (Heuristic)
   * ================================================================ */

  /**
   * Orthogonal path with 90° bends.
   *
   * Handles four cases:
   *   1. Source LEFT of target  → Z-shape through vertical channel
   *   2. Source RIGHT of target → U-shape around (bus bar routing)
   *   3. Vertical alignment     → straight vertical line
   *   4. Step-back              → short horizontal segment before turning
   *
   * @param {{x:number,y:number}} fromPos
   * @param {{x:number,y:number}} toPos
   * @param {Object}  [opts]
   * @param {number}  [opts.channelX] – Assigned vertical channel X (px)
   * @param {number}  [opts.busY]     – Y level for backward routing (px)
   * @param {number}  [opts.topY]     – Y level for top-side routing (px)
   * @returns {Array<{x:number,y:number}>}
   */
  routeManhattan(fromPos, toPos, opts = {}) {
    const gs = this.gridSize;
    const sb = this.stepBack * gs;

    const sx = fromPos.x, sy = fromPos.y;
    const tx = toPos.x,   ty = toPos.y;

    /* ── Case 3: Vertical alignment (same column) ── */
    if (Math.abs(sx - tx) < gs * 0.5) {
      return [
        { x: sx, y: sy },
        { x: tx, y: ty }
      ];
    }

    /* ── Case 1: Source LEFT of target (normal direction) ── */
    if (sx < tx) {
      let channelX;
      if (opts.channelX !== undefined) {
        channelX = opts.channelX;
      } else {
        channelX = this.snapToGrid((sx + tx) / 2);
      }
      channelX = Math.max(sx + sb, Math.min(tx - sb, channelX));
      channelX = this.snapToGrid(channelX);

      if (Math.abs(sy - ty) < gs * 0.5) {
        return [
          { x: sx, y: sy },
          { x: tx, y: ty }
        ];
      }

      return [
        { x: sx,       y: sy },
        { x: channelX, y: sy },
        { x: channelX, y: ty },
        { x: tx,       y: ty }
      ];
    }

    /* ── Case 2: Source RIGHT of target (backward routing) ── */
    const sbx = this.snapToGrid(sx + sb);
    const tbx = this.snapToGrid(Math.max(tx - sb, gs));

    const localBusClearance = sb * 2;
    const localBusY = this.snapToGrid(Math.max(sy, ty) + localBusClearance);

    const bottomBusY = opts.busY ?? localBusY;
    const topBusY    = opts.topY ?? (Math.min(sy, ty) - sb * 3);

    const bottomDist = Math.abs(sy - bottomBusY) + Math.abs(ty - bottomBusY);
    const topDist    = topBusY > gs
      ? Math.abs(sy - topBusY) + Math.abs(ty - topBusY)
      : Infinity;

    const routeY = (topDist < bottomDist && topBusY > gs) ? topBusY : bottomBusY;

    const horizontalGap = sx - tx;
    if (horizontalGap < sb * 4 && Math.abs(sy - ty) >= gs) {
      const midY = this.snapToGrid((sy + ty) / 2);
      return [
        { x: sx,  y: sy },
        { x: sbx, y: sy },
        { x: sbx, y: midY },
        { x: tbx, y: midY },
        { x: tbx, y: ty },
        { x: tx,  y: ty }
      ];
    }

    return [
      { x: sx,  y: sy },
      { x: sbx, y: sy },
      { x: sbx, y: routeY },
      { x: tbx, y: routeY },
      { x: tbx, y: ty },
      { x: tx,  y: ty }
    ];
  }

  /* ================================================================
   *  A* STRATEGY (New - Obstacle-Avoiding Pathfinding)
   * ================================================================ */

  /**
   * Route using A* pathfinding on the occupancy grid.
   * Falls back to Manhattan heuristic if A* fails.
   *
   * @param {{x:number,y:number}} fromPos
   * @param {{x:number,y:number}} toPos
   * @param {Object} [opts]
   * @param {string} [opts.sourceNodeId] - Source node ID for pin passability
   * @param {string} [opts.targetNodeId] - Target node ID for pin passability
   * @param {number} [opts.channelX]     - Preferred channel X (fallback hint)
   * @param {number} [opts.busY]         - Bus Y (fallback hint)
   * @param {number} [opts.topY]         - Top Y (fallback hint)
   * @returns {Array<{x:number,y:number}>}
   */
  routeAStar(fromPos, toPos, opts = {}) {
    if (!this._gridBuilt) {
      // Grid not built yet — fall back to Manhattan
      return this.routeManhattan(fromPos, toPos, opts);
    }

    const points = this._starRouter.route(fromPos, toPos, opts);
    this._lastStats = this._starRouter.getLastStats();

    return points;
  }

  /* ================================================================
   *  MANUAL STRATEGY
   * ================================================================ */

  /**
   * Path follows user-defined control points exactly.
   * Source → cp[0] → cp[1] → … → cp[n-1] → Target
   */
  routeManual(fromPos, toPos, controlPoints) {
    const points = [{ x: fromPos.x, y: fromPos.y }];
    for (const cp of controlPoints) {
      points.push({ x: cp.x, y: cp.y });
    }
    points.push({ x: toPos.x, y: toPos.y });
    return points;
  }

  /* ================================================================
   *  Grid Management (New)
   * ================================================================ */

  /**
   * Rebuild the occupancy grid from components and wires.
   * Must be called before A* routing can work.
   *
   * @param {Array} components
   * @param {Array} wires
   * @param {Function} getPosition - nodeId → {x,y} | null
   */
  rebuildGrid(components, wires, getPosition) {
    this._starRouter.rebuildGrid(components, wires, getPosition);
    this._gridBuilt = true;
  }

  /**
   * Update grid for a moved component.
   */
  updateComponentOnGrid(comp, oldPos, getPosition) {
    if (!this._gridBuilt) return;
    this._starRouter.updateComponent(comp, oldPos, getPosition);
  }

  /**
   * Re-mark all wires on the grid.
   */
  remarkWiresOnGrid(wires) {
    if (!this._gridBuilt) return;
    this._starRouter.remarkWires(wires);
  }

  /**
   * Get the occupancy grid (for external access).
   */
  getOccupancyGrid() {
    return this._occupancyGrid;
  }

  /**
   * Get the A* router (for external access).
   */
  getStarRouter() {
    return this._starRouter;
  }

  /* ================================================================
   *  Wire Nudging (New)
   * ================================================================ */

  /**
   * Nudge overlapping parallel wire segments apart.
   * Should be called after all wires are routed.
   *
   * @param {Array<Wire>} wires
   * @returns {number} Number of segments nudged
   */
  nudgeWires(wires) {
    if (!this.useNudging) return 0;
    return this._nudger.nudge(wires);
  }

  /* ================================================================
   *  CHANNEL ASSIGNMENT
   * ================================================================ */

  /**
   * Assign exclusive vertical channel columns to wire sources.
   * Prevents multiple sources from overlapping in the same column.
   *
   * @param {Array}    wires       – Wire objects
   * @param {Function} getPosition – nodeId → {x,y} | null
   * @returns {Map<string,number>} sourceNodeId → channelX (px)
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

  /* ================================================================
   *  SVG PATH GENERATION
   * ================================================================ */

  static generateSVGPath(points) {
    if (!points || points.length < 2) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  }

  /* ================================================================
   *  GRID SNAPPING
   * ================================================================ */

  snapToGrid(value) {
    return Math.round(value / this.gridSize) * this.gridSize;
  }

  snapPoint(point) {
    return {
      x: this.snapToGrid(point.x),
      y: this.snapToGrid(point.y)
    };
  }

  /* ================================================================
   *  Statistics
   * ================================================================ */

  getLastStats() { return this._lastStats; }
  getGridStats() { return this._occupancyGrid.getStats(); }
}
