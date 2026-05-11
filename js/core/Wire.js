/**
 * Wire.js — Data Model for a circuit wire connection (Enhanced)
 *
 * Each wire stores:
 *   - sourceNode / targetNode : the connected node references
 *   - routingMode             : 'direct' | 'manhattan' | 'manual' | 'bezier'
 *   - controlPoints           : user-defined intermediate points (Manual mode)
 *   - pathPoints              : the computed / rendered path points
 *   - isAutoRouted            : whether this wire was auto-routed by A*
 *
 * Enhancements over original:
 *   - Glow effect layer for preview/drawing mode
 *   - Hover highlight with endpoint indicators
 *   - Smooth miter joints at corners
 *   - Error state visual (red glow for invalid connections)
 *   - Wire state label (auto/manual/locked) as tooltip
 *   - isAutoRouted flag for selective re-routing
 *
 * Rendering is separated from routing:
 *   - Routing → Wire.computePathPoints(router, opts) → pathPoints[]
 *   - Rendering → Wire._applyPathPointsToSVG() → SVG "d" attribute
 */

import {
  WIRE_VISUAL_WIDTH, WIRE_HIT_WIDTH, JUNCTION_RADIUS, GRID_SIZE,
  WIRE_DRAW_GLOW_COLOR, WIRE_DRAW_GLOW_WIDTH, WIRE_ERROR_COLOR,
  WIRE_BEZIER_CONTROL_FACTOR, WIRE_BEZIER_MIN_CONTROL, WIRE_BEZIER_MAX_CONTROL,
  WIRE_DEFAULT_ROUTING_MODE
} from '../config.js';
import { ComponentLayoutPolicy } from './ComponentLayoutPolicy.js';

export class Wire {

  /* ─── Routing Mode Constants ─── */
  static MODE_DIRECT   = 'direct';
  static MODE_MANHATTAN = 'manhattan';
  static MODE_MANUAL   = 'manual';
  static MODE_BEZIER   = 'bezier';

  /* ================================================================
   *  Constructor
   * ================================================================ */

  constructor(id, sourceNode, targetNode, routingMode = Wire.MODE_BEZIER) {
    this.id           = id;
    this.sourceNode   = sourceNode;           // { nodeId }
    this.targetNode   = targetNode;           // { nodeId }
    this.routingMode  = routingMode;
    this.controlPoints = [];                  // Manual-mode intermediate points [{x,y}]
    this.pathPoints   = [];                   // Computed path [{x,y}]
    this.element      = null;                 // SVG <g> group
    this.engineId     = null;                 // Link to Engine wire ID
    this.occupiedCells = new Set();           // Legacy compat (no longer critical)
    this._isLocked    = false;
    this._controlHandlesVisible = false;
    this._lastSourceValue = undefined;        // For signal transition detection

    // ─── New: Auto-route tracking ───
    this.isAutoRouted = (routingMode === Wire.MODE_MANHATTAN || routingMode === Wire.MODE_BEZIER);
    this._routedMethod = routingMode === Wire.MODE_BEZIER ? 'bezier' : 'manhattan'; // 'bezier' | 'manhattan' | 'astar' | 'fallback'
    this._isRoutingFallback = false;          // True when A* failed and fell back

    // ─── New: Visual states ───
    this._isHovered   = false;
    this._isError     = false;
    this._isGlowing   = false;

    // Feature 5: Component lookup for facing-aware port directions
    this._compLookup  = null;
  }

  /* ─── Backward Compatibility Aliases ─── */

  get fromNode() { return this.sourceNode; }
  set fromNode(v) { this.sourceNode = v; }
  get toNode()   { return this.targetNode; }
  set toNode(v)  { this.targetNode = v; }

  get isManualMode() { return this.routingMode === Wire.MODE_MANUAL; }

  get isLocked()  { return this._isLocked; }

  get isRoutingFallback() { return this._isRoutingFallback; }

  /**
   * Mark this wire as having used a fallback routing method.
   * Applies a visual indicator (dashed red) and updates tooltip.
   */
  setRoutingFallback(isFallback) {
    this._isRoutingFallback = isFallback;
    if (!this.element) return;
    const visualPath = this.element.querySelector('.wire-visual');
    if (visualPath) {
      if (isFallback) {
        visualPath.classList.add('routing-fallback');
      } else {
        visualPath.classList.remove('routing-fallback');
      }
    }
    this._updateTooltip();
  }

  get wireState() {
    if (this._isLocked) return 'locked';
    if (this.routingMode === Wire.MODE_MANUAL) return 'manual';
    return 'auto';
  }

  /* ─── Feature 5: Component Lookup for Facing-Aware Directions ─── */

  /**
   * Set the component lookup function for facing-aware port directions.
   * When set, all Bézier path computations use the actual component
   * facing direction instead of the default EAST/WEST assumption.
   *
   * @param {Function} lookup – (nodeId) => Component
   */
  setCompLookup(lookup) {
    this._compLookup = lookup;
  }

  /**
   * Get the facing-aware port direction for the source node.
   * Uses the stored compLookup if available.
   * @returns {{x:number, y:number}}
   */
  getSourceDirection() {
    return Wire.getPortDirection(this.sourceNode.nodeId, this._compLookup);
  }

  /**
   * Get the facing-aware port direction for the target node.
   * Uses the stored compLookup if available.
   * @returns {{x:number, y:number}}
   */
  getTargetDirection() {
    return Wire.getPortDirection(this.targetNode.nodeId, this._compLookup);
  }

  /* ================================================================
   *  Routing Mode
   * ================================================================ */

  /**
   * Switch routing mode.
   * When switching TO Manual, current bend points become control points.
   * When switching FROM Manual, control points are cleared.
   */
  setRoutingMode(mode) {
    if (mode === Wire.MODE_MANUAL && this.routingMode !== Wire.MODE_MANUAL) {
      // BUG FIX: When switching from Bézier to Manual, pathPoints contains
      // [start, cp1, cp2, end] where cp1/cp2 are cubic Bézier control points
      // that are NOT on the actual curve. Using them as manual control points
      // would create a polyline through wrong positions. Instead, we sample
      // points along the actual Bézier curve to get meaningful bend points.
      if (this.routingMode === Wire.MODE_BEZIER && this.pathPoints.length === 4) {
        const sampled = Wire.sampleBezierPoints(this.pathPoints, 8);
        this.controlPoints = sampled.slice(1, -1).map(p => ({ x: p.x, y: p.y }));
      } else {
        this.controlPoints = this.pathPoints
          .slice(1, -1)
          .map(p => ({ x: p.x, y: p.y }));
      }
      this.isAutoRouted = false;
    }
    this.routingMode = mode;
    if (mode !== Wire.MODE_MANUAL) {
      this.controlPoints = [];
      this.isAutoRouted = true;
    }
  }

