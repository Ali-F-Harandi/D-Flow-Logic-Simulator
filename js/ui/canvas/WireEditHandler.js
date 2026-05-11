/**
 * WireEditHandler — manages manual wire editing interactions
 *
 * Handles:
 *   - Dragging waypoints on selected wires
 *   - Adding new waypoints (click on "+" handle or double-click on wire segment)
 *   - Removing waypoints (right-click / double-click on point)
 *   - Showing/hiding control handles when wires are selected/deselected
 *
 * ALL wires support control points now (not just Manual mode).
 * When a wire has no waypoints, only "+" add-point handles are shown.
 * When it has waypoints, both drag handles and "+" handles are shown.
 *
 * Usage:
 *   1. Click a wire to select it → green control handles appear
 *   2. DRAG green points to adjust wire shape
 *   3. Double-click a wire segment to ADD a new waypoint
 *   4. Double-click a waypoint to REMOVE it
 *   5. Right-click a waypoint for context menu options
 */

import { GRID_SIZE } from '../../config.js';
import { AddWirePointCommand, RemoveWirePointCommand, MoveWirePointCommand } from '../../utils/UndoManager.js';

export class WireEditHandler {
  static _instructionShown = false;

  constructor(wiring, core, positionCache, canvas, undoManager) {
    this.wiring        = wiring;
    this.core          = core;
    this.positionCache = positionCache;
    this.canvas        = canvas;
    this.undoManager   = undoManager;

    // Drag state
    this._dragging       = false;
    this._dragWire       = null;
    this._dragPointIndex = -1;
    this._dragStartPos   = null;
    this._dragOrigPointPos = null;

    // Currently edited wire (with visible control handles)
    this._activeWire = null;

    // Ghost preview for segment insertion
    this._ghostPreview = null;
  }

  get isDragging() { return this._dragging; }

  /* ─── Active Wire Management ─── */

  /**
   * Show control handles for a wire and hide them for others.
   * ALL wires now support control handles.
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
   * @param {string} wireId
   * @param {number} pointIndex — index in pathPoints (1 = first waypoint)
   * @param {number} clientX
   * @param {number} clientY
   */
  startDrag(wireId, pointIndex, clientX, clientY) {
    const wire = this.wiring.wires.find(w => w.id === wireId);
    if (!wire) return false;

    // pointIndex is in pathPoints terms (0=source, 1..n=waypoints, n+1=target)
    // Only allow dragging waypoints (not endpoints)
    const wpIndex = pointIndex - 1;
    if (wpIndex < 0 || wpIndex >= wire.waypoints.length) return false;

    this._dragging       = true;
    this._dragWire       = wire;
    this._dragPointIndex = pointIndex;
    this._dragStartPos   = { x: clientX, y: clientY };
    // Save original point position for undo
    this._dragOrigPointPos = { ...wire.waypoints[wpIndex] };

    document.body.style.cursor = 'grabbing';
    return true;
  }

  /**
   * Update control point position during drag.
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

    // Create undo command for the drag if the point moved
    if (this._dragWire && this._dragOrigPointPos && this.undoManager) {
      const wpIndex = this._dragPointIndex - 1;
      if (wpIndex >= 0 && wpIndex < this._dragWire.waypoints.length) {
        const currentPos = { ...this._dragWire.waypoints[wpIndex] };
        if (currentPos.x !== this._dragOrigPointPos.x || currentPos.y !== this._dragOrigPointPos.y) {
          const cmd = new MoveWirePointCommand(
            this.wiring, this._dragWire.id,
            this._dragPointIndex, this._dragOrigPointPos, currentPos
          );
          this.undoManager.execute(cmd);
        }
      }
    }

    this._dragging       = false;
    this._dragWire       = null;
    this._dragPointIndex = -1;
    this._dragStartPos   = null;
    this._dragOrigPointPos = null;

    document.body.style.cursor = '';
  }

  /* ─── Add / Remove Points ─── */

