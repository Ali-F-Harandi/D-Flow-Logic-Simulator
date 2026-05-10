/**
 * WireNudger.js — Post-routing wire nudging for clean parallel wire bundling
 *
 * After A* routing, multiple wires may share the same vertical channel or
 * horizontal bus bar, causing visual overlap. The nudger shifts overlapping
 * parallel segments apart by small offsets to create clean, readable bundles.
 *
 * Algorithm:
 *   1. Collect all horizontal segments at each Y coordinate
 *   2. Detect overlapping segments (same Y, overlapping X range)
 *   3. For each overlap group, offset wires by ±(wireSpacing/2, wireSpacing, ...)
 *   4. Repeat for vertical segments at each X coordinate
 *   5. Update junction dots at T-connection points
 *
 * The nudger only moves segments of auto-routed wires (isAutoRouted=true).
 * Manual wires are never nudged.
 */

import { GRID_SIZE } from '../config.js';

export class WireNudger {

  /* ─── Constructor ─── */

  /**
   * @param {Object} [config]
   * @param {number} [config.gridSize]     - Grid cell size (default: GRID_SIZE)
   * @param {number} [config.wireSpacing]  - Spacing between parallel wires (default: GRID_SIZE * 0.6)
   * @param {number} [config.maxNudge]     - Maximum nudge offset (default: GRID_SIZE * 2)
   */
  constructor(config = {}) {
    this.gridSize    = config.gridSize    || GRID_SIZE;
    this.wireSpacing = config.wireSpacing || GRID_SIZE * 0.6;
    this.maxNudge    = config.maxNudge    || GRID_SIZE * 2;
  }

  /* ─── Public API ─── */

  /**
   * Nudge overlapping wire segments apart.
   * Modifies wire.pathPoints in place.
   *
   * @param {Array<Wire>} wires - Array of Wire objects with pathPoints
   * @returns {number} Number of segments nudged
   */
  nudge(wires) {
    let nudgeCount = 0;

    // Separate auto-routed and manual wires
    const autoWires  = wires.filter(w => !w.isManualMode && w.pathPoints.length >= 2);
    const manualWires = wires.filter(w => w.isManualMode && w.pathPoints.length >= 2);

    // Phase 1: Nudge horizontal segments
    nudgeCount += this._nudgeHorizontal(autoWires, manualWires);

    // Phase 2: Nudge vertical segments
    nudgeCount += this._nudgeVertical(autoWires, manualWires);

    return nudgeCount;
  }

  /* ─── Horizontal Segment Nudging ─── */

  /**
   * Find overlapping horizontal segments and offset them.
   * Two segments overlap if they share the same Y coordinate
   * and their X ranges intersect.
   */
  _nudgeHorizontal(autoWires, manualWires) {
    let count = 0;

    // Group horizontal segments by Y coordinate
    const yGroups = new Map(); // y → [{wireIndex, segIndex, x1, x2}]

    // Process auto-routed wires
    for (let wi = 0; wi < autoWires.length; wi++) {
      const wire = autoWires[wi];
      for (let si = 0; si < wire.pathPoints.length - 1; si++) {
        const p1 = wire.pathPoints[si];
        const p2 = wire.pathPoints[si + 1];

        // Check if horizontal
        if (Math.abs(p2.y - p1.y) < 1) {
          const y = Math.round(p1.y);
          if (!yGroups.has(y)) yGroups.set(y, []);
          yGroups.get(y).push({
            wireIndex: wi,
            segIndex: si,
            x1: Math.min(p1.x, p2.x),
            x2: Math.max(p1.x, p2.x),
            isManual: false
          });
        }
      }
    }

    // Process manual wires (used for overlap detection but not nudged)
    for (let wi = 0; wi < manualWires.length; wi++) {
      const wire = manualWires[wi];
      for (let si = 0; si < wire.pathPoints.length - 1; si++) {
        const p1 = wire.pathPoints[si];
        const p2 = wire.pathPoints[si + 1];

        if (Math.abs(p2.y - p1.y) < 1) {
          const y = Math.round(p1.y);
          if (!yGroups.has(y)) yGroups.set(y, []);
          yGroups.get(y).push({
            wireIndex: wi,
            segIndex: si,
            x1: Math.min(p1.x, p2.x),
            x2: Math.max(p1.x, p2.x),
            isManual: true
          });
        }
      }
    }

    // For each Y group, find overlapping segments and nudge
    for (const [y, segments] of yGroups) {
      if (segments.length <= 1) continue;

      // Sort by X1
      segments.sort((a, b) => a.x1 - b.x1);

      // Find overlapping groups
      const groups = this._findOverlapGroups(segments);

      for (const group of groups) {
        if (group.length <= 1) continue;

        // Count auto-routed wires in this group
        const autoSegments = group.filter(s => !s.isManual);
        if (autoSegments.length <= 1) continue;

        // Nudge auto-routed segments apart
        for (let i = 0; i < autoSegments.length; i++) {
          const seg = autoSegments[i];
          const offset = this._computeOffset(i, autoSegments.length);
          if (offset === 0) continue;

          const wire = autoWires[seg.wireIndex];
          this._nudgeSegmentY(wire, seg.segIndex, offset);
          count++;
        }
      }
    }

    return count;
  }

  /* ─── Vertical Segment Nudging ─── */