  /* ================================================================
   *  Path Computation
   * ================================================================ */

  /**
   * Compute path points using the Router.
   *
   * @param {{x:number,y:number}} fromPos
   * @param {{x:number,y:number}} toPos
   * @param {Router} router – Router instance
   * @param {Object} [opts] – channelX, busY, topY, …
   * @returns {Array<{x:number,y:number}>}
   */
  computePathPoints(fromPos, toPos, router, opts = {}) {
    if (this.routingMode === Wire.MODE_BEZIER) {
      const fromDir = opts.fromDir || this.getSourceDirection();
      const toDir   = opts.toDir   || this.getTargetDirection();
      const points  = router.route(fromPos, toPos, 'bezier', {
        ...opts,
        fromDir,
        toDir,
        sourceNodeId: this.sourceNode.nodeId,
        targetNodeId: this.targetNode.nodeId,
        compLookup: this._compLookup
      });
      this.pathPoints = points;
      return points;
    }
    const points = router.route(fromPos, toPos, this.routingMode, {
      ...opts,
      controlPoints: this.controlPoints
    });
    this.pathPoints = points;
    return points;
  }

  /**
   * Static convenience: compute an SVG path string directly.
   * Used for previews and fallback rendering where no wire instance exists.
   *
   * @param {{x:number,y:number}} fromPos
   * @param {{x:number,y:number}} toPos
   * @param {Object}  [opts]
   * @param {Router}  [opts.router]       – Router instance
   * @param {string}  [opts.sourceNodeId]
   * @param {string}  [opts.targetNodeId]
   * @param {number}  [opts.minClearY]    – bus-bar Y (backward compat)
   * @param {number}  [opts.maxClearY]    – top-bar Y (backward compat)
   * @param {{x:number,y:number}} [opts.fromDir] – Source port direction
   * @param {{x:number,y:number}} [opts.toDir]   – Target port direction
   * @returns {string} SVG path "d" attribute
   */
  static computePath(fromPos, toPos, opts = {}) {
    const { router, sourceNodeId, targetNodeId, minClearY, maxClearY, fromDir, toDir } = opts;

    // ── Bézier mode: compute cubic Bézier curve ──
    if (WIRE_DEFAULT_ROUTING_MODE === 'bezier') {
      const fd = fromDir || Wire.getPortDirection(sourceNodeId);
      const td = toDir   || Wire.getPortDirection(targetNodeId);
      return Wire.computeBezierPath(fromPos, toPos, fd, td);
    }

    // Try using the injected Router instance
    if (router) {
      if (typeof router.route === 'function') {
        // New Router class (Router) or StarRouter
        const points = router.route(fromPos, toPos, 'manhattan', {
          sourceNodeId,
          targetNodeId,
          busY: minClearY,
          topY: maxClearY
        });
        return Wire.pointsToSVGPath(points);
      }
      if (typeof router.computePath === 'function') {
        // Legacy router object
        return router.computePath(fromPos, toPos, sourceNodeId, opts);
      }
    }

    // ── Fallback: simple Manhattan routing (no router) ──
    const sx = fromPos.x, sy = fromPos.y;
    const tx = toPos.x,   ty = toPos.y;

    if (tx >= sx + GRID_SIZE) {
      const mx = sx + (tx - sx) / 2;
      return `M ${sx} ${sy} L ${mx} ${sy} L ${mx} ${ty} L ${tx} ${ty}`;
    }

    // Fix: Handle nearby horizontal pins to avoid loop-back paths
    if (tx >= sx - GRID_SIZE) {
      const step = 40;
      const midY = (Math.abs(ty - sy) < GRID_SIZE)
        ? Math.min(sy, ty) - step
        : (sy + ty) / 2;
      return `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`;
    }

    // Fix: Backward routing — avoid creating loops when source and target
    // are close together. Use a step-out path that goes around.
    const offset = 40;
    const minClear = minClearY != null ? minClearY + 20 : Math.max(sy, ty) + 70;
    const busLevel = Math.max(Math.max(sy, ty) + offset, minClear);

    // Check if we need to route below or above based on available space
    if (maxClearY != null && busLevel > maxClearY) {
      // Route above instead of below
      const topLevel = Math.min(Math.min(sy, ty) - offset, maxClearY);
      return `M ${sx} ${sy} L ${sx + offset} ${sy} L ${sx + offset} ${topLevel} L ${tx - offset} ${topLevel} L ${tx - offset} ${ty} L ${tx} ${ty}`;
    }

    return `M ${sx} ${sy} L ${sx + offset} ${sy} L ${sx + offset} ${busLevel} L ${tx - offset} ${busLevel} L ${tx - offset} ${ty} L ${tx} ${ty}`;
  }

  /* ================================================================
   *  Bézier Path Computation (OpenCircuits-style)
   * ================================================================ */

  /**
   * Get port direction vector based on node ID.
   * Output pins have direction (1, 0) → wire exits going RIGHT
   * Input pins have direction (-1, 0) → wire arrives from the LEFT
   *
   * When a component lookup function is provided, the direction is
   * adjusted for the component's facing direction and mirror state.
   *
   * @param {string} nodeId
   * @param {Function} [compLookup] — (nodeId) => Component (optional, for facing-aware direction)
   * @returns {{x:number, y:number}}
   */
  static getPortDirection(nodeId, compLookup) {
    if (compLookup) {
      const comp = compLookup(nodeId);
      if (comp) {
        return ComponentLayoutPolicy.getPortDirectionForNode(comp, nodeId);
      }
    }
    if (nodeId && nodeId.includes('.output.')) return { x: 1, y: 0 };
    return { x: -1, y: 0 };
  }

