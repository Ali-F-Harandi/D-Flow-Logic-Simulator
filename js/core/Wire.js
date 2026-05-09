import { WIRE_VISUAL_WIDTH, WIRE_HIT_WIDTH, JUNCTION_RADIUS, GRID_SIZE } from '../config.js';
import { AStarRouter } from './AStarRouter.js';

export class Wire {
  constructor(id, fromNode, toNode) {
    this.id = id;
    this.fromNode = fromNode;
    this.toNode = toNode;
    this.element = null;
    this.occupiedCells = new Set();  // Cached grid cells this wire occupies

    // --- Stable wire path storage ---
    // The wire path is stored as an array of {x, y} points.
    // Points[0] = source connector, Points[last] = target connector
    // Intermediate points = control/bend points
    this.pathPoints = [];            // Full path: [{x,y}, ...]
    this.manualControlPoints = [];   // User-defined intermediate points
    this._isManualMode = false;      // True if user has manually edited this wire
    this._controlHandlesVisible = false;
    this._isLocked = false;  // Locked wires are not affected by component moves
  }

  /**
   * Whether this wire has been manually edited by the user.
   * Manual wires keep their control points when endpoints move.
   */
  get isManualMode() { return this._isManualMode; }

  /**
   * Compute a Manhattan path using A* routing if a router is provided,
   * otherwise fall back to simple heuristic routing.
   * @param {Object} fromPos - { x, y }
   * @param {Object} toPos   - { x, y }
   * @param {Object} [opts]  - optional parameters
   * @param {number} [opts.minClearY] - a guaranteed safe Y below all components
   * @param {number} [opts.maxClearY] - a guaranteed safe Y above all components
   * @param {AStarRouter} [opts.router] - A* router instance for smart routing
   * @param {string} [opts.sourceNodeId] - source node ID for overlap checking
   * @returns {string} SVG path data
   */
  static computePath(fromPos, toPos, opts = {}) {
    const { router, sourceNodeId } = opts;

    // Try A* routing if a router is available
    if (router) {
      try {
        return router.computePath(fromPos, toPos, sourceNodeId, opts);
      } catch (e) {
        console.warn('A* routing failed, falling back to simple routing:', e);
      }
    }

    // Simple Manhattan routing fallback (with bidirectional bus bar support)
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

  /**
   * Update the cached set of grid cells this wire occupies.
   * Called after the wire path is computed/updated.
   * @param {string} d - SVG path data string
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
        const nx = nums[0];
        const ny = nums[1];
        if (type === 'L') {
          // Mark all cells along this segment
          const isHorizontal = Math.abs(ny - cy) < 1;
          const isVertical = Math.abs(nx - cx) < 1;
          if (isHorizontal) {
            const y = Math.round(cy / gs);
            const x1 = Math.round(Math.min(cx, nx) / gs);
            const x2 = Math.round(Math.max(cx, nx) / gs);
            for (let x = x1; x <= x2; x++) {
              this.occupiedCells.add(`${x},${y}`);
            }
          } else if (isVertical) {
            const x = Math.round(cx / gs);
            const y1 = Math.round(Math.min(cy, ny) / gs);
            const y2 = Math.round(Math.max(cy, ny) / gs);
            for (let y = y1; y <= y2; y++) {
              this.occupiedCells.add(`${x},${y}`);
            }
          }
        }
        cx = nx;
        cy = ny;
        for (let i = 2; i + 1 < nums.length; i += 2) {
          cx = nums[i];
          cy = nums[i + 1];
        }
        if (type === 'M') {
          cx = nums[0];
          cy = nums[1];
        }
      }
    }
  }

  /**
   * Convert path points array to SVG path data string.
   * @param {Array} points - Array of {x, y} objects
   * @returns {string} SVG path data
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
   * Parse SVG path data into an array of {x, y} points.
   * @param {string} d - SVG path data string
   * @returns {Array} Array of {x, y} objects
   */
  static svgPathToPoints(d) {
    const points = [];
    if (!d) return points;

    const commands = d.match(/[ML]\s*[\d.e+-]+/gi);
    if (!commands) return points;

    for (const cmd of commands) {
      const type = cmd[0];
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

  /**
   * Store the current path points from SVG path data.
   * @param {string} d - SVG path data string
   */
  storePathPoints(d) {
    this.pathPoints = Wire.svgPathToPoints(d);
  }

  /**
   * Get the current SVG path data, either from stored points or by computing.
   * In stable mode, this returns the stored path without re-computing.
   */
  getPath(fromPos, toPos, opts) {
    return Wire.computePath(fromPos, toPos, opts);
  }

  render(svgLayer, getNodePosition, busBarY = null, router = null) {
    if (this.element) return;

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.dataset.wireId = this.id;
    group.style.pointerEvents = 'auto';

    const style = getComputedStyle(document.documentElement);
    const neutralColor = style.getPropertyValue('--wire-neutral-color').trim() || '#888';

    const visualPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    visualPath.setAttribute('stroke', neutralColor);
    visualPath.setAttribute('stroke-width', WIRE_VISUAL_WIDTH);
    visualPath.setAttribute('fill', 'none');
    visualPath.setAttribute('pointer-events', 'none');
    visualPath.classList.add('wire-visual');

    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.setAttribute('stroke', 'transparent');
    hitPath.setAttribute('stroke-width', WIRE_HIT_WIDTH);
    hitPath.setAttribute('fill', 'none');
    hitPath.setAttribute('pointer-events', 'stroke');
    hitPath.classList.add('wire-hitarea');

    const junctionDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    junctionDot.setAttribute('r', JUNCTION_RADIUS);
    junctionDot.setAttribute('fill', neutralColor);
    junctionDot.setAttribute('pointer-events', 'none');
    junctionDot.classList.add('wire-junction');
    junctionDot.style.display = 'none';

    const fromPos = getNodePosition(this.fromNode.nodeId);
    const toPos = getNodePosition(this.toNode.nodeId);
    const d = this.getPath(fromPos, toPos, {
      minClearY: busBarY,
      router,
      sourceNodeId: this.fromNode.nodeId
    });

    visualPath.setAttribute('d', d);
    hitPath.setAttribute('d', d);

    // Cache the path points and occupied cells
    this.storePathPoints(d);
    this.updateOccupiedCells(d);

    junctionDot.setAttribute('cx', fromPos.x);
    junctionDot.setAttribute('cy', fromPos.y);

    group.appendChild(visualPath);
    group.appendChild(hitPath);
    group.appendChild(junctionDot);
    svgLayer.appendChild(group);

    this.element = group;
  }

  /**
   * Update wire path — full re-route using A* or simple routing.
   * Used for explicit reroute (button click) or initial creation.
   */
  updatePath(getNodePosition, busBarY = null, router = null) {
    if (!this.element) return;
    const fromPos = getNodePosition(this.fromNode.nodeId);
    const toPos = getNodePosition(this.toNode.nodeId);

    // If manual mode, just update endpoints while preserving control points
    if (this._isManualMode && this.pathPoints.length > 2) {
      this._updateEndpointsOnly(fromPos, toPos);
      return;
    }

    const d = this.getPath(fromPos, toPos, {
      minClearY: busBarY,
      router,
      sourceNodeId: this.fromNode.nodeId
    });

    this.element.querySelector('.wire-visual').setAttribute('d', d);
    this.element.querySelector('.wire-hitarea').setAttribute('d', d);

    // Cache the path points and occupied cells
    this.storePathPoints(d);
    this.updateOccupiedCells(d);

    const junctionDot = this.element.querySelector('.wire-junction');
    if (junctionDot) {
      junctionDot.setAttribute('cx', fromPos.x);
      junctionDot.setAttribute('cy', fromPos.y);
    }
  }

  /**
   * Update only the start and end points of the wire path,
   * preserving all intermediate control points.
   * This is the key to STABLE wire behavior — when a component moves,
   * the wire stretches to the new endpoint without rerouting.
   *
   * @param {Object} fromPos - New source connector position {x, y}
   * @param {Object} toPos - New target connector position {x, y}
   */
  _updateEndpointsOnly(fromPos, toPos) {
    if (this.pathPoints.length < 2) return;

    // Update first and last points
    const oldFirst = { ...this.pathPoints[0] };
    const oldLast = { ...this.pathPoints[this.pathPoints.length - 1] };

    this.pathPoints[0] = { x: fromPos.x, y: fromPos.y };
    this.pathPoints[this.pathPoints.length - 1] = { x: toPos.x, y: toPos.y };

    // If there are control points between the endpoint and the first interior point,
    // adjust them proportionally to maintain a reasonable shape.
    // Strategy: the first interior point connects to the start point.
    // We shift the first interior point by the same delta as the start point.
    if (this.pathPoints.length > 2) {
      const startDelta = {
        x: fromPos.x - oldFirst.x,
        y: fromPos.y - oldFirst.y
      };
      const endDelta = {
        x: toPos.x - oldLast.x,
        y: toPos.y - oldLast.y
      };

      // Shift the first interior point with the start delta
      this.pathPoints[1] = {
        x: this.pathPoints[1].x + startDelta.x,
        y: this.pathPoints[1].y + startDelta.y
      };

      // Shift the last interior point with the end delta
      if (this.pathPoints.length > 3) {
        this.pathPoints[this.pathPoints.length - 2] = {
          x: this.pathPoints[this.pathPoints.length - 2].x + endDelta.x,
          y: this.pathPoints[this.pathPoints.length - 2].y + endDelta.y
        };
      }
    }

    this._applyPathPointsToSVG();
  }

  /**
   * Stable endpoint update — when auto-routing is off, only adjust
   * the wire endpoints to match the new connector positions.
   * The intermediate control points are preserved exactly as-is.
   *
   * @param {Object} fromPos - New source connector position {x, y}
   * @param {Object} toPos - New target connector position {x, y}
   */
  updateEndpointsStable(fromPos, toPos) {
    if (!this.element) return;
    if (this._isLocked) return;  // Locked wires don't move

    if (this.pathPoints.length < 2) {
      // No stored path — fall back to simple straight line
      const d = `M ${fromPos.x} ${fromPos.y} L ${toPos.x} ${toPos.y}`;
      this.element.querySelector('.wire-visual').setAttribute('d', d);
      this.element.querySelector('.wire-hitarea').setAttribute('d', d);
      this.storePathPoints(d);
      this.updateOccupiedCells(d);
      return;
    }

    if (this._isManualMode) {
      this._updateEndpointsOnly(fromPos, toPos);
      return;
    }

    // For auto-routed wires with stored points:
    // Just update the first and last points, keep intermediates unchanged.
    // This gives a "stretchy" behavior that is stable and predictable.
    const oldFirst = { ...this.pathPoints[0] };
    const oldLast = { ...this.pathPoints[this.pathPoints.length - 1] };

    this.pathPoints[0] = { x: fromPos.x, y: fromPos.y };
    this.pathPoints[this.pathPoints.length - 1] = { x: toPos.x, y: toPos.y };

    // Shift the first interior point proportionally
    if (this.pathPoints.length > 2) {
      const startDelta = {
        x: fromPos.x - oldFirst.x,
        y: fromPos.y - oldFirst.y
      };
      const endDelta = {
        x: toPos.x - oldLast.x,
        y: toPos.y - oldLast.y
      };

      // Move first interior point with start
      this.pathPoints[1] = {
        x: this.pathPoints[1].x + startDelta.x,
        y: this.pathPoints[1].y + startDelta.y
      };

      // Move last interior point with end
      if (this.pathPoints.length > 3) {
        const lastIdx = this.pathPoints.length - 2;
        this.pathPoints[lastIdx] = {
          x: this.pathPoints[lastIdx].x + endDelta.x,
          y: this.pathPoints[lastIdx].y + endDelta.y
        };
      }
    }

    this._applyPathPointsToSVG();
  }

  /**
   * Apply the current pathPoints array to the SVG elements.
   */
  _applyPathPointsToSVG() {
    if (!this.element || this.pathPoints.length < 2) return;

    const d = Wire.pointsToSVGPath(this.pathPoints);
    this.element.querySelector('.wire-visual').setAttribute('d', d);
    this.element.querySelector('.wire-hitarea').setAttribute('d', d);
    this.updateOccupiedCells(d);

    const fromPos = this.pathPoints[0];
    const junctionDot = this.element.querySelector('.wire-junction');
    if (junctionDot) {
      junctionDot.setAttribute('cx', fromPos.x);
      junctionDot.setAttribute('cy', fromPos.y);
    }
  }

  /**
   * Force a full re-route of this wire, ignoring manual mode.
   * Used when the user clicks "Reroute All Wires".
   */
  forceReroute(getNodePosition, busBarY = null, router = null) {
    this._isManualMode = false;
    this.manualControlPoints = [];
    this.updatePath(getNodePosition, busBarY, router);
  }

  /**
   * Add a control point to the wire at a specific index.
   * @param {number} index - Position in pathPoints to insert (1 to length-1)
   * @param {Object} point - {x, y} coordinates
   */
  addControlPoint(index, point) {
    if (index < 1 || index >= this.pathPoints.length) return;
    this.pathPoints.splice(index, 0, { x: point.x, y: point.y });
    this._isManualMode = true;
    this._applyPathPointsToSVG();
  }

  /**
   * Remove a control point at the given index.
   * Cannot remove the first or last point (endpoints).
   * @param {number} index - Index of the point to remove
   */
  removeControlPoint(index) {
    if (index < 1 || index >= this.pathPoints.length - 1) return;
    this.pathPoints.splice(index, 1);
    this._applyPathPointsToSVG();
    if (this.pathPoints.length <= 2) {
      this._isManualMode = false;
    }
  }

  /**
   * Move a control point to a new position.
   * Snaps to grid by default.
   * @param {number} index - Index of the point to move
   * @param {Object} newPos - {x, y} new coordinates
   * @param {boolean} snapToGrid - Whether to snap to grid (default: true)
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

    // If moving an intermediate point, mark as manual
    if (index > 0 && index < this.pathPoints.length - 1) {
      this._isManualMode = true;
    }

    this._applyPathPointsToSVG();
  }

  /**
   * Show draggable control point handles on this wire.
   * Creates small circles at each intermediate bend point.
   */
  showControlHandles() {
    if (this._controlHandlesVisible) return;
    this._controlHandlesVisible = true;

    this._renderControlHandles();
  }

  /**
   * Render control handle circles at each intermediate path point.
   * Uses larger, more visible handles with clear visual affordance.
   * 
   * VISUAL DESIGN:
   * - Outer ring: large invisible hit area for easy grabbing (r=12)
   * - Middle ring: visible dashed ring for discoverability (r=7)
   * - Inner circle: solid colored dot (r=5) — the visible handle
   * - Add-point handles: dashed circles at segment midpoints
   */
  _renderControlHandles() {
    if (!this.element) return;

    // Remove existing handles first
    this._removeControlHandleElements();

    // Create a group for handles
    const handleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    handleGroup.classList.add('wire-control-handles');

    // Add handles for intermediate points (not first/last which are endpoints)
    for (let i = 1; i < this.pathPoints.length - 1; i++) {
      const pt = this.pathPoints[i];
      
      // Layer 1: Outer ring (hover target, very large for easy grabbing)
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
      
      // Layer 2: Middle ring (visible dashed ring for discoverability)
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
      
      // Layer 3: Inner circle (visible solid handle)
      const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      handle.setAttribute('cx', pt.x);
      handle.setAttribute('cy', pt.y);
      handle.setAttribute('r', '5');
      handle.setAttribute('fill', '#4ec9b0');
      handle.setAttribute('stroke', '#fff');
      handle.setAttribute('stroke-width', '2');
      handle.setAttribute('pointer-events', 'none');  // Outer ring handles events
      handle.classList.add('wire-control-point');
      handle.dataset.pointIndex = i;
      handle.dataset.wireId = this.id;
      handleGroup.appendChild(handle);
    }

    // Add "+" indicators at midpoints of segments for adding new points
    for (let i = 0; i < this.pathPoints.length - 1; i++) {
      const p1 = this.pathPoints[i];
      const p2 = this.pathPoints[i + 1];
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      
      // Only show add-point on segments longer than 2 grid cells
      const segLen = Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);
      if (segLen < GRID_SIZE * 2) continue;

      // Add-point handle (dashed circle with + sign)
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

      // Plus sign inside the add-point handle
      const plusH = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      plusH.setAttribute('x1', midX - 3);
      plusH.setAttribute('y1', midY);
      plusH.setAttribute('x2', midX + 3);
      plusH.setAttribute('y2', midY);
      plusH.setAttribute('stroke', '#4ec9b0');
      plusH.setAttribute('stroke-width', '1.5');
      plusH.setAttribute('pointer-events', 'none');
      handleGroup.appendChild(plusH);

      const plusV = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      plusV.setAttribute('x1', midX);
      plusV.setAttribute('y1', midY - 3);
      plusV.setAttribute('x2', midX);
      plusV.setAttribute('y2', midY + 3);
      plusV.setAttribute('stroke', '#4ec9b0');
      plusV.setAttribute('stroke-width', '1.5');
      plusV.setAttribute('pointer-events', 'none');
      handleGroup.appendChild(plusV);
    }

    this.element.appendChild(handleGroup);
  }

  /**
   * Remove all control handle SVG elements.
   */
  _removeControlHandleElements() {
    if (!this.element) return;
    const existing = this.element.querySelectorAll('.wire-control-handles');
    existing.forEach(g => g.remove());
  }

  /**
   * Hide control point handles.
   */
  hideControlHandles() {
    this._controlHandlesVisible = false;
    this._removeControlHandleElements();
  }

  /**
   * Refresh control handle positions after a point is moved.
   */
  refreshControlHandles() {
    if (this._controlHandlesVisible) {
      this._renderControlHandles();
    }
  }

  /**
   * Lock this wire — prevents any automatic changes.
   */
  lock() {
    this._isLocked = true;
  }

  /**
   * Unlock this wire — allows automatic changes again.
   */
  unlock() {
    this._isLocked = false;
  }

  /**
   * Whether this wire is locked (immune to automatic rerouting).
   */
  get isLocked() { return this._isLocked; }

  /**
   * Get the wire's current state: 'auto', 'manual', or 'locked'
   */
  get wireState() {
    if (this._isLocked) return 'locked';
    if (this._isManualMode) return 'manual';
    return 'auto';
  }

  updateColor(sourceValue) {
    if (this.element) {
      const style = getComputedStyle(document.documentElement);
      const highColor = style.getPropertyValue('--wire-high-color').trim() || '#00cc66';
      const neutralColor = style.getPropertyValue('--wire-neutral-color').trim() || '#888';
      const zColor = style.getPropertyValue('--wire-z-color').trim() || '#ff9800';

      let color;
      if (sourceValue === true) {
        color = highColor;
      } else if (sourceValue === null) {
        color = zColor;
        const visualPath = this.element.querySelector('.wire-visual');
        if (visualPath) {
          visualPath.setAttribute('stroke-dasharray', '6,4');
        }
      } else {
        color = neutralColor;
        const visualPath = this.element.querySelector('.wire-visual');
        if (visualPath) {
          visualPath.removeAttribute('stroke-dasharray');
        }
      }

      this.element.querySelector('.wire-visual').setAttribute('stroke', color);
      const junctionDot = this.element.querySelector('.wire-junction');
      if (junctionDot) {
        junctionDot.setAttribute('fill', color);
      }
    }
  }

  showJunction() {
    const junctionDot = this.element?.querySelector('.wire-junction');
    if (junctionDot) junctionDot.style.display = '';
  }

  hideJunction() {
    const junctionDot = this.element?.querySelector('.wire-junction');
    if (junctionDot) junctionDot.style.display = 'none';
  }
}