  /**
   * Add a new waypoint at a segment midpoint (from "+" handle click).
   */
  addPointAtSegment(wireId, afterIndex, clientX, clientY) {
    const wire = this.wiring.wires.find(w => w.id === wireId);
    if (!wire) return;

    const canvasPos = this.core.canvasCoords(clientX, clientY);
    const x = Math.round(canvasPos.x / GRID_SIZE) * GRID_SIZE;
    const y = Math.round(canvasPos.y / GRID_SIZE) * GRID_SIZE;
    // afterIndex is pathPoints index; waypoint index = afterIndex
    const insertIndex = afterIndex;
    const point = { x, y };

    // Use undo command
    if (this.undoManager) {
      const cmd = new AddWirePointCommand(this.wiring, wireId, insertIndex, point);
      this.undoManager.execute(cmd);
    } else {
      wire.addControlPoint(insertIndex, point);
      wire.refreshControlHandles();
    }

    // Start dragging the new point (pathPoints index = insertIndex + 1)
    this.startDrag(wireId, insertIndex + 1, clientX, clientY);
  }

  /**
   * Remove a waypoint (right-click or double-click).
   * @param {string} wireId
   * @param {number} pointIndex — index in pathPoints
   */
  removePoint(wireId, pointIndex) {
    const wire = this.wiring.wires.find(w => w.id === wireId);
    if (!wire) return;

    // Convert pathPoints index to waypoints index
    const wpIndex = pointIndex - 1;
    if (wpIndex < 0 || wpIndex >= wire.waypoints.length) return;

    // Use undo command
    if (this.undoManager) {
      const cmd = new RemoveWirePointCommand(this.wiring, wireId, pointIndex);
      this.undoManager.execute(cmd);
    } else {
      wire.removeControlPoint(wpIndex);
      wire.refreshControlHandles();
    }
  }

  /**
   * Add a waypoint at a specific canvas position on the wire.
   * Finds the closest segment and inserts the point there.
   * @param {{x:number,y:number}} canvasPos
   * @param {Wire} wire
   */
  addPointAtPosition(canvasPos, wire) {
    if (!wire) return;

    const pathIndex = wire.addWaypointAtPosition(canvasPos);
    if (pathIndex >= 0 && this.undoManager) {
      const wpIndex = pathIndex - 1;
      const point = wire.waypoints[wpIndex];
      if (point) {
        const cmd = new AddWirePointCommand(this.wiring, wire.id, wpIndex, point);
        this.undoManager.execute(cmd);
      }
    }

    wire.refreshControlHandles();
  }

  /* ─── Ghost Preview (Segment Insertion) ─── */

  showPointPreview(wireId, afterIndex) {
    const wire = this.wiring.wires.find(w => w.id === wireId);
    const allPoints = wire?.pathPoints;
    if (!wire || !allPoints || afterIndex < 0 || afterIndex >= allPoints.length - 1) return;

    const p1 = allPoints[afterIndex];
    const p2 = allPoints[afterIndex + 1];
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    if (!this._ghostPreview) {
      this._ghostPreview = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      this._ghostPreview.setAttribute('r', '6');
      this._ghostPreview.setAttribute('fill', 'rgba(78, 201, 176, 0.3)');
      this._ghostPreview.setAttribute('stroke', '#4ec9b0');
      this._ghostPreview.setAttribute('stroke-width', '1.5');
      this._ghostPreview.setAttribute('stroke-dasharray', '3,3');
      this._ghostPreview.setAttribute('pointer-events', 'none');
      this._ghostPreview.classList.add('wire-ghost-preview');
    }

    this._ghostPreview.setAttribute('cx', midX);
    this._ghostPreview.setAttribute('cy', midY);

    if (wire.element && !this._ghostPreview.parentNode) {
      wire.element.appendChild(this._ghostPreview);
    }
  }

  hidePointPreview() {
    if (this._ghostPreview && this._ghostPreview.parentNode) {
      this._ghostPreview.parentNode.removeChild(this._ghostPreview);
    }
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