  /**
   * Compute a cubic Bézier SVG path string from two port positions and their directions.
   * If ports are approximately aligned on the same axis, use a straight line.
   *
   * Feature 5: Direction-driven control distances.
   * Each control point distance is computed based on the projection of the
   * source→target vector onto that port's direction, making curves adapt
   * naturally when ports face different directions (e.g., rotated gates).
   *
   * @param {{x:number,y:number}} fromPos
   * @param {{x:number,y:number}} toPos
   * @param {{x:number,y:number}} [fromDir] – Source port direction (default {x:1, y:0})
   * @param {{x:number,y:number}} [toDir]   – Target port direction (default {x:-1, y:0})
   * @returns {string} SVG path "d" attribute
   */
  static computeBezierPath(fromPos, toPos, fromDir, toDir) {
    const sx = fromPos.x, sy = fromPos.y;
    const tx = toPos.x, ty = toPos.y;

    // If approximately aligned, use straight line
    if (Math.abs(sx - tx) < 1 || Math.abs(sy - ty) < 1) {
      return `M ${sx} ${sy} L ${tx} ${ty}`;
    }

    const fd = fromDir || { x: 1, y: 0 };
    const td = toDir || { x: -1, y: 0 };

    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.hypot(dx, dy);

    // Base control distance (proportional to total distance)
    const baseControlDist = Math.max(
      WIRE_BEZIER_MIN_CONTROL,
      Math.min(WIRE_BEZIER_MAX_CONTROL, dist * WIRE_BEZIER_CONTROL_FACTOR)
    );

    // Feature 5: Direction-driven per-port control distances
    // Compute projection of source→target onto each port direction
    const fromProjection = dx * fd.x + dy * fd.y;     // dot product with from direction
    const toProjection   = -(dx * td.x + dy * td.y);  // negative: target direction points inward

    // When projection is positive (port faces toward the other), use adaptive distance;
    // otherwise fall back to base proportional distance
    const fromScale = fromProjection > 0
      ? Math.max(WIRE_BEZIER_MIN_CONTROL, Math.min(WIRE_BEZIER_MAX_CONTROL, fromProjection * WIRE_BEZIER_CONTROL_FACTOR))
      : baseControlDist;
    const toScale = toProjection > 0
      ? Math.max(WIRE_BEZIER_MIN_CONTROL, Math.min(WIRE_BEZIER_MAX_CONTROL, toProjection * WIRE_BEZIER_CONTROL_FACTOR))
      : baseControlDist;

    const cx1 = sx + fd.x * fromScale;
    const cy1 = sy + fd.y * fromScale;
    const cx2 = tx + td.x * toScale;
    const cy2 = ty + td.y * toScale;

    return `M ${sx} ${sy} C ${cx1} ${cy1} ${cx2} ${cy2} ${tx} ${ty}`;
  }

  /* ================================================================
   *  SVG Path Helpers
   * ================================================================ */

  /**
   * Convert an array of {x,y} points to an SVG path "d" string.
   * For Bézier mode, if points have 4 elements, generates a cubic Bézier.
   * For Manhattan/Direct/Manual, generates an L-based polyline.
   */
  static pointsToSVGPath(points, isBezier = false) {
    if (!points || points.length < 2) return '';
    if (isBezier && points.length === 4) {
      return `M ${points[0].x} ${points[0].y} C ${points[1].x} ${points[1].y} ${points[2].x} ${points[2].y} ${points[3].x} ${points[3].y}`;
    }
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  }

  /**
   * Sample points along a cubic Bézier curve defined by 4 control points.
   * Used when converting a Bézier wire to Manual mode — we need actual
   * on-curve points, not the Bézier control handles.
   *
   * @param {Array<{x:number,y:number}>} bezierPoints - [P0, P1, P2, P3] (start, cp1, cp2, end)
   * @param {number} numSamples - Number of samples (including endpoints)
   * @returns {Array<{x:number,y:number}>} Sampled points on the curve
   */
  static sampleBezierPoints(bezierPoints, numSamples = 8) {
    if (!bezierPoints || bezierPoints.length < 4) return bezierPoints || [];
    const [p0, p1, p2, p3] = bezierPoints;
    const points = [];
    for (let i = 0; i <= numSamples; i++) {
      const t = i / numSamples;
      const t2 = t * t;
      const t3 = t2 * t;
      const mt = 1 - t;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;
      points.push({
        x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
        y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
      });
    }
    return points;
  }

  /**
   * Parse an SVG "d" attribute into an array of {x,y} points.
   * Tolerant of missing whitespace after M/L commands (handles minified SVGs).
   * BUG FIX: Now also handles C (cubic Bézier) commands by sampling
   * points along the curve.
   */
  static svgPathToPoints(d) {
    const points = [];
    if (!d) return points;

    // Parse the path string command by command
    let currentX = 0, currentY = 0;
    const commandRegex = /([MLC])\s*([\s\S]*?)(?=[MLC]|$)/gi;
    const matches = d.matchAll(commandRegex);

    for (const match of matches) {
      const cmd = match[1].toUpperCase();
      const argsStr = match[2].trim();
      if (!argsStr) continue;

      const nums = argsStr.split(/[\s,]+/).map(Number).filter(n => !isNaN(n));

      if (cmd === 'M' || cmd === 'L') {
        for (let i = 0; i + 1 < nums.length; i += 2) {
          currentX = nums[i];
          currentY = nums[i + 1];
          points.push({ x: currentX, y: currentY });
        }
      } else if (cmd === 'C') {
        // Cubic Bézier: C cx1 cy1 cx2 cy2 x y
        // Sample points along the curve for approximate occupied cells
        for (let i = 0; i + 5 < nums.length; i += 6) {
          const cp1x = nums[i], cp1y = nums[i + 1];
          const cp2x = nums[i + 2], cp2y = nums[i + 3];
          const endX = nums[i + 4], endY = nums[i + 5];

          // Sample 8 points along the Bézier curve
          const bezierPoints = [
            { x: currentX, y: currentY },
            { x: cp1x, y: cp1y },
            { x: cp2x, y: cp2y },
            { x: endX, y: endY }
          ];
          const sampled = Wire.sampleBezierPoints(bezierPoints, 8);
          // Skip first point (already added by previous M/L)
          for (let j = 1; j < sampled.length; j++) {
            points.push(sampled[j]);
          }
          currentX = endX;
          currentY = endY;
        }
      }
    }

    return points;
  }

  /* ================================================================
   *  SVG Rendering (Enhanced)
   * ================================================================ */

