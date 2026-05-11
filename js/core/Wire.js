/**
 * Wire.js — Data Model for a circuit wire connection (Segment-by-Segment)
 *
 * Inspired by OpenCircuits' approach:
 *   - Wires connect using Bézier curves between consecutive points
 *   - Each segment is independently Bézier or straight line
 *   - When two consecutive points share the same X or Y, that segment is a straight line
 *   - This enables manual Manhattan-style routing by placing aligned waypoints
 *   - Click anywhere on a wire to add a waypoint (control point)
 *   - Waypoints can be dragged, deleted
 *   - No "routing mode" or "lock wire" — one unified model
 *
 * Data model:
 *   - waypoints[]  : user-created intermediate points [{x,y}]
 *   - _sourcePos   : cached source port position
 *   - _targetPos   : cached target port position
 *   - pathPoints   : computed [source, ...waypoints, target] (all on-curve points)
 */

import {
  WIRE_VISUAL_WIDTH, WIRE_HIT_WIDTH, JUNCTION_RADIUS, GRID_SIZE,
  WIRE_DRAW_GLOW_COLOR, WIRE_DRAW_GLOW_WIDTH, WIRE_ERROR_COLOR,
  WIRE_BEZIER_CONTROL_FACTOR, WIRE_BEZIER_MIN_CONTROL, WIRE_BEZIER_MAX_CONTROL,
  WIRE_COAXIAL_THRESHOLD
} from '../config.js';
import { ComponentLayoutPolicy } from './ComponentLayoutPolicy.js';

export class Wire {

  /* ─── Constants ─── */
  static MODE_BEZIER = 'bezier';   // Kept for backward compat — all wires use this now

  /* ================================================================
   *  Constructor
   * ================================================================ */

  constructor(id, sourceNode, targetNode) {
    this.id           = id;
    this.sourceNode   = sourceNode;           // { nodeId }
    this.targetNode   = targetNode;           // { nodeId }
    this.waypoints    = [];                   // User-created intermediate points [{x,y}]
    this.element      = null;                 // SVG <g> group
    this.engineId     = null;                 // Link to Engine wire ID
    this.occupiedCells = new Set();

    // Cached endpoint positions (updated during render/updatePath)
    this._sourcePos = null;
    this._targetPos = null;

    // Visual states
    this._controlHandlesVisible = false;
    this._lastSourceValue = undefined;
    this._isHovered   = false;
    this._isError     = false;
    this._isGlowing   = false;

    // Component lookup for facing-aware port directions
    this._compLookup  = null;
  }

  /* ─── Backward Compatibility Aliases ─── */

  get fromNode() { return this.sourceNode; }
  set fromNode(v) { this.sourceNode = v; }
  get toNode()   { return this.targetNode; }
  set toNode(v)  { this.targetNode = v; }

  /** routingMode always returns 'bezier' — no more mode switching */
  get routingMode() { return Wire.MODE_BEZIER; }
  set routingMode(_) { /* no-op */ }

  /** isManualMode — true if wire has user-placed waypoints */
  get isManualMode() { return this.waypoints.length > 0; }

  /** isAutoRouted — true if no waypoints (automatic Bézier) */
  get isAutoRouted() { return this.waypoints.length === 0; }
  set isAutoRouted(_) { /* no-op */ }

  /** isLocked — always false (lock feature removed) */
  get isLocked() { return false; }

  /** pathPoints — computed from endpoints + waypoints */
  get pathPoints() {
    const pts = [];
    if (this._sourcePos) pts.push({ ...this._sourcePos });
    for (const wp of this.waypoints) pts.push({ ...wp });
    if (this._targetPos) pts.push({ ...this._targetPos });
    return pts;
  }

  set pathPoints(points) {
    if (!points || points.length < 2) return;
    this._sourcePos = { ...points[0] };
    this._targetPos = { ...points[points.length - 1] };
    this.waypoints = points.slice(1, -1).map(p => ({ x: p.x, y: p.y }));
  }

