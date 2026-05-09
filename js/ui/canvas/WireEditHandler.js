/**
 * WireEditHandler — manages manual wire editing interactions
 *
 * Handles:
 *   - Dragging control points on selected wires
 *   - Adding new control points (click on segment midpoint / double-click)
 *   - Removing control points (right-click / double-click on point)
 *   - Showing/hiding control handles when wires are selected/deselected
 *
 * All point coordinates are snapped to GRID_SIZE.
 *
 * Usage:
 *   1. Click a wire to select it → green control points appear
 *   2. DRAG green points to adjust wire shape
 *   3. Double-click a wire segment to ADD a new control point
 *   4. Double-click a control point to REMOVE it
 *   5. Right-click a control point for context menu options
 */

import { GRID_SIZE } from '../../config.js';

export class WireEditHandler {
  static _instructionShown = false;

  constructor(wiring, core, positionCache, canvas) {
    this.wiring        = wiring;
    this.core          = core;
    this.positionCache = positionCache;
    this.canvas        = canvas;

    // Drag state
    this._dragging       = false;
    this._dragWire       = null;
    this._dragPointIndex = -1;
    this._dragStartPos   = null;

    // Currently edited wire (with visible control handles)
    this._activeWire = null;
  }

  get isDragging() { return this._dragging; }

  /* ─── Active Wire Management ─── */

  /**
   * Show control handles for a wire and hide them for others.
   * @param {Wire} wire – The wire to show handles for, or null to hide all
   */
  setActiveWire(wire) {
    if (this._activeWire && this._activeWire !== wire) {
      this._activeWire.hideControlHandles();
    }
    this._activeWire = wire;

    if (wire) {
      wire.showControlHandles();
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

  /** Hide all control handles. */
  clearActive() {
    if (this._activeWire) {
      this._activeWire.hideControlHandles();
      this._activeWire = null;
    }
  }

  /* ─── Hit Testing ─── */

  /**
   * Check if a mouse/touch target is a wire control point.
   * @param {HTMLElement} target
   * @returns {{ wireId:string, pointIndex:number, type:'control'|'add' } | null}
   */
  hitTestControlPoint(target) {
    if (!target) return null;

    if (target.classList.contains('wire-control-point-outer') ||
        target.classList.contains('wire-control-point')) {
      return {
        wireId:     target.dataset.wireId,
        pointIndex: parseInt(target.dataset.pointIndex),
        type:       'control'
      };
    }

    if (target.classList.contains('wire-add-point')) {
      return {
        wireId:    target.dataset.wireId,
        afterIndex: parseInt(target.dataset.afterIndex),
        type:      'add'
      };
    }

    return null;
  }

  /* ─── Drag Operations ─── */

  /**
   * Start dragging a control point.
   */
  startDrag(wireId, pointIndex, clientX, clientY) {
    const wire = this.wiring.wires.find(w => w.id === wireId);
    if (!wire || pointIndex < 1 || pointIndex >= wire.pathPoints.length - 1) return false;

    this._dragging       = true;
    this._dragWire       = wire;
    this._dragPointIndex = pointIndex;
    this._dragStartPos   = { x: clientX, y: clientY };

    document.body.style.cursor = 'grabbing';
    return true;
  }

  /**
   * Update control point position during drag.
   * Snaps to grid for clean Manhattan routing.
   */
  moveDrag(clientX, clientY) {
    if (!this._dragging || !this._dragWire) return;

    const canvasPos = this.core.canvasCoords(clientX, clientY);
    this._dragWire.moveControlPoint(this._dragPointIndex, canvasPos, true);
  }

  /**
   * End control point drag.
   */
  endDrag() {
    if (!this._dragging) return;

    this._dragging       = false;
    this._dragWire       = null;
    this._dragPointIndex = -1;
    this._dragStartPos   = null;

    document.body.style.cursor = '';

    // Update crossings since wire path changed
    this.wiring.updateWireCrossings();
  }

  /* ─── Add / Remove Points ─── */

  /**
   * Add a new control point at a segment midpoint.
   */
  addPointAtSegment(wireId, afterIndex, clientX, clientY) {
    const wire = this.wiring.wires.find(w => w.id === wireId);
    if (!wire) return;

    const canvasPos = this.core.canvasCoords(clientX, clientY);
    const x = Math.round(canvasPos.x / GRID_SIZE) * GRID_SIZE;
    const y = Math.round(canvasPos.y / GRID_SIZE) * GRID_SIZE;

    wire.addControlPoint(afterIndex + 1, { x, y });
    wire.refreshControlHandles();

    // Start dragging the new point
    this.startDrag(wireId, afterIndex + 1, clientX, clientY);
  }

  /**
   * Remove a control point (right-click or double-click).
   */
  removePoint(wireId, pointIndex) {
    const wire = this.wiring.wires.find(w => w.id === wireId);
    if (!wire) return;

    wire.removeControlPoint(pointIndex);
    wire.refreshControlHandles();
    this.wiring.updateWireCrossings();
  }

  /**
   * Add a control point at a specific canvas position.
   * Finds the closest segment and inserts the point there.
   */
  addPointAtPosition(canvasPos, wire) {
    if (!wire || wire.pathPoints.length < 2) return;

    let bestIdx  = 0;
    let bestDist = Infinity;

    for (let i = 0; i < wire.pathPoints.length - 1; i++) {
      const p1 = wire.pathPoints[i];
      const p2 = wire.pathPoints[i + 1];
      const dist = this._pointToSegmentDist(canvasPos, p1, p2);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx  = i;
      }
    }

    const x = Math.round(canvasPos.x / GRID_SIZE) * GRID_SIZE;
    const y = Math.round(canvasPos.y / GRID_SIZE) * GRID_SIZE;

    wire.addControlPoint(bestIdx + 1, { x, y });
    wire.refreshControlHandles();
  }

  /* ─── Geometry Helper ─── */

  _pointToSegmentDist(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);

    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }
}