  /**
   * Create SVG elements and render the wire on the svgLayer.
   * Now includes glow layer, miter joints, and tooltip.
   *
   * @param {SVGElement} svgLayer
   * @param {Function}   getNodePosition – nodeId → {x,y}
   * @param {number}     [busBarY]
   * @param {Router}     [router]
   */
  render(svgLayer, getNodePosition, busBarY = null, router = null) {
    if (this.element) return;

    const fromPos = getNodePosition(this.sourceNode.nodeId);
    const toPos   = getNodePosition(this.targetNode.nodeId);

    // Compute path
    let d;
    if (this.routingMode === Wire.MODE_BEZIER) {
      // Feature 5: Use facing-aware port directions
      const fromDir = this.getSourceDirection();
      const toDir   = this.getTargetDirection();

      // Use the Router for direction-driven Bézier if available
      if (router && typeof router.routeBezier === 'function') {
        const bezierPoints = router.routeBezier(fromPos, toPos, {
          fromDir, toDir,
          sourceNodeId: this.sourceNode.nodeId,
          targetNodeId: this.targetNode.nodeId,
          compLookup: this._compLookup
        });
        this.pathPoints = bezierPoints;
        d = Wire.pointsToSVGPath(bezierPoints, true);
      } else {
        d = Wire.computeBezierPath(fromPos, toPos, fromDir, toDir);
        // Store Bézier control points as pathPoints
        const dist = Math.hypot(toPos.x - fromPos.x, toPos.y - fromPos.y);
        const controlDist = Math.max(
          WIRE_BEZIER_MIN_CONTROL,
          Math.min(WIRE_BEZIER_MAX_CONTROL, dist * WIRE_BEZIER_CONTROL_FACTOR)
        );
        this.pathPoints = [
          { x: fromPos.x, y: fromPos.y },
          { x: fromPos.x + fromDir.x * controlDist, y: fromPos.y + fromDir.y * controlDist },
          { x: toPos.x + toDir.x * controlDist, y: toPos.y + toDir.y * controlDist },
          { x: toPos.x, y: toPos.y }
        ];
      }
    } else if (router && typeof router.route === 'function') {
      const points = this.computePathPoints(fromPos, toPos, router, { busY: busBarY });
      d = Wire.pointsToSVGPath(points);
    } else {
      d = Wire.computePath(fromPos, toPos, {
        minClearY: busBarY,
        router,
        sourceNodeId: this.sourceNode.nodeId
      });
      this.pathPoints = Wire.svgPathToPoints(d);
    }

    // Create SVG group
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.dataset.wireId = this.id;
    group.style.pointerEvents = 'auto';

    const style = getComputedStyle(document.documentElement);
    const neutralColor = style.getPropertyValue('--wire-neutral-color').trim() || '#888';

    // ─── Glow layer (behind visual, for hover/preview effects) ───
    const glowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    glowPath.setAttribute('stroke', 'transparent');
    glowPath.setAttribute('stroke-width', WIRE_DRAW_GLOW_WIDTH);
    glowPath.setAttribute('fill', 'none');
    glowPath.setAttribute('pointer-events', 'none');
    glowPath.setAttribute('stroke-linecap', 'round');
    glowPath.setAttribute('stroke-linejoin', 'round');
    glowPath.classList.add('wire-glow');
    glowPath.setAttribute('d', d);
    glowPath.style.display = 'none';

    // ─── Visual path ───
    const visualPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    visualPath.setAttribute('stroke', neutralColor);
    visualPath.setAttribute('stroke-width', WIRE_VISUAL_WIDTH);
    visualPath.setAttribute('fill', 'none');
    visualPath.setAttribute('pointer-events', 'none');
    visualPath.setAttribute('stroke-linecap', 'round');
    visualPath.setAttribute('stroke-linejoin', 'miter');
    visualPath.setAttribute('stroke-miterlimit', '4');
    visualPath.classList.add('wire-visual');
    visualPath.setAttribute('d', d);

    // ─── Hit area ───
    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.setAttribute('stroke', 'transparent');
    hitPath.setAttribute('stroke-width', WIRE_HIT_WIDTH);
    hitPath.setAttribute('fill', 'none');
    hitPath.setAttribute('pointer-events', 'stroke');
    hitPath.setAttribute('stroke-linecap', 'round');
    hitPath.setAttribute('stroke-linejoin', 'round');
    hitPath.classList.add('wire-hitarea');
    hitPath.setAttribute('d', d);

    // ─── Junction dot ───
    const junctionDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    junctionDot.setAttribute('r', JUNCTION_RADIUS);
    junctionDot.setAttribute('fill', neutralColor);
    junctionDot.setAttribute('pointer-events', 'none');
    junctionDot.classList.add('wire-junction');
    junctionDot.setAttribute('cx', fromPos.x);
    junctionDot.setAttribute('cy', fromPos.y);
    junctionDot.style.display = 'none';

    // ─── Endpoint markers (source and target dots) ───
    const sourceDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    sourceDot.setAttribute('cx', fromPos.x);
    sourceDot.setAttribute('cy', fromPos.y);
    sourceDot.setAttribute('r', '4');
    sourceDot.setAttribute('fill', 'transparent');
    sourceDot.setAttribute('stroke', 'transparent');
    sourceDot.setAttribute('stroke-width', '1.5');
    sourceDot.setAttribute('pointer-events', 'none');
    sourceDot.classList.add('wire-endpoint-source');
    sourceDot.style.display = 'none';

    const targetDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    targetDot.setAttribute('cx', toPos.x);
    targetDot.setAttribute('cy', toPos.y);
    targetDot.setAttribute('r', '4');
    targetDot.setAttribute('fill', 'transparent');
    targetDot.setAttribute('stroke', 'transparent');
    targetDot.setAttribute('stroke-width', '1.5');
    targetDot.setAttribute('pointer-events', 'none');
    targetDot.classList.add('wire-endpoint-target');
    targetDot.style.display = 'none';

    // Assemble group (order matters: glow → visual → hit → dots)
    // Native SVG tooltip removed — was annoying and useless
    group.appendChild(glowPath);
    group.appendChild(visualPath);
    group.appendChild(hitPath);
    group.appendChild(junctionDot);
    group.appendChild(sourceDot);
    group.appendChild(targetDot);
    svgLayer.appendChild(group);

    this.element = group;
    this.updateOccupiedCells(d);
    this._updateTooltip();
  }

  /**
   * Full re-route using the Router.  Called on explicit reroute or drop.
   */
  updatePath(getNodePosition, busBarY = null, router = null) {
    if (!this.element) return;

    const fromPos = getNodePosition(this.sourceNode.nodeId);
    const toPos   = getNodePosition(this.targetNode.nodeId);

    // In Manual mode, adjust endpoints while preserving control points
    if (this.routingMode === Wire.MODE_MANUAL && this.controlPoints.length > 0) {
      this._updateEndpointsOnly(fromPos, toPos);
      return;
    }

    // Compute new path
    let d;
    if (this.routingMode === Wire.MODE_BEZIER) {
      // Feature 5: Use facing-aware port directions
      const fromDir = this.getSourceDirection();
      const toDir   = this.getTargetDirection();
      d = Wire.computeBezierPath(fromPos, toPos, fromDir, toDir);
      // Update pathPoints — use direction-driven control distances from router if available
      if (router && typeof router.routeBezier === 'function') {
        const bezierPoints = router.routeBezier(fromPos, toPos, {
          fromDir, toDir,
          sourceNodeId: this.sourceNode.nodeId,
          targetNodeId: this.targetNode.nodeId,
          compLookup: this._compLookup
        });
        this.pathPoints = bezierPoints;
        d = Wire.pointsToSVGPath(bezierPoints, true);
      } else {
        const dist = Math.hypot(toPos.x - fromPos.x, toPos.y - fromPos.y);
        const controlDist = Math.max(
          WIRE_BEZIER_MIN_CONTROL,
          Math.min(WIRE_BEZIER_MAX_CONTROL, dist * WIRE_BEZIER_CONTROL_FACTOR)
        );
        this.pathPoints = [
          { x: fromPos.x, y: fromPos.y },
          { x: fromPos.x + fromDir.x * controlDist, y: fromPos.y + fromDir.y * controlDist },
          { x: toPos.x + toDir.x * controlDist, y: toPos.y + toDir.y * controlDist },
          { x: toPos.x, y: toPos.y }
        ];
      }
    } else if (router && typeof router.route === 'function') {
      const points = this.computePathPoints(fromPos, toPos, router, { busY: busBarY });
      d = Wire.pointsToSVGPath(points);
    } else {
      d = Wire.computePath(fromPos, toPos, {
        minClearY: busBarY,
        router,
        sourceNodeId: this.sourceNode.nodeId
      });
      this.pathPoints = Wire.svgPathToPoints(d);
    }

    this.element.querySelector('.wire-visual').setAttribute('d', d);
    this.element.querySelector('.wire-hitarea').setAttribute('d', d);

    const glowPath = this.element.querySelector('.wire-glow');
    if (glowPath) glowPath.setAttribute('d', d);

    this.updateOccupiedCells(d);

    const junctionDot = this.element.querySelector('.wire-junction');
    if (junctionDot) {
      junctionDot.setAttribute('cx', fromPos.x);
      junctionDot.setAttribute('cy', fromPos.y);
    }

    // Update endpoint markers
    const sourceDot = this.element.querySelector('.wire-endpoint-source');
    if (sourceDot) {
      sourceDot.setAttribute('cx', fromPos.x);
      sourceDot.setAttribute('cy', fromPos.y);
    }
    const targetDot = this.element.querySelector('.wire-endpoint-target');
    if (targetDot) {
      targetDot.setAttribute('cx', toPos.x);
      targetDot.setAttribute('cy', toPos.y);
    }
  }

