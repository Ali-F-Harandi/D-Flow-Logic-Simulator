import { GRID_SIZE } from '../../config.js';

/**
 * WireEditHandler — manages manual wire editing interactions:
 * - Dragging control points on selected wires
 * - Adding new control points (click on segment midpoint or double-click)
 * - Removing control points (right-click or double-click)
 * - Showing/hiding control handles when wires are selected/deselected
 *
 * USAGE INSTRUCTIONS (shown to user on first wire selection):
 * 1. Click a wire to select it → green control points appear
 * 2. DRAG green points to adjust wire shape
 * 3. Double-click a wire segment to ADD a new control point
 * 4. Double-click a control point to REMOVE it
 * 5. Right-click a control point for context menu options
 */
export class WireEditHandler {
  // Track if instruction toast has been shown (once per session)
  static _instructionShown = false;

  constructor(wiring, core, positionCache, canvas) {
    this.wiring = wiring;
    this.core = core;
    this.positionCache = positionCache;
    this.canvas = canvas;

    // State for control point dragging
    this._dragging = false;
    this._dragWire = null;
    this._dragPointIndex = -1;
    this._dragStartPos = null;

    // Currently edited wire (the one with visible control handles)
    this._activeWire = null;
  }

  get isDragging() { return this._dragging; }

  /**
   * Show control handles for a wire and hide them for others.
   * Also shows a brief instruction toast for first-time users.
   * @param {Wire} wire - The wire to show handles for, or null to hide all
   */
  setActiveWire(wire) {
    // Hide handles on previous active wire
    if (this._activeWire && this._activeWire !== wire) {
      this._activeWire.hideControlHandles();
    }

    this._activeWire = wire;

    if (wire) {
      wire.showControlHandles();
      // Show instruction toast (only once per session)
      if (!WireEditHandler._instructionShown && this.wiring.wires.length > 0) {
        WireEditHandler._instructionShown = true;
        if (this.canvas?.toaster) {
          this.canvas.toaster.show(
            'Wire Edit: Drag green points to adjust. Double-click wire to add point. Double-click point to remove.',
            'info', 6000
          );
        }
      }
    }
  }

  /**
   * Hide all control handles.
   */
  clearActive() {
    if (this._activeWire) {
      this._activeWire.hideControlHandles();
      this._activeWire = null;
    }
  }

  /**
   * Check if a mouse/touch event target is a wire control point.
   * @param {HTMLElement} target - The event target
   * @returns {Object|null} { wireId, pointIndex, type: 'control'|'add' } or null
   */
  hitTestControlPoint(target) {
    if (!target) return null;

    // Check for control point outer ring (larger hit target)
    if (target.classList.contains('wire-control-point-outer')) {
      return {
        wireId: target.dataset.wireId,
        pointIndex: parseInt(target.dataset.pointIndex),
        type: 'control'
      };
    }

    // Check for control point (visible inner circle)
    if (target.classList.contains('wire-control-point')) {
      return {
        wireId: target.dataset.wireId,
        pointIndex: parseInt(target.dataset.pointIndex),
        type: 'control'
      };
    }

    // Check for add-point handle (clickable midpoint)
    if (target.classList.contains('wire-add-point')) {
      return {
        wireId: target.dataset.wireId,
        afterIndex: parseInt(target.dataset.afterIndex),
        type: 'add'
      };
    }

    return null;
  }

  /**
   * Start dragging a control point.
   * @param {string} wireId - The wire ID
   * @param {number} pointIndex - Index of the control point to drag
   * @param {number} clientX - Mouse/touch X
   * @param {number} clientY - Mouse/touch Y
   */
  startDrag(wireId, pointIndex, clientX, clientY) {
    const wire = this.wiring.wires.find(w => w.id === wireId);
    if (!wire || pointIndex < 1 || pointIndex >= wire.pathPoints.length - 1) return false;

    this._dragging = true;
    this._dragWire = wire;
    this._dragPointIndex = pointIndex;
    this._dragStartPos = { x: clientX, y: clientY };

    // Change cursor
    document.body.style.cursor = 'grabbing';

    return true;
  }

