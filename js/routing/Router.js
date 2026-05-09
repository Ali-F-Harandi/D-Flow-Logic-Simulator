/**
 * Router.js — Clean Routing Strategy Container
 *
 * Three deterministic routing modes (no A*, no Grid, no Bitmask):
 *
 *   Direct   — straight line from source to target
 *   Manhattan — orthogonal path with 90° bends, channel assignment, step-back
 *   Manual   — user-defined control points, wire follows them exactly
 *
 * Performance: O(1) per wire for Direct/Manhattan, O(n) for Manual
 * where n = number of control points.  No search, no iteration.
 *
 * Integration: inject a Router instance into CanvasWiring / Wire.render().
 */

import { GRID_SIZE } from '../config.js';

export class Router {

  /* ───────── Constructor ───────── */

  /**
   * @param {Object}  [config]
   * @param {number}  [config.gridSize]  – Grid cell size (default GRID_SIZE)
   * @param {number}  [config.stepBack]  – Step-back offset in grid cells (default 1)
   */
  constructor(config = {}) {
    this.gridSize = config.gridSize || GRID_SIZE;
    this.stepBack = config.stepBack ?? 1;      // 1 grid-cell horizontal offset from source
  }

  /* ───────── Route Dispatcher ───────── */

  /**
   * Route a wire from source to target using the specified mode.
   *
   * @param {{x:number,y:number}} fromPos  – Source connector position (px)
   * @param {{x:number,y:number}} toPos    – Target connector position (px)
   * @param {'direct'|'manhattan'|'manual'} mode
   * @param {Object} [opts]                – Mode-specific options
   * @returns {Array<{x:number,y:number}>} Ordered path points
   */
  route(fromPos, toPos, mode, opts = {}) {
    switch (mode) {
      case 'direct':   return this.routeDirect(fromPos, toPos);
      case 'manhattan': return this.routeManhattan(fromPos, toPos, opts);
      case 'manual':   return this.routeManual(fromPos, toPos, opts.controlPoints || []);
      default:         return this.routeManhattan(fromPos, toPos, opts);
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
   *  MANHATTAN STRATEGY
   * ================================================================ */

  /**
   * Orthogonal path with 90° bends.
   *
   * Handles four cases:
   *   1. Source LEFT of target  → Z-shape through vertical channel
   *   2. Source RIGHT of target → U-shape around (bus bar routing)
   *   3. Vertical alignment     → straight vertical line
   *   4. Step-back              → short horizontal segment before turning
   *      (prevents wires overlapping component borders)
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
    const sb = this.stepBack * gs;           // step-back in pixels

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
      // Determine vertical channel X
      let channelX;
      if (opts.channelX !== undefined) {
        channelX = opts.channelX;
      } else {
        // Default: midpoint snapped to grid
        channelX = this.snapToGrid((sx + tx) / 2);
      }
      // Clamp channel between source + step-back and target - step-back
      channelX = Math.max(sx + sb, Math.min(tx - sb, channelX));
      // Re-snap after clamping
      channelX = this.snapToGrid(channelX);

      return [
        { x: sx,       y: sy },       // source
        { x: channelX, y: sy },       // → horizontal to channel
        { x: channelX, y: ty },       // ↓ vertical in channel
        { x: tx,       y: ty }        // → horizontal to target
      ];
    }

    /* ── Case 2: Source RIGHT of target (backward routing) ── */
    // U-shape: step-back right → down to bus → left → up to target
    const sbx = this.snapToGrid(sx + sb);          // step-back X from source
    const tbx = this.snapToGrid(Math.max(tx - sb, gs)); // step-back X into target

    // Local bus bar computation: compute Y just below the lowest of the two wire endpoints
    // with minimum clearance, instead of always going to the global bus bar.
    const localBusClearance = sb * 2;  // minimum clearance below the lowest endpoint
    const localBusY = this.snapToGrid(Math.max(sy, ty) + localBusClearance);

    // Choose bus level: local bus bar, global bottom bus, or top bus (pick shorter route)
    const bottomBusY = opts.busY ?? localBusY;
    const topBusY    = opts.topY ?? (Math.min(sy, ty) - sb * 3);

    const bottomDist = Math.abs(sy - bottomBusY) + Math.abs(ty - bottomBusY);
    const topDist    = topBusY > gs
      ? Math.abs(sy - topBusY) + Math.abs(ty - topBusY)
      : Infinity;

    const routeY = (topDist < bottomDist && topBusY > gs) ? topBusY : bottomBusY;

    return [
      { x: sx,  y: sy },            // source
      { x: sbx, y: sy },            // → step-back right
      { x: sbx, y: routeY },        // ↓ vertical to bus
      { x: tbx, y: routeY },        // ← horizontal on bus
      { x: tbx, y: ty },            // ↑ vertical to target row
      { x: tx,  y: ty }             // ← step into target
    ];
  }

  /* ================================================================
   *  MANUAL STRATEGY
   * ================================================================ */

  /**
   * Path follows user-defined control points exactly.
   * Source → cp[0] → cp[1] → … → cp[n-1] → Target
   *
   * @param {{x:number,y:number}} fromPos
   * @param {{x:number,y:number}} toPos
   * @param {Array<{x:number,y:number}>} controlPoints
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
   *  CHANNEL ASSIGNMENT
   * ================================================================ */

  /**
   * Assign exclusive vertical channel columns to wire sources.
   * Prevents multiple sources from overlapping in the same column.
   *
   * Midpoint-based channel assignment: computes each source's channel
   * at the midpoint between its source and target, then resolves
   * conflicts by nudging apart.
   *
   * @param {Array}    wires       – Wire objects
   * @param {Function} getPosition – nodeId → {x,y} | null
   * @returns {Map<string,number>} sourceNodeId → channelX (px)
   */
  assignChannels(wires, getPosition) {
    const gs = this.gridSize;
    const channelMap   = new Map();
    const usedChannels = new Set();
    const channelSpacing = 2;    // grid cells between adjacent channels

    // Collect unique sources with their positions and midpoint info
    const sourceInfos = new Map();
    for (const wire of wires) {
      const srcId = wire.fromNode.nodeId;
      if (sourceInfos.has(srcId)) continue;
      const srcPos = getPosition(srcId);
      if (!srcPos) continue;

      // Compute midpoint between source and its first target for better channel placement
      const tgtPos = getPosition(wire.toNode.nodeId);
      let midX;
      if (tgtPos) {
        midX = (srcPos.x + tgtPos.x) / 2;
      } else {
        midX = srcPos.x + 2 * gs;
      }

      sourceInfos.set(srcId, { x: srcPos.x, y: srcPos.y, midX });
    }

    // Sort by midpoint X (left-to-right) for natural channel assignment
    const sorted = [...sourceInfos.entries()].sort((a, b) => {
      const dx = a[1].midX - b[1].midX;
      return dx !== 0 ? dx : a[1].y - b[1].y;
    });

    for (const [srcId, info] of sorted) {
      // Preferred channel: midpoint X snapped to grid
      const preferredCol = Math.round(info.midX / gs);
      let channelCol = preferredCol;

      // Find nearest available column (try both directions)
      let offset = 0;
      let direction = 1;
      while (usedChannels.has(channelCol)) {
        offset++;
        direction = offset % 2 === 1 ? 1 : -1;
        channelCol = preferredCol + Math.ceil(offset / 2) * direction * channelSpacing;
      }

      channelMap.set(srcId, channelCol * gs);   // store as pixels
      usedChannels.add(channelCol);
    }

    return channelMap;
  }

  /* ================================================================
   *  SVG PATH GENERATION
   * ================================================================ */

  /**
   * Convert an array of {x,y} points into an SVG path "d" attribute.
   * Uses M (MoveTo) for first point, L (LineTo) for the rest.
   *
   * @param {Array<{x:number,y:number}>} points
   * @returns {string} SVG path data string, e.g. "M 10 20 L 30 20 L 30 40"
   */
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

  /** Snap a single coordinate to the nearest grid line. */
  snapToGrid(value) {
    return Math.round(value / this.gridSize) * this.gridSize;
  }

  /** Snap a {x,y} point to the nearest grid intersection. */
  snapPoint(point) {
    return {
      x: this.snapToGrid(point.x),
      y: this.snapToGrid(point.y)
    };
  }
}