  /**
   * Stable endpoint update — only adjust start/end, keep interior points.
   * Used during drag for fast, flicker-free updates.
   * Full reroute happens on drop via rerouteWithFanOut().
   */
  updateEndpointsStable(fromPos, toPos) {
    if (!this.element) return;
    if (this._isLocked) return;

    // For Bézier mode, just recompute the full Bézier path (fast, no pathfinding)
    if (this.routingMode === Wire.MODE_BEZIER) {
      // Feature 5: Use facing-aware port directions
      const fromDir = this.getSourceDirection();
      const toDir   = this.getTargetDirection();
      const d = Wire.computeBezierPath(fromPos, toPos, fromDir, toDir);
      const dist = Math.hypot(toPos.x - fromPos.x, toPos.y - fromPos.y);
      const controlDist = Math.max(
        WIRE_BEZIER_MIN_CONTROL,
        Math.min(WIRE_BEZIER_MAX_CONTROL, dist * WIRE_BEZIER_CONTROL_FACTOR)
      );
      this.pathPoints = [
        { x: fromPos.x, y: fromPos.y },
        { x: fromPos.x + fromDir.x * controlDist, y: fromPos.y + fromDir.y * controlDist },
        { x: toPos.x + toDir.x * controlDist, y: toPos.y + toDir.y * controlDist },
        { x: toPos.x, y: toPos.y }
      ];
      this.element.querySelector('.wire-visual').setAttribute('d', d);
      this.element.querySelector('.wire-hitarea').setAttribute('d', d);
      const glowPath = this.element.querySelector('.wire-glow');
      if (glowPath) glowPath.setAttribute('d', d);

      const junctionDot = this.element.querySelector('.wire-junction');
      if (junctionDot) {
        junctionDot.setAttribute('cx', fromPos.x);
        junctionDot.setAttribute('cy', fromPos.y);
      }
      const sourceDot = this.element.querySelector('.wire-endpoint-source');
      if (sourceDot) {
        sourceDot.setAttribute('cx', fromPos.x);
        sourceDot.setAttribute('cy', fromPos.y);
      }
      const targetDot = this.element.querySelector('.wire-endpoint-target');
      if (targetDot) {
        targetDot.setAttribute('cx', toPos.x);
        targetDot.setAttribute('cy', toPos.y);
      }
      return;
    }

    if (this.pathPoints.length < 2) {
      const d = `M ${fromPos.x} ${fromPos.y} L ${toPos.x} ${toPos.y}`;
      this.element.querySelector('.wire-visual').setAttribute('d', d);
      this.element.querySelector('.wire-hitarea').setAttribute('d', d);
      const glowPath = this.element.querySelector('.wire-glow');
      if (glowPath) glowPath.setAttribute('d', d);
      this.pathPoints = [{ ...fromPos }, { ...toPos }];
      return;
    }

    this._updateEndpointsOnly(fromPos, toPos);
  }

  /**
   * Shift endpoints + first/last interior points by the same delta.
   * This produces a "stretchy" effect that is fast and stable during drag.
   */
  _updateEndpointsOnly(fromPos, toPos) {
    if (this.pathPoints.length < 2) return;

    const oldFirst = { ...this.pathPoints[0] };
    const oldLast  = { ...this.pathPoints[this.pathPoints.length - 1] };

    this.pathPoints[0] = { x: fromPos.x, y: fromPos.y };
    this.pathPoints[this.pathPoints.length - 1] = { x: toPos.x, y: toPos.y };

    if (this.pathPoints.length > 2) {
      const startDelta = { x: fromPos.x - oldFirst.x, y: fromPos.y - oldFirst.y };
      const endDelta   = { x: toPos.x - oldLast.x,    y: toPos.y - oldLast.y };

      this.pathPoints[1] = {
        x: this.pathPoints[1].x + startDelta.x,
        y: this.pathPoints[1].y + startDelta.y
      };

      if (this.pathPoints.length > 3) {
        const lastIdx = this.pathPoints.length - 2;
        this.pathPoints[lastIdx] = {
          x: this.pathPoints[lastIdx].x + endDelta.x,
          y: this.pathPoints[lastIdx].y + endDelta.y
        };
      }
    }

    // Also update controlPoints in Manual mode
    if (this.routingMode === Wire.MODE_MANUAL) {
      // controlPoints = pathPoints minus endpoints
      this.controlPoints = this.pathPoints.slice(1, -1).map(p => ({ x: p.x, y: p.y }));
    }

    this._applyPathPointsToSVG();
  }