  /**
   * Update control point position during drag.
   * Snaps to grid for clean Manhattan routing.
   * @param {number} clientX - Mouse/touch X
   * @param {number} clientY - Mouse/touch Y
   */
  moveDrag(clientX, clientY) {
    if (!this._dragging || !this._dragWire) return;

    // Convert screen coordinates to canvas coordinates
    const canvasPos = this.core.canvasCoords(clientX, clientY);

    // Snap to grid for clean Manhattan routing
    this._dragWire.moveControlPoint(this._dragPointIndex, canvasPos, true);
  }

  /**
   * End control point drag.
   */
  endDrag() {
    if (!this._dragging) return;

    // Record final position for undo
    if (this._dragWire && this._dragPointIndex >= 0) {
      const newPos = this._dragWire.pathPoints[this._dragPointIndex];
      // Could create undo command here if undoManager is available
    }

    this._dragging = false;
    this._dragWire = null;
    this._dragPointIndex = -1;
    this._dragStartPos = null;

    document.body.style.cursor = '';

    // Rebuild obstacle cache and update crossings since wire path changed
    this.wiring.rebuildObstacleCache();
    this.wiring.updateWireCrossings();
  }

  /**
   * Add a new control point at a segment midpoint.
   * @param {string} wireId - The wire ID
   * @param {number} afterIndex - Add point after this index in pathPoints
   * @param {number} clientX - Mouse/touch X
   * @param {number} clientY - Mouse/touch Y
   */
  addPointAtSegment(wireId, afterIndex, clientX, clientY) {
    const wire = this.wiring.wires.find(w => w.id === wireId);
    if (!wire) return;

    // Convert to canvas coordinates
    const canvasPos = this.core.canvasCoords(clientX, clientY);

    // Snap to grid
    const x = Math.round(canvasPos.x / GRID_SIZE) * GRID_SIZE;
    const y = Math.round(canvasPos.y / GRID_SIZE) * GRID_SIZE;

    wire.addControlPoint(afterIndex + 1, { x, y });
    wire.refreshControlHandles();

    // Now start dragging the new point
    this.startDrag(wireId, afterIndex + 1, clientX, clientY);
  }

  /**
   * Remove a control point (right-click or double-click).
   * @param {string} wireId - The wire ID
   * @param {number} pointIndex - Index of the point to remove
   */
  removePoint(wireId, pointIndex) {
    const wire = this.wiring.wires.find(w => w.id === wireId);
    if (!wire) return;

    wire.removeControlPoint(pointIndex);
    wire.refreshControlHandles();

    // Rebuild obstacle cache
    this.wiring.rebuildObstacleCache();
  }

  /**
   * Handle a double-click on a wire segment to add a control point.
   * @param {Object} canvasPos - {x, y} position in canvas coordinates
   * @param {Wire} wire - The wire to add the point to
   */
  addPointAtPosition(canvasPos, wire) {
    if (!wire || wire.pathPoints.length < 2) return;

    // Find the closest segment
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < wire.pathPoints.length - 1; i++) {
      const p1 = wire.pathPoints[i];
      const p2 = wire.pathPoints[i + 1];
      const dist = this._pointToSegmentDist(canvasPos, p1, p2);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    // Snap to grid
    const x = Math.round(canvasPos.x / GRID_SIZE) * GRID_SIZE;
    const y = Math.round(canvasPos.y / GRID_SIZE) * GRID_SIZE;

    wire.addControlPoint(bestIdx + 1, { x, y });
    wire.refreshControlHandles();
  }

  /**
   * Calculate distance from a point to a line segment.
   */
  _pointToSegmentDist(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);

    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    return Math.hypot(p.x - projX, p.y - projY);
  }
}