  /**
   * Find overlapping vertical segments and offset them.
   */
  _nudgeVertical(autoWires, manualWires) {
    let count = 0;

    // Group vertical segments by X coordinate
    const xGroups = new Map(); // x → [{wireIndex, segIndex, y1, y2}]

    for (let wi = 0; wi < autoWires.length; wi++) {
      const wire = autoWires[wi];
      for (let si = 0; si < wire.pathPoints.length - 1; si++) {
        const p1 = wire.pathPoints[si];
        const p2 = wire.pathPoints[si + 1];

        if (Math.abs(p2.x - p1.x) < 1) {
          const x = Math.round(p1.x);
          if (!xGroups.has(x)) xGroups.set(x, []);
          xGroups.get(x).push({
            wireIndex: wi,
            segIndex: si,
            y1: Math.min(p1.y, p2.y),
            y2: Math.max(p1.y, p2.y),
            isManual: false
          });
        }
      }
    }

    for (let wi = 0; wi < manualWires.length; wi++) {
      const wire = manualWires[wi];
      for (let si = 0; si < wire.pathPoints.length - 1; si++) {
        const p1 = wire.pathPoints[si];
        const p2 = wire.pathPoints[si + 1];

        if (Math.abs(p2.x - p1.x) < 1) {
          const x = Math.round(p1.x);
          if (!xGroups.has(x)) xGroups.set(x, []);
          xGroups.get(x).push({
            wireIndex: wi,
            segIndex: si,
            y1: Math.min(p1.y, p2.y),
            y2: Math.max(p1.y, p2.y),
            isManual: true
          });
        }
      }
    }

    for (const [x, segments] of xGroups) {
      if (segments.length <= 1) continue;

      segments.sort((a, b) => a.y1 - b.y1);

      const groups = this._findOverlapGroups(segments, true);

      for (const group of groups) {
        if (group.length <= 1) continue;

        const autoSegments = group.filter(s => !s.isManual);
        if (autoSegments.length <= 1) continue;

        for (let i = 0; i < autoSegments.length; i++) {
          const seg = autoSegments[i];
          const offset = this._computeOffset(i, autoSegments.length);
          if (offset === 0) continue;

          const wire = autoWires[seg.wireIndex];
          this._nudgeSegmentX(wire, seg.segIndex, offset);
          count++;
        }
      }
    }

    return count;
  }

  /* ─── Overlap Detection ─── */

  /**
   * Find groups of overlapping segments.
   * Uses a sweep-line approach.
   */
  _findOverlapGroups(segments, isVertical = false) {
    const groups = [];
    let currentGroup = [segments[0]];

    for (let i = 1; i < segments.length; i++) {
      const prev = currentGroup[currentGroup.length - 1];
      const curr = segments[i];

      // Check overlap: prev.max > curr.min
      const prevMax = isVertical ? prev.y2 : prev.x2;
      const currMin = isVertical ? curr.y1 : curr.x1;

      if (prevMax > currMin) {
        // Overlapping
        currentGroup.push(curr);
      } else {
        // No overlap — start new group
        if (currentGroup.length > 1) {
          groups.push([...currentGroup]);
        }
        currentGroup = [curr];
      }
    }

    if (currentGroup.length > 1) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /* ─── Offset Computation ─── */

  /**
   * Compute the nudge offset for the i-th wire in a group of n wires.
   * Distributes offsets symmetrically around the original position.
   *
   * @param {number} index - Wire index in overlap group (0-based)
   * @param {number} total - Total number of wires in group
   * @returns {number} Offset in pixels (0 for center wire)
   */
  _computeOffset(index, total) {
    if (total <= 1) return 0;

    // Center the offsets around 0
    // For total=2: offsets are [-spacing/2, +spacing/2]
    // For total=3: offsets are [-spacing, 0, +spacing]
    const spacing = this.wireSpacing;
    const center = (total - 1) / 2;
    const offset = (index - center) * spacing;

    // Clamp to max nudge
    return Math.max(-this.maxNudge, Math.min(this.maxNudge, offset));
  }

  /* ─── Segment Nudging ─── */

  /**
   * Nudge a horizontal segment's Y coordinate.
   * Updates both endpoints of the segment and the connected points
   * of adjacent segments.
   */
  _nudgeSegmentY(wire, segIndex, offset) {
    const pts = wire.pathPoints;

    // Update the two points of this segment
    pts[segIndex].y += offset;
    pts[segIndex + 1].y += offset;

    // If the point before this segment is not part of another
    // horizontal segment at the same Y, we need to insert a
    // small vertical adjustment segment
    if (segIndex > 0) {
      const prevPt = pts[segIndex - 1];
      const currPt = pts[segIndex];
      // If prev point doesn't share Y with current, add adjustment
      if (Math.abs(prevPt.y - currPt.y) > 1) {
        // The bend point naturally handles this — no insertion needed
      }
    }

    if (segIndex + 2 < pts.length) {
      const nextPt = pts[segIndex + 2];
      const currPt = pts[segIndex + 1];
      if (Math.abs(nextPt.y - currPt.y) > 1) {
        // Bend naturally handles this
      }
    }
  }

  /**
   * Nudge a vertical segment's X coordinate.
   */
  _nudgeSegmentX(wire, segIndex, offset) {
    const pts = wire.pathPoints;

    pts[segIndex].x += offset;
    pts[segIndex + 1].x += offset;
  }
}