  /**
   * Apply current pathPoints to SVG elements (single source of truth).
   */
  _applyPathPointsToSVG() {
    if (!this.element || this.pathPoints.length < 2) return;

    // BUG FIX: For Bézier wires, if pathPoints has been modified to != 4 points
    // (e.g., after manual conversion or point insertion), we must NOT use the
    // Bézier C-command path — use polyline instead. Only use C-command when
    // we have exactly the 4 points required for a cubic Bézier.
    const isBezier = this.routingMode === Wire.MODE_BEZIER && this.pathPoints.length === 4;
    const d = Wire.pointsToSVGPath(this.pathPoints, isBezier);
    this.element.querySelector('.wire-visual').setAttribute('d', d);
    this.element.querySelector('.wire-hitarea').setAttribute('d', d);

    const glowPath = this.element.querySelector('.wire-glow');
    if (glowPath) glowPath.setAttribute('d', d);

    this.updateOccupiedCells(d);

    const junctionDot = this.element.querySelector('.wire-junction');
    if (junctionDot) {
      junctionDot.setAttribute('cx', this.pathPoints[0].x);
      junctionDot.setAttribute('cy', this.pathPoints[0].y);
    }

    // Update endpoint markers
    const sourceDot = this.element.querySelector('.wire-endpoint-source');
    if (sourceDot) {
      sourceDot.setAttribute('cx', this.pathPoints[0].x);
      sourceDot.setAttribute('cy', this.pathPoints[0].y);
    }
    const targetDot = this.element.querySelector('.wire-endpoint-target');
    if (targetDot) {
      const lastPt = this.pathPoints[this.pathPoints.length - 1];
      targetDot.setAttribute('cx', lastPt.x);
      targetDot.setAttribute('cy', lastPt.y);
    }
  }

  /* ================================================================
   *  Hover & Glow Effects (New)
   * ================================================================ */

  /**
   * Set hover state: shows glow, endpoint indicators, and color change.
   */
  setHovered(hovered) {
    if (this._isHovered === hovered) return;
    this._isHovered = hovered;

    if (!this.element) return;

    const visualPath = this.element.querySelector('.wire-visual');
    const glowPath   = this.element.querySelector('.wire-glow');
    const sourceDot  = this.element.querySelector('.wire-endpoint-source');
    const targetDot  = this.element.querySelector('.wire-endpoint-target');

    if (hovered) {
      // Show glow
      if (glowPath) {
        glowPath.style.display = '';
        glowPath.setAttribute('stroke', WIRE_DRAW_GLOW_COLOR);
      }

      // Thicken visual path slightly
      if (visualPath) {
        visualPath.setAttribute('stroke-width', String(WIRE_VISUAL_WIDTH + 1));
      }

      // Show endpoint dots
      if (sourceDot) {
        sourceDot.style.display = '';
        sourceDot.setAttribute('fill', 'rgba(78, 201, 176, 0.6)');
        sourceDot.setAttribute('stroke', '#4ec9b0');
      }
      if (targetDot) {
        targetDot.style.display = '';
        targetDot.setAttribute('fill', 'rgba(78, 201, 176, 0.6)');
        targetDot.setAttribute('stroke', '#4ec9b0');
      }
    } else {
      // Hide glow
      if (glowPath) {
        glowPath.style.display = 'none';
        glowPath.setAttribute('stroke', 'transparent');
      }

      // Reset visual path
      if (visualPath) {
        visualPath.setAttribute('stroke-width', String(WIRE_VISUAL_WIDTH));
      }

      // Hide endpoint dots
      if (sourceDot) {
        sourceDot.style.display = 'none';
        sourceDot.setAttribute('fill', 'transparent');
        sourceDot.setAttribute('stroke', 'transparent');
      }
      if (targetDot) {
        targetDot.style.display = 'none';
        targetDot.setAttribute('fill', 'transparent');
        targetDot.setAttribute('stroke', 'transparent');
      }
    }
  }

  /**
   * Set glow state for wire preview during drawing.
   */
  setGlowing(glowing) {
    if (this._isGlowing === glowing) return;
    this._isGlowing = glowing;

    if (!this.element) return;

    const glowPath = this.element.querySelector('.wire-glow');
    if (glowPath) {
      if (glowing) {
        glowPath.style.display = '';
        glowPath.setAttribute('stroke', WIRE_DRAW_GLOW_COLOR);
      } else {
        glowPath.style.display = 'none';
        glowPath.setAttribute('stroke', 'transparent');
      }
    }
  }

  /**
   * Set error state (red glow for invalid/short-circuit connections).
   */
  setError(hasError) {
    if (this._isError === hasError) return;
    this._isError = hasError;

    if (!this.element) return;

    const visualPath = this.element.querySelector('.wire-visual');
    const glowPath   = this.element.querySelector('.wire-glow');

    if (hasError) {
      if (visualPath) visualPath.setAttribute('stroke', WIRE_ERROR_COLOR);
      if (glowPath) {
        glowPath.style.display = '';
        glowPath.setAttribute('stroke', 'rgba(255, 68, 68, 0.4)');
      }
    } else {
      if (glowPath) {
        glowPath.style.display = 'none';
        glowPath.setAttribute('stroke', 'transparent');
      }
    }
  }

  /* ================================================================
   *  Feature 3: Wire Net Tracing (traced state)
   * ================================================================ */

  /**
   * Set the traced (net-highlight) state on this wire.
   * Adds/removes the `.traced` CSS class on the wire-visual path.
   * @param {boolean} isTraced
   */
  setTraced(isTraced) {
    if (!this.element) return;
    const visualPath = this.element.querySelector('.wire-visual');
    if (visualPath) {
      if (isTraced) {
        visualPath.classList.add('traced');
      } else {
        visualPath.classList.remove('traced');
      }
    }
  }

  /* ================================================================
   *  Control Points (Manual Mode)
   * ================================================================ */