  /** controlPoints — alias for waypoints (backward compat) */
  get controlPoints() { return this.waypoints; }
  set controlPoints(pts) { this.waypoints = pts ? pts.map(p => ({ x: p.x, y: p.y })) : []; }

  /** wireState — for display purposes */
  get wireState() {
    if (this.waypoints.length > 0) return 'manual';
    return 'auto';
  }

  /* ─── Feature: Component Lookup for Facing-Aware Directions ─── */

  setCompLookup(lookup) {
    this._compLookup = lookup;
  }

  getSourceDirection() {
    return Wire.getPortDirection(this.sourceNode.nodeId, this._compLookup);
  }

  getTargetDirection() {
    return Wire.getPortDirection(this.targetNode.nodeId, this._compLookup);
  }

  /* ================================================================
   *  Port Direction (static helper)
   * ================================================================ */

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

  /* ================================================================
   *  Segment-by-Segment SVG Path Computation
   * ================================================================ */

  /**
   * Compute the full SVG path from source through waypoints to target.
   * Each segment is independently Bézier or straight line.
   *
   * @param {{x:number,y:number}} sourcePos
   * @param {{x:number,y:number}} targetPos
   * @param {Array<{x:number,y:number}>} waypoints
   * @param {{x:number,y:number}} sourceDir — source port direction
   * @param {{x:number,y:number}} targetDir — target port direction
   * @returns {string} SVG path "d" attribute
   */
  static computeSegmentPath(sourcePos, targetPos, waypoints, sourceDir, targetDir) {
    const points = [sourcePos, ...waypoints, targetPos];
    if (points.length < 2) return '';

    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const A = points[i];
      const B = points[i + 1];

      // Check if co-axial → straight line
      if (Math.abs(A.x - B.x) < WIRE_COAXIAL_THRESHOLD ||
          Math.abs(A.y - B.y) < WIRE_COAXIAL_THRESHOLD) {
        d += ` L ${B.x} ${B.y}`;
        continue;
      }

      // Compute direction vectors for this segment
      const fromDir = Wire._getSegmentFromDir(points, i, sourceDir);
      const toDir   = Wire._getSegmentToDir(points, i + 1, targetDir);

      // Compute control point distances
      const segDist = Math.hypot(B.x - A.x, B.y - A.y);
      const scale = Math.max(
        WIRE_BEZIER_MIN_CONTROL,
        Math.min(WIRE_BEZIER_MAX_CONTROL, segDist * WIRE_BEZIER_CONTROL_FACTOR)
      );

      // Adaptive scale based on direction projection
      const fromProj = (B.x - A.x) * fromDir.x + (B.y - A.y) * fromDir.y;
      const toProj   = -((B.x - A.x) * toDir.x + (B.y - A.y) * toDir.y);

      const fromScale = fromProj > 0
        ? Math.max(WIRE_BEZIER_MIN_CONTROL, Math.min(WIRE_BEZIER_MAX_CONTROL, fromProj * WIRE_BEZIER_CONTROL_FACTOR))
        : scale;
      const toScale = toProj > 0
        ? Math.max(WIRE_BEZIER_MIN_CONTROL, Math.min(WIRE_BEZIER_MAX_CONTROL, toProj * WIRE_BEZIER_CONTROL_FACTOR))
        : scale;

      const cx1 = A.x + fromDir.x * fromScale;
      const cy1 = A.y + fromDir.y * fromScale;
      const cx2 = B.x + toDir.x * toScale;
      const cy2 = B.y + toDir.y * toScale;

      d += ` C ${cx1} ${cy1} ${cx2} ${cy2} ${B.x} ${B.y}`;
    }

