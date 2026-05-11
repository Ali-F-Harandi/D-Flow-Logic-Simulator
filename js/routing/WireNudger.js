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
import { Wire } from '../core/Wire.js';

export class WireNudger {

  /* ─── Constructor ─── */

  /**
   * @param {Object} [config]
   * @param {number} [config.gridSize]     - Grid cell size (default: GRID_SIZE)
   * @param {number} [config.wireSpacing]  - Spacing between parallel wires (default: GRID_SIZE)
   * @param {number} [config.maxNudge]     - Maximum nudge offset (default: GRID_SIZE * 2)
   */
  constructor(config = {}) {
    this.gridSize    = config.gridSize    || GRID_SIZE;
    this.wireSpacing = config.wireSpacing || GRID_SIZE;
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

    // BUG FIX: Also exclude Bézier wires — their pathPoints contain cubic
    // control points that are NOT on the actual curve. Nudging would distort
    // the Bézier curve. Direct wires have no segments to nudge either.
    const eligibleWires = wires.filter(w =>
      w.routingMode !== Wire.MODE_BEZIER && w.routingMode !== Wire.MODE_DIRECT
    );

    // Separate auto-routed and manual wires
    const autoWires  = eligibleWires.filter(w => !w.isManualMode && w.pathPoints.length >= 2);
    const manualWires = eligibleWires.filter(w => w.isManualMode && w.pathPoints.length >= 2);

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
        // Never touch segments that connect directly to a pin (first & last segments)
        if (si === 0 || si === wire.pathPoints.length - 2) continue;

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
        // Never touch segments that connect directly to a pin (first & last segments)
        if (si === 0 || si === wire.pathPoints.length - 2) continue;

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
   * Uses a two-phase approach: compute offsets, then validate orthogonality,
   * then apply. Protects endpoints (first/last points) from being moved.
   */
  _nudgeSegmentY(wire, segIndex, offset) {
    const pts = wire.pathPoints;
    const len = pts.length;

    // Protect endpoints: never move the first or last point
    if (segIndex === 0 || segIndex + 1 >= len - 1) return;

    // Phase 1: Apply the Y offset to the horizontal segment's two points
    pts[segIndex].y += offset;
    pts[segIndex + 1].y += offset;

    // Phase 2: Re-orthogonalize adjacent segments while protecting endpoints
    // The segment before this one should be vertical — ensure shared X
    if (segIndex > 0) {
      // Only adjust if the previous point is NOT an endpoint
      if (segIndex - 1 > 0) {
        pts[segIndex].x = pts[segIndex - 1].x;
      } else {
        // Previous point is an endpoint — move the current point's X to match
        // the endpoint's X (keep the endpoint fixed)
        pts[segIndex].x = pts[segIndex - 1].x;
      }
    }
    // The segment after this one should be vertical — ensure shared X
    if (segIndex + 2 < len) {
      if (segIndex + 2 < len - 1) {
        pts[segIndex + 1].x = pts[segIndex + 2].x;
      } else {
        // Next point is an endpoint — keep endpoint fixed, adjust our point
        pts[segIndex + 1].x = pts[segIndex + 2].x;
      }
    }

    // Phase 3: Validate orthogonality — ensure no diagonal segments
    this._validateOrthogonality(wire, segIndex);
  }

  /**
   * Nudge a vertical segment's X coordinate.
   * Uses a two-phase approach with endpoint protection.
   */
  _nudgeSegmentX(wire, segIndex, offset) {
    const pts = wire.pathPoints;
    const len = pts.length;

    // Protect endpoints: never move the first or last point
    if (segIndex === 0 || segIndex + 1 >= len - 1) return;

    // Phase 1: Apply the X offset to the vertical segment's two points
    pts[segIndex].x += offset;
    pts[segIndex + 1].x += offset;

    // Phase 2: Re-orthogonalize adjacent segments while protecting endpoints
    // The segment before this one should be horizontal — ensure shared Y
    if (segIndex > 0) {
      if (segIndex - 1 > 0) {
        pts[segIndex].y = pts[segIndex - 1].y;
      } else {
        pts[segIndex].y = pts[segIndex - 1].y;
      }
    }
    // The segment after this one should be horizontal — ensure shared Y
    if (segIndex + 2 < len) {
      if (segIndex + 2 < len - 1) {
        pts[segIndex + 1].y = pts[segIndex + 2].y;
      } else {
        pts[segIndex + 1].y = pts[segIndex + 2].y;
      }
    }

    // Phase 3: Validate orthogonality
    this._validateOrthogonality(wire, segIndex);
  }

  /**
   * Validate and fix orthogonality violations around the nudged segment.
   * Checks that each pair of consecutive segments is properly orthogonal
   * (one horizontal, one vertical). If a diagonal is detected, snaps
   * the interior point to restore orthogonality.
   */
  _validateOrthogonality(wire, segIndex) {
    const pts = wire.pathPoints;
    const len = pts.length;

    // Check segments around the nudged area
    const checkStart = Math.max(1, segIndex - 1);
    const checkEnd   = Math.min(len - 2, segIndex + 2);

    for (let i = checkStart; i <= checkEnd; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const next = (i + 1 < len) ? pts[i + 1] : null;

      if (!next) continue;

      // Check if prev→curr→next forms a proper Manhattan bend
      const prevToCurrHorizontal = Math.abs(curr.y - prev.y) < 1;
      const currToNextHorizontal = next && Math.abs(next.y - curr.y) < 1;
      const prevToCurrVertical   = Math.abs(curr.x - prev.x) < 1;
      const currToNextVertical   = next && Math.abs(next.x - curr.x) < 1;

      // If both segments are the same orientation, we have a collinear situation
      // that should have been simplified — not our concern here.
      // If neither segment is purely H or V, we have a diagonal violation.
      if (!prevToCurrHorizontal && !prevToCurrVertical) {
        // prev→curr is diagonal — snap curr to share X or Y with prev
        // Choose the axis that's closer to the expected direction
        if (i > 1) {
          // This is an interior point — snap to the closest grid axis
          const dx = Math.abs(curr.x - prev.x);
          const dy = Math.abs(curr.y - prev.y);
          if (dx < dy) {
            curr.x = prev.x;
          } else {
            curr.y = prev.y;
          }
        }
      }

      if (next && !currToNextHorizontal && !currToNextVertical) {
        // curr→next is diagonal — snap next to share X or Y with curr
        if (i + 1 < len - 1) {
          const dx = Math.abs(next.x - curr.x);
          const dy = Math.abs(next.y - curr.y);
          if (dx < dy) {
            next.x = curr.x;
          } else {
            next.y = curr.y;
          }
        }
      }
    }
  }
}