  /**
   * Insert a control point at a given index in pathPoints.
   * @param {number} index – Position in pathPoints (1 … length-1)
   * @param {{x:number,y:number}} point
   */
  addControlPoint(index, point) {
    if (index < 1 || index >= this.pathPoints.length) return;

    const snapped = {
      x: Math.round(point.x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(point.y / GRID_SIZE) * GRID_SIZE
    };

    this.pathPoints.splice(index, 0, snapped);

    // Ensure Manual mode
    if (this.routingMode !== Wire.MODE_MANUAL) {
      this.routingMode = Wire.MODE_MANUAL;
    }

    // Mark as manually edited
    this.isAutoRouted = false;

    // Sync controlPoints
    this.controlPoints = this.pathPoints.slice(1, -1).map(p => ({ x: p.x, y: p.y }));

    this._applyPathPointsToSVG();
  }

  /**
   * Remove a control point by index.
   * @param {number} index – Index in pathPoints (cannot remove endpoints)
   */
  removeControlPoint(index) {
    if (index < 1 || index >= this.pathPoints.length - 1) return;

    this.pathPoints.splice(index, 1);

    // Sync controlPoints
    this.controlPoints = this.pathPoints.slice(1, -1).map(p => ({ x: p.x, y: p.y }));

    if (this.controlPoints.length === 0 && this.routingMode === Wire.MODE_MANUAL) {
      // No more control points — could revert to Manhattan, but stay manual
    }

    this._applyPathPointsToSVG();
  }

  /**
   * Move a control point to a new position (snapped to grid).
   * @param {number} index – Index in pathPoints
   * @param {{x:number,y:number}} newPos
   * @param {boolean} [snapToGrid=true]
   */
  moveControlPoint(index, newPos, snapToGrid = true) {
    if (index < 0 || index >= this.pathPoints.length) return;

    let x = newPos.x;
    let y = newPos.y;

    if (snapToGrid) {
      x = Math.round(x / GRID_SIZE) * GRID_SIZE;
      y = Math.round(y / GRID_SIZE) * GRID_SIZE;
    }

    this.pathPoints[index] = { x, y };

    // Intermediate points are always control points
    if (index > 0 && index < this.pathPoints.length - 1) {
      if (this.routingMode !== Wire.MODE_MANUAL) {
        this.routingMode = Wire.MODE_MANUAL;
      }
      this.isAutoRouted = false;
    }

    // Sync controlPoints
    this.controlPoints = this.pathPoints.slice(1, -1).map(p => ({ x: p.x, y: p.y }));

    this._applyPathPointsToSVG();
  }

  /**
   * Force orthogonal alignment at a control point.
   * Ensures the previous point shares either X or Y with the current point,
   * creating proper Manhattan-style 90° bends.
   * @param {number} index – Index in pathPoints (must be an interior point)
   */
  applyOrthogonalConstraint(index) {
    if (index <= 0 || index >= this.pathPoints.length - 1) return;
    const prev = this.pathPoints[index - 1];
    const curr = this.pathPoints[index];
    const next = this.pathPoints[index + 1];

    // Force orthogonal: previous point shares X or Y with current
    const dxPrev = Math.abs(prev.x - curr.x);
    const dyPrev = Math.abs(prev.y - curr.y);
    if (dxPrev > dyPrev) {
      prev.y = curr.y;
    } else {
      prev.x = curr.x;
    }

    // Also constrain next point
    const dxNext = Math.abs(next.x - curr.x);
    const dyNext = Math.abs(next.y - curr.y);
    if (dxNext > dyNext) {
      next.y = curr.y;
    } else {
      next.x = curr.x;
    }

    this._applyPathPointsToSVG();
  }

  /* ================================================================
   *  Control Handle Visualization
   * ================================================================ */

  /** Show draggable control-point handles on this wire. */
  showControlHandles() {
    if (this._controlHandlesVisible) return;
    this._controlHandlesVisible = true;
    this._renderControlHandles();
  }

  /** Hide all control-point handles. */
  hideControlHandles() {
    this._controlHandlesVisible = false;
    this._removeControlHandleElements();
  }

  /** Refresh handle positions after a point is moved. */
  refreshControlHandles() {
    if (this._controlHandlesVisible) {
      this._renderControlHandles();
    }
  }

  /**
   * Render control handle circles at each intermediate path point.
   */
  _renderControlHandles() {
    if (!this.element) return;
    this._removeControlHandleElements();

    const handleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    handleGroup.classList.add('wire-control-handles');

    // Handles for intermediate points (not endpoints)
    for (let i = 1; i < this.pathPoints.length - 1; i++) {
      const pt = this.pathPoints[i];

      // Layer 1: Outer ring (large hit target)
      const outerRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      outerRing.setAttribute('cx', pt.x);
      outerRing.setAttribute('cy', pt.y);
      outerRing.setAttribute('r', '12');
      outerRing.setAttribute('fill', 'transparent');
      outerRing.setAttribute('stroke', 'transparent');
      outerRing.setAttribute('pointer-events', 'all');
      outerRing.setAttribute('cursor', 'grab');
      outerRing.classList.add('wire-control-point-outer');
      outerRing.dataset.pointIndex = i;
      outerRing.dataset.wireId = this.id;
      handleGroup.appendChild(outerRing);

      // Layer 2: Middle ring (visible dashed ring)
      const middleRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      middleRing.setAttribute('cx', pt.x);
      middleRing.setAttribute('cy', pt.y);
      middleRing.setAttribute('r', '7');
      middleRing.setAttribute('fill', 'transparent');
      middleRing.setAttribute('stroke', '#4ec9b0');
      middleRing.setAttribute('stroke-width', '1');
      middleRing.setAttribute('stroke-dasharray', '2,2');
      middleRing.setAttribute('pointer-events', 'none');
      middleRing.classList.add('wire-control-point-ring');
      handleGroup.appendChild(middleRing);

      // Layer 3: Inner circle (solid handle)
      const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      handle.setAttribute('cx', pt.x);
      handle.setAttribute('cy', pt.y);
      handle.setAttribute('r', '5');
      handle.setAttribute('fill', '#4ec9b0');
      handle.setAttribute('stroke', '#fff');
      handle.setAttribute('stroke-width', '2');
      handle.setAttribute('pointer-events', 'none');
      handle.classList.add('wire-control-point');
      handle.dataset.pointIndex = i;
      handle.dataset.wireId = this.id;
      handleGroup.appendChild(handle);
    }

    // "+" indicators at segment midpoints for adding new points
    for (let i = 0; i < this.pathPoints.length - 1; i++) {
      const p1 = this.pathPoints[i];
      const p2 = this.pathPoints[i + 1];
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      const segLen = Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);
      if (segLen < GRID_SIZE * 2) continue;

      const addHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      addHandle.setAttribute('cx', midX);
      addHandle.setAttribute('cy', midY);
      addHandle.setAttribute('r', '5');
      addHandle.setAttribute('fill', 'rgba(78, 201, 176, 0.15)');
      addHandle.setAttribute('stroke', '#4ec9b0');
      addHandle.setAttribute('stroke-width', '1.5');
      addHandle.setAttribute('stroke-dasharray', '2,2');
      addHandle.setAttribute('pointer-events', 'all');
      addHandle.setAttribute('cursor', 'crosshair');
      addHandle.classList.add('wire-add-point');
      addHandle.dataset.afterIndex = i;
      addHandle.dataset.wireId = this.id;
      handleGroup.appendChild(addHandle);

      const plusH = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      plusH.setAttribute('x1', midX - 3); plusH.setAttribute('y1', midY);
      plusH.setAttribute('x2', midX + 3); plusH.setAttribute('y2', midY);
      plusH.setAttribute('stroke', '#4ec9b0');
      plusH.setAttribute('stroke-width', '1.5');
      plusH.setAttribute('pointer-events', 'none');
      handleGroup.appendChild(plusH);

      const plusV = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      plusV.setAttribute('x1', midX); plusV.setAttribute('y1', midY - 3);
      plusV.setAttribute('x2', midX); plusV.setAttribute('y2', midY + 3);
      plusV.setAttribute('stroke', '#4ec9b0');
      plusV.setAttribute('stroke-width', '1.5');
      plusV.setAttribute('pointer-events', 'none');
      handleGroup.appendChild(plusV);
    }

    this.element.appendChild(handleGroup);
  }