    return d;
  }

  /**
   * Get the "from" direction for segment starting at points[index].
   * This determines the tangent at the START of the segment.
   */
  static _getSegmentFromDir(points, index, sourceDir) {
    if (index === 0) {
      // Source port — use port direction
      return sourceDir || { x: 1, y: 0 };
    }
    // Waypoint — direction toward next point
    const curr = points[index];
    const next = points[index + 1];
    if (!next) return { x: 1, y: 0 };
    const dx = next.x - curr.x;
    const dy = next.y - curr.y;
    const len = Math.hypot(dx, dy);
    return len > 0 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
  }

  /**
   * Get the "to" direction for segment ending at points[index].
   * This determines the tangent at the END of the segment.
   * Points AWAY from the endpoint toward the previous point (inward).
   */
  static _getSegmentToDir(points, index, targetDir) {
    if (index === points.length - 1) {
      // Target port — use port direction (points inward toward wire)
      return targetDir || { x: -1, y: 0 };
    }
    // Waypoint — direction toward previous point (inward from this end)
    const curr = points[index];
    const prev = points[index - 1];
    if (!prev) return { x: -1, y: 0 };
    const dx = prev.x - curr.x;
    const dy = prev.y - curr.y;
    const len = Math.hypot(dx, dy);
    return len > 0 ? { x: dx / len, y: dy / len } : { x: -1, y: 0 };
  }

  /* ================================================================
   *  Static Bézier Path Computation (for previews / backward compat)
   * ================================================================ */

  /**
   * Compute a cubic Bézier SVG path string from two port positions and their directions.
   * Used for wiring previews and simple 2-point connections.
   */
  static computeBezierPath(fromPos, toPos, fromDir, toDir) {
    const sx = fromPos.x, sy = fromPos.y;
    const tx = toPos.x, ty = toPos.y;

    // If approximately aligned, use straight line
    if (Math.abs(sx - tx) < WIRE_COAXIAL_THRESHOLD || Math.abs(sy - ty) < WIRE_COAXIAL_THRESHOLD) {
      return `M ${sx} ${sy} L ${tx} ${ty}`;
    }

    const fd = fromDir || { x: 1, y: 0 };
    const td = toDir || { x: -1, y: 0 };

    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.hypot(dx, dy);

    const baseControlDist = Math.max(
      WIRE_BEZIER_MIN_CONTROL,
      Math.min(WIRE_BEZIER_MAX_CONTROL, dist * WIRE_BEZIER_CONTROL_FACTOR)
    );

    const fromProjection = dx * fd.x + dy * fd.y;
    const toProjection   = -(dx * td.x + dy * td.y);

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

  /**
   * Static convenience: compute an SVG path string directly.
   * Used for previews and fallback rendering where no wire instance exists.
   */
  static computePath(fromPos, toPos, opts = {}) {
    const { sourceNodeId, targetNodeId, fromDir, toDir } = opts;
    const fd = fromDir || Wire.getPortDirection(sourceNodeId);
    const td = toDir   || Wire.getPortDirection(targetNodeId);
    return Wire.computeBezierPath(fromPos, toPos, fd, td);
  }

  /* ================================================================
   *  SVG Path Helpers
   * ================================================================ */

  /**
   * Convert an array of {x,y} points to an SVG path "d" string.
   * For simple 4-point Bézier, generates cubic Bézier.
   * Otherwise, generates segment-by-segment path.
   */
  static pointsToSVGPath(points, isBezier = false) {
    if (!points || points.length < 2) return '';
    if (isBezier && points.length === 4) {
      return `M ${points[0].x} ${points[0].y} C ${points[1].x} ${points[1].y} ${points[2].x} ${points[2].y} ${points[3].x} ${points[3].y}`;
    }
    // Simple polyline fallback
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  }

  /**
   * Sample points along a cubic Bézier curve defined by 4 control points.
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
   */
  static svgPathToPoints(d) {
    const points = [];
    if (!d) return points;

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
        for (let i = 0; i + 5 < nums.length; i += 6) {
          const cp1x = nums[i], cp1y = nums[i + 1];
          const cp2x = nums[i + 2], cp2y = nums[i + 3];
          const endX = nums[i + 4], endY = nums[i + 5];

          const bezierPoints = [
            { x: currentX, y: currentY },
            { x: cp1x, y: cp1y },
            { x: cp2x, y: cp2y },
            { x: endX, y: endY }
          ];
          const sampled = Wire.sampleBezierPoints(bezierPoints, 8);
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
   *  SVG Rendering
   * ================================================================ */

  /**
   * Create SVG elements and render the wire on the svgLayer.
   */
  render(svgLayer, getNodePosition, busBarY = null, router = null) {
    if (this.element) return;

    const fromPos = getNodePosition(this.sourceNode.nodeId);
    const toPos   = getNodePosition(this.targetNode.nodeId);

    this._sourcePos = { ...fromPos };
    this._targetPos = { ...toPos };

    // Compute path using segment-by-segment rendering
    const sourceDir = this.getSourceDirection();
    const targetDir = this.getTargetDirection();
    const d = Wire.computeSegmentPath(fromPos, toPos, this.waypoints, sourceDir, targetDir);

    // Create SVG group
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.dataset.wireId = this.id;
    group.style.pointerEvents = 'auto';

    const style = getComputedStyle(document.documentElement);
    const neutralColor = style.getPropertyValue('--wire-neutral-color').trim() || '#888';

    // ─── Glow layer ───
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

    // ─── Junction dot (hidden for Bézier-style wires) ───
    const junctionDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    junctionDot.setAttribute('r', JUNCTION_RADIUS);
    junctionDot.setAttribute('fill', neutralColor);
    junctionDot.setAttribute('pointer-events', 'none');
    junctionDot.classList.add('wire-junction');
    junctionDot.setAttribute('cx', fromPos.x);
    junctionDot.setAttribute('cy', fromPos.y);
    junctionDot.style.display = 'none';

    // ─── Endpoint markers ───
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

    // Assemble group
    group.appendChild(glowPath);
    group.appendChild(visualPath);
    group.appendChild(hitPath);
    group.appendChild(junctionDot);
    group.appendChild(sourceDot);
    group.appendChild(targetDot);
    svgLayer.appendChild(group);

    this.element = group;
    this.updateOccupiedCells(d);
  }

  /* ================================================================
   *  Path Update Methods
   * ================================================================ */

  /**
   * Full re-route — recomputes the SVG path from current positions.
   * Called on explicit reroute or drop.
   */
  updatePath(getNodePosition, busBarY = null, router = null) {
    if (!this.element) return;

    const fromPos = getNodePosition(this.sourceNode.nodeId);
    const toPos   = getNodePosition(this.targetNode.nodeId);
    if (!fromPos || !toPos) return;

    this._sourcePos = { ...fromPos };
    this._targetPos = { ...toPos };

    this._recomputeAndApply();
  }

  /**
   * Stable endpoint update — fast update during drag.
   * Waypoints stay in place; only endpoints update.
   */
  updateEndpointsStable(fromPos, toPos) {
    if (!this.element) return;

    this._sourcePos = { ...fromPos };
    this._targetPos = { ...toPos };

    this._recomputeAndApply();
  }

  /**
   * Recompute the SVG path from current positions + waypoints and apply to all SVG elements.
   */
  _recomputeAndApply() {
    if (!this.element || !this._sourcePos || !this._targetPos) return;

    const sourceDir = this.getSourceDirection();
    const targetDir = this.getTargetDirection();
    const d = Wire.computeSegmentPath(
      this._sourcePos, this._targetPos, this.waypoints, sourceDir, targetDir
    );

    this.element.querySelector('.wire-visual').setAttribute('d', d);
    this.element.querySelector('.wire-hitarea').setAttribute('d', d);

    const glowPath = this.element.querySelector('.wire-glow');
    if (glowPath) glowPath.setAttribute('d', d);

    this.updateOccupiedCells(d);

    // Update junction dot position
    const junctionDot = this.element.querySelector('.wire-junction');
    if (junctionDot) {
      junctionDot.setAttribute('cx', this._sourcePos.x);
      junctionDot.setAttribute('cy', this._sourcePos.y);
    }

    // Update endpoint markers
    const sourceDot = this.element.querySelector('.wire-endpoint-source');
    if (sourceDot) {
      sourceDot.setAttribute('cx', this._sourcePos.x);
      sourceDot.setAttribute('cy', this._sourcePos.y);
    }
    const targetDot = this.element.querySelector('.wire-endpoint-target');
    if (targetDot) {
      targetDot.setAttribute('cx', this._targetPos.x);
      targetDot.setAttribute('cy', this._targetPos.y);
    }
  }

  /* ================================================================
   *  Hover & Glow Effects
   * ================================================================ */

  setHovered(hovered) {
    if (this._isHovered === hovered) return;
    this._isHovered = hovered;

    if (!this.element) return;

    const visualPath = this.element.querySelector('.wire-visual');
    const glowPath   = this.element.querySelector('.wire-glow');
    const sourceDot  = this.element.querySelector('.wire-endpoint-source');
    const targetDot  = this.element.querySelector('.wire-endpoint-target');

    if (hovered) {
      if (glowPath) {
        glowPath.style.display = '';
        glowPath.setAttribute('stroke', WIRE_DRAW_GLOW_COLOR);
      }
      if (visualPath) {
        visualPath.setAttribute('stroke-width', String(WIRE_VISUAL_WIDTH + 1));
      }
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
      if (glowPath) {
        glowPath.style.display = 'none';
        glowPath.setAttribute('stroke', 'transparent');
      }
      if (visualPath) {
        visualPath.setAttribute('stroke-width', String(WIRE_VISUAL_WIDTH));
      }
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
   *  Wire Net Tracing
   * ================================================================ */

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
   *  Waypoint Management (Control Points)
   * ================================================================ */

  /**
   * Add a waypoint at a given position.
   * @param {number} index – Position in waypoints array (0 … waypoints.length)
   * @param {{x:number,y:number}} point
   */
  addControlPoint(index, point) {
    if (index < 0 || index > this.waypoints.length) return;

    const snapped = {
      x: Math.round(point.x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(point.y / GRID_SIZE) * GRID_SIZE
    };

    this.waypoints.splice(index, 0, snapped);
    this._recomputeAndApply();
  }

  /**
   * Remove a waypoint by index.
   * @param {number} index – Index in waypoints array
   */
  removeControlPoint(index) {
    if (index < 0 || index >= this.waypoints.length) return;

    this.waypoints.splice(index, 1);
    this._recomputeAndApply();
  }

  /**
   * Move a waypoint to a new position (snapped to grid).
   * @param {number} index – Index in pathPoints (1 = first waypoint, etc.)
   * @param {{x:number,y:number}} newPos
   * @param {boolean} [snapToGrid=true]
   */
  moveControlPoint(index, newPos, snapToGrid = true) {
    // Convert pathPoints index to waypoints index
    const wpIndex = index - 1;
    if (wpIndex < 0 || wpIndex >= this.waypoints.length) {
      // Might be trying to move an endpoint — not allowed
      return;
    }

    let x = newPos.x;
    let y = newPos.y;

    if (snapToGrid) {
      x = Math.round(x / GRID_SIZE) * GRID_SIZE;
      y = Math.round(y / GRID_SIZE) * GRID_SIZE;
    }

    this.waypoints[wpIndex] = { x, y };
    this._recomputeAndApply();
  }

  /**
   * Insert a waypoint at the closest point on the wire path.
   * Used when clicking on a wire segment.
   * @param {{x:number,y:number}} canvasPos – Click position in canvas coordinates
   * @returns {number} The index in pathPoints where the waypoint was inserted
   */
  addWaypointAtPosition(canvasPos) {
    if (!this._sourcePos || !this._targetPos) return -1;

    const allPoints = this.pathPoints;
    if (allPoints.length < 2) return -1;

    // Find the closest segment
    let bestSegIdx = 0;
    let bestDist = Infinity;
    let bestPoint = null;

    for (let i = 0; i < allPoints.length - 1; i++) {
      const A = allPoints[i];
      const B = allPoints[i + 1];

      // Check if this segment is a straight line or Bézier
      const isCoaxial = Math.abs(A.x - B.x) < WIRE_COAXIAL_THRESHOLD ||
                         Math.abs(A.y - B.y) < WIRE_COAXIAL_THRESHOLD;

      if (isCoaxial) {
        // Straight line — use point-to-segment distance
        const result = this._closestPointOnSegment(canvasPos, A, B);
        if (result.dist < bestDist) {
          bestDist = result.dist;
          bestSegIdx = i;
          bestPoint = result.point;
        }
      } else {
        // Bézier curve — sample and find closest
        const sourceDir = (i === 0) ? this.getSourceDirection() :
          Wire._getSegmentFromDir(allPoints, i, this.getSourceDirection());
        const targetDir = (i + 1 === allPoints.length - 1) ? this.getTargetDirection() :
          Wire._getSegmentToDir(allPoints, i + 1, this.getTargetDirection());

        const segDist = Math.hypot(B.x - A.x, B.y - A.y);
        const scale = Math.max(
          WIRE_BEZIER_MIN_CONTROL,
          Math.min(WIRE_BEZIER_MAX_CONTROL, segDist * WIRE_BEZIER_CONTROL_FACTOR)
        );

        const fromProj = (B.x - A.x) * sourceDir.x + (B.y - A.y) * sourceDir.y;
        const toProj   = -((B.x - A.x) * targetDir.x + (B.y - A.y) * targetDir.y);

        const fromScale = fromProj > 0
          ? Math.max(WIRE_BEZIER_MIN_CONTROL, Math.min(WIRE_BEZIER_MAX_CONTROL, fromProj * WIRE_BEZIER_CONTROL_FACTOR))
          : scale;
        const toScale = toProj > 0
          ? Math.max(WIRE_BEZIER_MIN_CONTROL, Math.min(WIRE_BEZIER_MAX_CONTROL, toProj * WIRE_BEZIER_CONTROL_FACTOR))
          : scale;

        const c1 = { x: A.x + sourceDir.x * fromScale, y: A.y + sourceDir.y * fromScale };
        const c2 = { x: B.x + targetDir.x * toScale, y: B.y + targetDir.y * toScale };

        // Sample the Bézier curve
        const bezierPoints = [A, c1, c2, B];
        const sampled = Wire.sampleBezierPoints(bezierPoints, 20);

        for (let j = 0; j < sampled.length; j++) {
          const d = Math.hypot(canvasPos.x - sampled[j].x, canvasPos.y - sampled[j].y);
          if (d < bestDist) {
            bestDist = d;
            bestSegIdx = i;
            bestPoint = sampled[j];
          }
        }
      }
    }

    if (bestPoint) {
      // Snap to grid
      const snapped = {
        x: Math.round(bestPoint.x / GRID_SIZE) * GRID_SIZE,
        y: Math.round(bestPoint.y / GRID_SIZE) * GRID_SIZE
      };

      // Insert waypoint after bestSegIdx in pathPoints terms
      // pathPoints = [source, ...waypoints, target]
      // bestSegIdx is the index of the start point of the segment
      // The waypoint should be inserted at waypoints index = bestSegIdx
      const wpIndex = bestSegIdx;
      this.waypoints.splice(wpIndex, 0, snapped);
      this._recomputeAndApply();

      // Return the index in pathPoints (source is index 0, waypoints start at 1)
      return wpIndex + 1;
    }

    return -1;
  }

  /**
   * Find the closest point on a line segment AB to point P.
   */
  _closestPointOnSegment(P, A, B) {
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      return { point: { ...A }, dist: Math.hypot(P.x - A.x, P.y - A.y) };
    }

    let t = ((P.x - A.x) * dx + (P.y - A.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const point = {
      x: A.x + t * dx,
      y: A.y + t * dy
    };

    return {
      point,
      dist: Math.hypot(P.x - point.x, P.y - point.y)
    };
  }

  /* ================================================================
   *  Control Handle Visualization
   * ================================================================ */

  /** Show draggable control-point handles at each waypoint. */
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
   * Render control handle circles at each waypoint.
   */
  _renderControlHandles() {
    if (!this.element) return;
    this._removeControlHandleElements();

    const allPoints = this.pathPoints;
    if (allPoints.length < 3) {
      // No waypoints — just show "+" handles at segment midpoints
      this._renderAddPointHandles(allPoints);
      return;
    }

    const handleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    handleGroup.classList.add('wire-control-handles');

    // Handles for waypoints (indices 1 to length-2 in pathPoints)
    for (let i = 1; i < allPoints.length - 1; i++) {
      const pt = allPoints[i];

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

    // "+" indicators at segment midpoints
    for (let i = 0; i < allPoints.length - 1; i++) {
      const p1 = allPoints[i];
      const p2 = allPoints[i + 1];
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

  /**
   * Render only the "+" add-point handles (for wires with no waypoints yet).
   */
  _renderAddPointHandles(allPoints) {
    const handleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    handleGroup.classList.add('wire-control-handles');

    for (let i = 0; i < allPoints.length - 1; i++) {
      const p1 = allPoints[i];
      const p2 = allPoints[i + 1];
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
   *  Visual State (Color)
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

    if (this._isError) return;

    const prevValue = this._lastSourceValue;
    this._lastSourceValue = sourceValue;
    const visualPath = this.element.querySelector('.wire-visual');

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let color, dashArray;
    if (sourceValue === true) {
      color = highColor;
      dashArray = highDash === 'none' ? null : highDash;
      if (visualPath && prevValue !== true && !prefersReducedMotion) {
        visualPath.classList.remove('propagating-low');
        visualPath.classList.add('propagating-high');
        setTimeout(() => visualPath.classList.remove('propagating-high'), 200);
      }
    } else if (sourceValue === null) {
      color = zColor;
      dashArray = zDash;
    } else {
      color = neutralColor;
      dashArray = neutralDash === 'none' ? null : neutralDash;
      if (visualPath && prevValue === true && !prefersReducedMotion) {
        visualPath.classList.remove('propagating-high');
        visualPath.classList.add('propagating-low');
        setTimeout(() => visualPath.classList.remove('propagating-low'), 200);
      }
    }

    this.element.querySelector('.wire-visual')?.setAttribute('stroke', color);
    if (dashArray) {
      this.element.querySelector('.wire-visual')?.setAttribute('stroke-dasharray', dashArray);
    } else {
      this.element.querySelector('.wire-visual')?.removeAttribute('stroke-dasharray');
    }
  }

  /* ================================================================
   *  Junction (simplified — hidden for Bézier-style wires)
   * ================================================================ */

  showJunction() {
    const junctionDot = this.element?.querySelector('.wire-junction');
    if (junctionDot) junctionDot.style.display = '';
  }

  hideJunction() {
    const junctionDot = this.element?.querySelector('.wire-junction');
    if (junctionDot) junctionDot.style.display = 'none';
  }

  /* ================================================================
   *  Lock / Unlock (removed — no-ops for backward compat)
   * ================================================================ */

  lock()   { /* Lock feature removed */ }
  unlock() { /* Lock feature removed */ }

  /* ================================================================
   *  Routing Mode (removed — no-ops for backward compat)
   * ================================================================ */

  setRoutingMode(mode) { /* No-op — all wires use segment-by-segment rendering */ }

  /* ================================================================
   *  Legacy Compatibility
   * ================================================================ */

  clearPathPoints() {
    this.waypoints = [];
    this._sourcePos = null;
    this._targetPos = null;
    this.occupiedCells.clear();
  }

  forceReroute(getNodePosition, busBarY = null, router = null) {
    // Clear waypoints and recompute
    this.waypoints = [];
    this.updatePath(getNodePosition, busBarY, router);
  }

  updateOccupiedCells(d) {
    this.occupiedCells.clear();
    if (!d) return;
    const gs = GRID_SIZE;
    const points = Wire.svgPathToPoints(d);
    if (points.length < 2) return;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / gs));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const cx = Math.round((p1.x + t * (p2.x - p1.x)) / gs) * gs;
        const cy = Math.round((p1.y + t * (p2.y - p1.y)) / gs) * gs;
        this.occupiedCells.add(`${cx},${cy}`);
      }
    }
  }

  /** Backward compat — not used but referenced in some places */
  setRoutingFallback() { /* no-op */ }
  get isRoutingFallback() { return false; }
}
