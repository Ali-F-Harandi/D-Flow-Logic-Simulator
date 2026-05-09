/**
 * Wire.js — Data Model for a circuit wire connection
 *
 * Each wire stores:
 *   - sourceNode / targetNode : the connected node references
 *   - routingMode             : 'direct' | 'manhattan' | 'manual'
 *   - controlPoints           : user-defined intermediate points (Manual mode)
 *   - pathPoints              : the computed / rendered path points
 *
 * Wires are "reactive": if a component moves, the path recalculates
 * unless in Manual mode with locked points.
 *
 * Rendering is separated from routing:
 *   - Routing → Wire.computePathPoints(router, opts) → pathPoints[]
 *   - Rendering → Wire._applyPathPointsToSVG() → SVG "d" attribute
 */

import { WIRE_VISUAL_WIDTH, WIRE_HIT_WIDTH, JUNCTION_RADIUS, GRID_SIZE } from '../config.js';

export class Wire {

  /* ─── Routing Mode Constants ─── */
  static MODE_DIRECT   = 'direct';
  static MODE_MANHATTAN = 'manhattan';
  static MODE_MANUAL   = 'manual';

  /* ================================================================
   *  Constructor
   * ================================================================ */

  constructor(id, sourceNode, targetNode, routingMode = Wire.MODE_MANHATTAN) {
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
  }

  /* ─── Backward Compatibility Aliases ─── */

  get fromNode() { return this.sourceNode; }
  set fromNode(v) { this.sourceNode = v; }
  get toNode()   { return this.targetNode; }
  set toNode(v)  { this.targetNode = v; }

  get isManualMode() { return this.routingMode === Wire.MODE_MANUAL; }

  get isLocked()  { return this._isLocked; }