  _removeControlHandleElements() {
    if (!this.element) return;
    this.element.querySelectorAll('.wire-control-handles').forEach(g => g.remove());
  }

  /* ================================================================
   *  Visual State
   * ================================================================ */

  updateColor(sourceValue) {
    if (!this.element) return;

    const style = getComputedStyle(document.documentElement);
    const highColor    = style.getPropertyValue('--wire-high-color').trim()    || '#00cc66';
    const highDash     = style.getPropertyValue('--wire-high-dasharray').trim() || 'none';
    const neutralColor = style.getPropertyValue('--wire-neutral-color').trim() || '#888';
    const neutralDash  = style.getPropertyValue('--wire-neutral-dasharray').trim() || '6,4';
    const zColor       = style.getPropertyValue('--wire-z-color').trim()       || '#ff9800';
    const zDash        = style.getPropertyValue('--wire-z-dasharray').trim()   || '2,2';

    // Skip color update if error state is active
    if (this._isError) return;

    // Detect signal transitions for animation
    const prevValue = this._lastSourceValue;
    this._lastSourceValue = sourceValue;
    const visualPath = this.element.querySelector('.wire-visual');

    // Check if reduced motion is preferred
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let color, dashArray;
    if (sourceValue === true) {
      color = highColor;
      dashArray = highDash === 'none' ? null : highDash;
      // Signal transition: LOW→HIGH or Z→HIGH
      if (visualPath && prevValue !== true && !prefersReducedMotion) {
        visualPath.classList.remove('propagating-low');
        visualPath.classList.add('propagating-high');
        // Remove animation class after it completes
        setTimeout(() => visualPath.classList.remove('propagating-high'), 200);
      }
    } else if (sourceValue === null) {
      color = zColor;
      dashArray = zDash;
    } else {
      color = neutralColor;
      dashArray = neutralDash === 'none' ? null : neutralDash;
      // Signal transition: HIGH→LOW
      if (visualPath && prevValue === true && !prefersReducedMotion) {
        visualPath.classList.remove('propagating-high');
        visualPath.classList.add('propagating-low');
        setTimeout(() => visualPath.classList.remove('propagating-low'), 200);
      }
    }

    this.element.querySelector('.wire-visual')?.setAttribute('stroke', color);
    // Apply dash array for colorblind-safe patterns
    if (dashArray) {
      this.element.querySelector('.wire-visual')?.setAttribute('stroke-dasharray', dashArray);
    } else {
      this.element.querySelector('.wire-visual')?.removeAttribute('stroke-dasharray');
    }
    // Junction dots are hidden in Bézier-only mode — no need to update fill
  }

  showJunction() {
    this.element?.querySelector('.wire-junction')?.style && (this.element.querySelector('.wire-junction').style.display = '');
  }

  hideJunction() {
    this.element?.querySelector('.wire-junction')?.style && (this.element.querySelector('.wire-junction').style.display = 'none');
  }

  /* ================================================================
   *  Lock / Unlock
   * ================================================================ */

  lock()   { this._isLocked = true; }
  unlock() { this._isLocked = false; }

  /* ================================================================
   *  Tooltip
   * ================================================================ */

  _updateTooltip() {
    // Tooltip removed — was annoying and useless
  }

  /* ================================================================
   *  Legacy Compatibility
   * ================================================================ */

  /** Reset all path data. Called before batch re-routing. */
  clearPathPoints() {
    this.pathPoints = [];
    this.controlPoints = [];
    this.occupiedCells.clear();
  }

  /** Force a full re-route. For Bézier wires, just recomputes the curve. */
  forceReroute(getNodePosition, busBarY = null, router = null) {
    if (this.routingMode === Wire.MODE_MANUAL) {
      this.routingMode = Wire.MODE_BEZIER;
      this.controlPoints = [];
    } else if (this.routingMode === Wire.MODE_MANHATTAN || this.routingMode === Wire.MODE_DIRECT) {
      this.routingMode = Wire.MODE_BEZIER;
      this._isRoutingFallback = false;
      const visualPath = this.element?.querySelector('.wire-visual');
      if (visualPath) visualPath.classList.remove('routing-fallback');
    }
    this.isAutoRouted = true;
    this._routedMethod = 'bezier';
    this.updatePath(getNodePosition, busBarY, router);
  }

  /**
   * Update the cached set of grid cells this wire occupies.
   * Kept for backward compat — no longer critical for routing.
   */
  updateOccupiedCells(d) {
    this.occupiedCells.clear();
    if (!d) return;
    const gs = GRID_SIZE;
    // BUG FIX: Now handles C (cubic Bézier) commands by sampling points
    // along the curve, in addition to M and L commands.
    // First, convert the path to points (which now supports C commands),
    // then compute occupied cells from the resulting polyline points.
    const points = Wire.svgPathToPoints(d);
    if (points.length < 2) return;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const isH = Math.abs(p2.y - p1.y) < 1;
      const isV = Math.abs(p2.x - p1.x) < 1;
      if (isH) {
        const y = Math.round(p1.y / gs);
        for (let x = Math.round(Math.min(p1.x, p2.x) / gs); x <= Math.round(Math.max(p1.x, p2.x) / gs); x++) {
          this.occupiedCells.add(`${x},${y}`);
        }
      } else if (isV) {
        const x = Math.round(p1.x / gs);
        for (let y = Math.round(Math.min(p1.y, p2.y) / gs); y <= Math.round(Math.max(p1.y, p2.y) / gs); y++) {
          this.occupiedCells.add(`${x},${y}`);
        }
      }
      // For diagonal segments (from Bézier sampling), add cells along the path
      else {
        const steps = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / gs));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const cx = p1.x + (p2.x - p1.x) * t;
          const cy = p1.y + (p2.y - p1.y) * t;
          this.occupiedCells.add(`${Math.round(cx / gs)},${Math.round(cy / gs)}`);
        }
      }
    }
  }

  /** Store path points from SVG path data (legacy compat). */
  storePathPoints(d) {
    this.pathPoints = Wire.svgPathToPoints(d);
  }

  /* ================================================================
   *  Bézier SVG Path Computation
   * ================================================================ */

  /**
   * Compute the full Bézier SVG path string for this wire.
   *
   * @param {Function} getNodePosition – nodeId → {x,y}
   * @returns {string} SVG path "d" attribute
   */
  computeBezierSVGPath(getNodePosition) {
    const fromPos = getNodePosition(this.sourceNode.nodeId);
    const toPos   = getNodePosition(this.targetNode.nodeId);
    if (!fromPos || !toPos) return '';

    const fromDir = Wire.getPortDirection(this.sourceNode.nodeId, this._compLookup);
    const toDir   = Wire.getPortDirection(this.targetNode.nodeId, this._compLookup);
    return Wire.computeBezierPath(fromPos, toPos, fromDir, toDir);
  }
}