  get wireState() {
    if (this._isLocked) return 'locked';
    if (this.routingMode === Wire.MODE_MANUAL) return 'manual';
    return 'auto';
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
      // Preserve current bends as editable control points
      this.controlPoints = this.pathPoints
        .slice(1, -1)
        .map(p => ({ x: p.x, y: p.y }));
    }
    this.routingMode = mode;
    if (mode !== Wire.MODE_MANUAL) {
      this.controlPoints = [];
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
   * @param {number}  [opts.minClearY]    – bus-bar Y (backward compat)
   * @param {number}  [opts.maxClearY]    – top-bar Y (backward compat)
   * @returns {string} SVG path "d" attribute
   */
  static computePath(fromPos, toPos, opts = {}) {
    const { router, sourceNodeId, minClearY, maxClearY } = opts;

    // Try using the injected Router instance
    if (router) {
      if (typeof router.route === 'function') {
        // New Router class
        const points = router.route(fromPos, toPos, 'manhattan', {
          sourceNodeId,
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

    if (tx >= sx - GRID_SIZE) {
      const mx1 = sx + 30;
      const mx2 = tx - 30;
      if (Math.abs(ty - sy) < GRID_SIZE) {
        const arcY = Math.min(sy, ty) - 40;
        return `M ${sx} ${sy} L ${mx1} ${sy} L ${mx1} ${arcY} L ${mx2} ${arcY} L ${mx2} ${ty} L ${tx} ${ty}`;
      }
      return `M ${sx} ${sy} L ${mx1} ${sy} L ${mx1} ${ty} L ${tx} ${ty}`;
    }

    // Backward routing
    const offset = 40;
    const busLevel = Math.max(
      Math.max(sy, ty) + offset,
      minClearY != null ? minClearY + 20 : Math.max(sy, ty) + 70
    );
    return `M ${sx} ${sy} L ${sx + offset} ${sy} L ${sx + offset} ${busLevel} L ${tx - offset} ${busLevel} L ${tx - offset} ${ty} L ${tx} ${ty}`;
  }

  /* ================================================================
   *  SVG Path Helpers
   * ================================================================ */

  /**
   * Convert an array of {x,y} points to an SVG path "d" string.
   */
  static pointsToSVGPath(points) {
    if (!points || points.length < 2) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  }

  /**
   * Parse an SVG "d" attribute into an array of {x,y} points.
   */
  static svgPathToPoints(d) {
    const points = [];
    if (!d) return points;
    const commands = d.match(/[ML]\s*[\d.e+-]+/gi);
    if (!commands) return points;
    for (const cmd of commands) {
      const nums = cmd.slice(1).trim().split(/[\s,]+/).map(Number);
      if (nums.length >= 2) {
        points.push({ x: nums[0], y: nums[1] });
        for (let i = 2; i + 1 < nums.length; i += 2) {
          points.push({ x: nums[i], y: nums[i + 1] });
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
    if (router && typeof router.route === 'function') {
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

    // Visual path
    const visualPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    visualPath.setAttribute('stroke', neutralColor);
    visualPath.setAttribute('stroke-width', WIRE_VISUAL_WIDTH);
    visualPath.setAttribute('fill', 'none');
    visualPath.setAttribute('pointer-events', 'none');
    visualPath.classList.add('wire-visual');
    visualPath.setAttribute('d', d);

    // Hit area
    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.setAttribute('stroke', 'transparent');
    hitPath.setAttribute('stroke-width', WIRE_HIT_WIDTH);
    hitPath.setAttribute('fill', 'none');
    hitPath.setAttribute('pointer-events', 'stroke');
    hitPath.classList.add('wire-hitarea');
    hitPath.setAttribute('d', d);

    // Junction dot
    const junctionDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    junctionDot.setAttribute('r', JUNCTION_RADIUS);
    junctionDot.setAttribute('fill', neutralColor);
    junctionDot.setAttribute('pointer-events', 'none');
    junctionDot.classList.add('wire-junction');
    junctionDot.setAttribute('cx', fromPos.x);
    junctionDot.setAttribute('cy', fromPos.y);
    junctionDot.style.display = 'none';

    group.appendChild(visualPath);
    group.appendChild(hitPath);
    group.appendChild(junctionDot);
    svgLayer.appendChild(group);

    this.element = group;
    this.updateOccupiedCells(d);
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
    if (router && typeof router.route === 'function') {
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
    this.updateOccupiedCells(d);

    const junctionDot = this.element.querySelector('.wire-junction');
    if (junctionDot) {
      junctionDot.setAttribute('cx', fromPos.x);
      junctionDot.setAttribute('cy', fromPos.y);
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

    if (this.pathPoints.length < 2) {
      const d = `M ${fromPos.x} ${fromPos.y} L ${toPos.x} ${toPos.y}`;
      this.element.querySelector('.wire-visual').setAttribute('d', d);
      this.element.querySelector('.wire-hitarea').setAttribute('d', d);
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

    const d = Wire.pointsToSVGPath(this.pathPoints);
    this.element.querySelector('.wire-visual').setAttribute('d', d);
    this.element.querySelector('.wire-hitarea').setAttribute('d', d);
    this.updateOccupiedCells(d);

    const junctionDot = this.element.querySelector('.wire-junction');
    if (junctionDot) {
      junctionDot.setAttribute('cx', this.pathPoints[0].x);
      junctionDot.setAttribute('cy', this.pathPoints[0].y);
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
    }

    // Sync controlPoints
    this.controlPoints = this.pathPoints.slice(1, -1).map(p => ({ x: p.x, y: p.y }));

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
    const neutralColor = style.getPropertyValue('--wire-neutral-color').trim() || '#888';
    const zColor       = style.getPropertyValue('--wire-z-color').trim()       || '#ff9800';

    let color;
    if (sourceValue === true) {
      color = highColor;
    } else if (sourceValue === null) {
      color = zColor;
      this.element.querySelector('.wire-visual')?.setAttribute('stroke-dasharray', '6,4');
    } else {
      color = neutralColor;
      this.element.querySelector('.wire-visual')?.removeAttribute('stroke-dasharray');
    }

    this.element.querySelector('.wire-visual')?.setAttribute('stroke', color);
    this.element.querySelector('.wire-junction')?.setAttribute('fill', color);
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
   *  Legacy Compatibility
   * ================================================================ */

  /** Reset all path data. Called before batch re-routing. */
  clearPathPoints() {
    this.pathPoints = [];
    this.controlPoints = [];
    this.occupiedCells.clear();
  }

  /** Force a full re-route, ignoring manual mode. */
  forceReroute(getNodePosition, busBarY = null, router = null) {
    if (this.routingMode === Wire.MODE_MANUAL) {
      this.routingMode = Wire.MODE_MANHATTAN;
      this.controlPoints = [];
    }
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
    const commands = d.match(/[ML]\s*[\d.e+-]+/gi);
    if (!commands) return;
    let cx = 0, cy = 0;
    for (const cmd of commands) {
      const type = cmd[0];
      const nums = cmd.slice(1).trim().split(/[\s,]+/).map(Number);
      if (nums.length >= 2) {
        const nx = nums[0], ny = nums[1];
        if (type === 'L') {
          const isH = Math.abs(ny - cy) < 1;
          const isV = Math.abs(nx - cx) < 1;
          if (isH) {
            const y = Math.round(cy / gs);
            for (let x = Math.round(Math.min(cx, nx) / gs); x <= Math.round(Math.max(cx, nx) / gs); x++) {
              this.occupiedCells.add(`${x},${y}`);
            }
          } else if (isV) {
            const x = Math.round(cx / gs);
            for (let y = Math.round(Math.min(cy, ny) / gs); y <= Math.round(Math.max(cy, ny) / gs); y++) {
              this.occupiedCells.add(`${x},${y}`);
            }
          }
        }
        cx = nx; cy = ny;
        for (let i = 2; i + 1 < nums.length; i += 2) { cx = nums[i]; cy = nums[i + 1]; }
        if (type === 'M') { cx = nums[0]; cy = nums[1]; }
      }
    }
  }

  /** Store path points from SVG path data (legacy compat). */
  storePathPoints(d) {
    this.pathPoints = Wire.svgPathToPoints(d);
  }
}
