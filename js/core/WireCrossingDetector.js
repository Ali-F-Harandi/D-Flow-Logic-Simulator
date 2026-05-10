/**
 * WireCrossingDetector — detects crossings between orthogonal wire segments
 * and generates SVG arc segments for bridge/jump visualization.
 */
export class WireCrossingDetector {
  constructor() {
    this._crossings = [];
    this._bridgeRadius = 4;   // Radius of jump arc
    this._bridgeOffset = 1;   // Gap before/after arc (reduced from 2 for better visibility)
    this._style = 'ansi';     // 'ansi' = bridge/jump arcs, 'iec' = junction dots only
  }

  /**
   * Set crossing display style.
   * @param {string} style - 'ansi' for bridge/jump arcs, 'iec' for junction dots only
   */
  setStyle(style) {
    this._style = style;
  }

  /**
   * Detect all crossings between wires.
   * @param {Array} wires - Array of Wire objects with pathPoints
   * @returns {Array} Array of crossing objects {x, y, wire1Id, wire2Id, hasConnection}
   */
  detectCrossings(wires) {
    this._crossings = [];

    for (let i = 0; i < wires.length; i++) {
      for (let j = i + 1; j < wires.length; j++) {
        const w1 = wires[i];
        const w2 = wires[j];
        if (!w1.pathPoints || w1.pathPoints.length < 2) continue;
        if (!w2.pathPoints || w2.pathPoints.length < 2) continue;

        // Check if wires share a node (junction, not crossing)
        const hasConnection = w1.fromNode.nodeId === w2.fromNode.nodeId ||
                              w1.fromNode.nodeId === w2.toNode.nodeId ||
                              w1.toNode.nodeId === w2.fromNode.nodeId ||
                              w1.toNode.nodeId === w2.toNode.nodeId;

        // Get segments from each wire
        const segments1 = this._getSegments(w1.pathPoints);
        const segments2 = this._getSegments(w2.pathPoints);

        for (const s1 of segments1) {
          for (const s2 of segments2) {
            const crossing = this._findSegmentCrossing(s1, s2);
            if (crossing) {
              this._crossings.push({
                x: crossing.x,
                y: crossing.y,
                wire1Id: w1.id,
                wire2Id: w2.id,
                horizontalWireId: s1.isHorizontal ? w1.id : w2.id,
                hasConnection
              });
            }
          }
        }
      }
    }
    return this._crossings;
  }

  /**
   * Extract segments from pathPoints array.
   * Each segment is {x1, y1, x2, y2, isHorizontal, isVertical}
   */
  _getSegments(points) {
    const segments = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const isHorizontal = Math.abs(p2.y - p1.y) < 1;
      const isVertical = Math.abs(p2.x - p1.x) < 1;
      if (isHorizontal || isVertical) {
        segments.push({
          x1: Math.min(p1.x, p2.x), y1: Math.min(p1.y, p2.y),
          x2: Math.max(p1.x, p2.x), y2: Math.max(p1.y, p2.y),
          isHorizontal, isVertical
        });
      }
    }
    return segments;
  }

  /**
   * Find the intersection point of a horizontal and vertical segment.
   * Returns {x, y} or null.
   */
  _findSegmentCrossing(s1, s2) {
    let hSeg, vSeg;
    if (s1.isHorizontal && s2.isVertical) {
      hSeg = s1; vSeg = s2;
    } else if (s1.isVertical && s2.isHorizontal) {
      hSeg = s2; vSeg = s1;
    } else {
      return null; // Both same orientation — no crossing possible
    }

    // Horizontal segment: y is constant, x varies
    // Vertical segment: x is constant, y varies
    const crossX = vSeg.x1; // vSeg.x1 === vSeg.x2
    const crossY = hSeg.y1; // hSeg.y1 === hSeg.y2

    // Check if crossing point is within both segments
    if (crossX >= hSeg.x1 && crossX <= hSeg.x2 &&
        crossY >= vSeg.y1 && crossY <= vSeg.y2) {
      return { x: crossX, y: crossY };
    }
    return null;
  }

  /**
   * Apply bridge/jump arcs to wire SVG paths.
   * Modifies the SVG path of the horizontal wire at each crossing,
   * and adds gaps on the vertical wire at each crossing.
   * @param {Array} wires - Array of Wire objects
   * @returns {Array} Modified wire IDs
   */
  applyBridges(wires) {
    if (this._style !== 'ansi') return [];
    if (this._crossings.length === 0) return [];

    const modifiedWireIds = new Set();

    // Group crossings by the horizontal wire
    const crossingsByHWire = {};
    // Group crossings by the vertical wire
    const crossingsByVWire = {};

    for (const crossing of this._crossings) {
      if (crossing.hasConnection) continue; // Don't bridge junctions
      const hWireId = crossing.horizontalWireId;
      // Determine vertical wire ID (the other wire)
      const vWireId = crossing.wire1Id === hWireId ? crossing.wire2Id : crossing.wire1Id;

      if (!crossingsByHWire[hWireId]) crossingsByHWire[hWireId] = [];
      crossingsByHWire[hWireId].push(crossing);

      if (!crossingsByVWire[vWireId]) crossingsByVWire[vWireId] = [];
      crossingsByVWire[vWireId].push(crossing);
    }

    // For each horizontal wire with crossings, add bridge arcs
    for (const [wireId, crossings] of Object.entries(crossingsByHWire)) {
      const wire = wires.find(w => w.id === wireId);
      if (!wire || !wire.pathPoints || wire.pathPoints.length < 2) continue;

      // Build modified SVG path with bridge arcs
      let d = `M ${wire.pathPoints[0].x} ${wire.pathPoints[0].y}`;

      for (let i = 1; i < wire.pathPoints.length; i++) {
        const prev = wire.pathPoints[i - 1];
        const curr = wire.pathPoints[i];
        const isHorizontal = Math.abs(curr.y - prev.y) < 1;

        if (isHorizontal) {
          const segMinX = Math.min(prev.x, curr.x);
          const segMaxX = Math.max(prev.x, curr.x);
          const segY = prev.y;
          const goingRight = curr.x > prev.x;

          // Filter crossings for this segment
          const segCrossings = crossings.filter(c =>
            c.y === segY && c.x >= segMinX && c.x <= segMaxX
          );

          if (segCrossings.length === 0) {
            d += ` L ${curr.x} ${curr.y}`;
            continue;
          }

          // Sort crossings in order of travel along the segment
          if (goingRight) {
            segCrossings.sort((a, b) => a.x - b.x);
          } else {
            segCrossings.sort((a, b) => b.x - a.x);
          }

          let x = prev.x;
          for (const crossing of segCrossings) {
            const bridgeStart = crossing.x - this._bridgeOffset - this._bridgeRadius;
            const bridgeEnd = crossing.x + this._bridgeOffset + this._bridgeRadius;

            // Near side = bridge boundary closer to current drawing position
            // Far side  = bridge boundary closer to the segment end
            const nearSide = goingRight ? bridgeStart : bridgeEnd;
            const farSide  = goingRight ? bridgeEnd : bridgeStart;

            // Draw line from current position to the near side of the bridge
            const shouldDraw = goingRight ? (nearSide > x) : (nearSide < x);
            if (shouldDraw) {
              d += ` L ${nearSide} ${segY}`;
            }
            // Draw arc over crossing.
            // sweep-flag: 1 (clockwise) when going right, 0 (counter-clockwise) when going left.
            // Both produce an upward bump that looks like a bridge.
            const sweepFlag = goingRight ? 1 : 0;
            d += ` A ${this._bridgeRadius} ${this._bridgeRadius} 0 0 ${sweepFlag} ${farSide} ${segY}`;
            x = farSide;
          }
          // Draw remaining segment to curr.x
          d += ` L ${curr.x} ${curr.y}`;
        } else {
          // Vertical segment — no bridge needed (horizontal wire jumps over)
          d += ` L ${curr.x} ${curr.y}`;
        }
      }

      // Apply modified path
      if (wire.element) {
        const visualPath = wire.element.querySelector('.wire-visual');
        const hitPath = wire.element.querySelector('.wire-hitarea');
        if (visualPath) visualPath.setAttribute('d', d);
        // Keep hit path as simple line (no arcs for hit testing)
      }
      modifiedWireIds.add(wireId);
    }

    // For each vertical wire with crossings, add gaps with thin pass-through lines
    for (const [wireId, crossings] of Object.entries(crossingsByVWire)) {
      const wire = wires.find(w => w.id === wireId);
      if (!wire || !wire.pathPoints || wire.pathPoints.length < 2) continue;

      // Build modified SVG path with gaps at crossings
      // Instead of completely hiding the vertical wire, we draw a thin line
      // through the gap to show the wire passing under the bridge
      let d = `M ${wire.pathPoints[0].x} ${wire.pathPoints[0].y}`;
      const gapSize = this._bridgeOffset + this._bridgeRadius;

      for (let i = 1; i < wire.pathPoints.length; i++) {
        const prev = wire.pathPoints[i - 1];
        const curr = wire.pathPoints[i];
        const isVertical = Math.abs(curr.x - prev.x) < 1;

        if (isVertical) {
          const segX = prev.x;
          const segMinY = Math.min(prev.y, curr.y);
          const segMaxY = Math.max(prev.y, curr.y);
          const goingDown = curr.y > prev.y;

          // Filter crossings that belong to this segment
          const segCrossings = crossings.filter(c =>
            c.x === segX && c.y >= segMinY && c.y <= segMaxY
          );

          if (segCrossings.length === 0) {
            // No crossings on this segment — draw straight through
            d += ` L ${curr.x} ${curr.y}`;
            continue;
          }

          // Sort crossings in order of travel along the segment
          if (goingDown) {
            segCrossings.sort((a, b) => a.y - b.y);
          } else {
            segCrossings.sort((a, b) => b.y - a.y);
          }

          let y = prev.y;
          for (const crossing of segCrossings) {
            const gapNearSide = goingDown ? (crossing.y - gapSize) : (crossing.y + gapSize);
            const gapFarSide  = goingDown ? (crossing.y + gapSize) : (crossing.y - gapSize);

            // Draw line from current position to the near side of the gap
            const shouldDraw = goingDown
              ? (gapNearSide > y)
              : (gapNearSide < y);
            if (shouldDraw) {
              d += ` L ${segX} ${gapNearSide}`;
            }
            // Draw a thin dashed line through the gap to show the wire passing under
            // This makes the wire visible under the bridge while maintaining the ANSI convention
            d += ` L ${segX} ${crossing.y - 1}`;
            d += ` M ${segX} ${crossing.y + 1}`;
            // Jump to far side of gap
            d += ` M ${segX} ${gapFarSide}`;
            y = gapFarSide;
          }
          // Draw remaining segment to curr.y
          d += ` L ${curr.x} ${curr.y}`;
        } else {
          // Horizontal segment — no gap needed
          d += ` L ${curr.x} ${curr.y}`;
        }
      }

      // Apply modified path for vertical wire.
      if (wire.element) {
        const visualPath = wire.element.querySelector('.wire-visual');
        if (visualPath) {
          if (modifiedWireIds.has(wireId)) {
            this._applyVerticalGapsToExistingPath(wire, crossings, gapSize);
          } else {
            visualPath.setAttribute('d', d);
          }
        }
      }
      modifiedWireIds.add(wireId);
    }

    return [...modifiedWireIds];
  }

  /**
   * Get all detected crossings.
   */
  getCrossings() { return this._crossings; }

  /* ─── Internal: Combined Bridge + Gap Application ─── */

  /**
   * Apply vertical gaps to a wire that already has horizontal bridge arcs.
   * Builds a combined path from pathPoints that includes both modifications.
   * This is needed when a single wire has crossings where it is horizontal
   * AND crossings where it is vertical (different segments of the same wire).
   *
   * @param {Wire} wire
   * @param {Array} verticalCrossings - Crossings where this wire is vertical
   * @param {number} gapSize
   */
  _applyVerticalGapsToExistingPath(wire, verticalCrossings, gapSize) {
    if (!wire.element || !wire.pathPoints || wire.pathPoints.length < 2) return;

    const visualPath = wire.element.querySelector('.wire-visual');
    if (!visualPath) return;

    // Get horizontal crossings for this wire (already applied as bridges)
    const hWireId = wire.id;
    const hCrossings = this._crossings.filter(c =>
      c.horizontalWireId === hWireId && !c.hasConnection
    );

    let d = `M ${wire.pathPoints[0].x} ${wire.pathPoints[0].y}`;

    for (let i = 1; i < wire.pathPoints.length; i++) {
      const prev = wire.pathPoints[i - 1];
      const curr = wire.pathPoints[i];
      const isHorizontal = Math.abs(curr.y - prev.y) < 1;
      const isVertical = Math.abs(curr.x - prev.x) < 1;

      if (isHorizontal) {
        // Apply bridge arcs (same logic as the horizontal loop above)
        const segMinX = Math.min(prev.x, curr.x);
        const segMaxX = Math.max(prev.x, curr.x);
        const segY = prev.y;
        const goingRight = curr.x > prev.x;

        const segHCrossings = hCrossings.filter(c =>
          c.y === segY && c.x >= segMinX && c.x <= segMaxX
        );

        if (segHCrossings.length === 0) {
          d += ` L ${curr.x} ${curr.y}`;
          continue;
        }

        if (goingRight) {
          segHCrossings.sort((a, b) => a.x - b.x);
        } else {
          segHCrossings.sort((a, b) => b.x - a.x);
        }

        let x = prev.x;
        for (const crossing of segHCrossings) {
          const bridgeStart = crossing.x - this._bridgeOffset - this._bridgeRadius;
          const bridgeEnd = crossing.x + this._bridgeOffset + this._bridgeRadius;
          if (goingRight ? (bridgeStart > x) : (bridgeStart < x)) {
            d += ` L ${bridgeStart} ${segY}`;
          }
          // Fix: Use direction-aware sweep flag (was always 1, causing wrong arc for left-going wires)
          const sweepFlag = goingRight ? 1 : 0;
          d += ` A ${this._bridgeRadius} ${this._bridgeRadius} 0 0 ${sweepFlag} ${bridgeEnd} ${segY}`;
          x = bridgeEnd;
        }
        if (goingRight ? (curr.x > x) : (curr.x < x)) {
          d += ` L ${curr.x} ${curr.y}`;
        }

      } else if (isVertical) {
        // Apply gaps (direction-aware logic)
        const segX = prev.x;
        const segMinY = Math.min(prev.y, curr.y);
        const segMaxY = Math.max(prev.y, curr.y);
        const goingDown = curr.y > prev.y;

        const segVCrossings = verticalCrossings.filter(c =>
          c.x === segX && c.y >= segMinY && c.y <= segMaxY
        );

        if (segVCrossings.length === 0) {
          d += ` L ${curr.x} ${curr.y}`;
          continue;
        }

        if (goingDown) {
          segVCrossings.sort((a, b) => a.y - b.y);
        } else {
          segVCrossings.sort((a, b) => b.y - a.y);
        }

        let y = prev.y;
        for (const crossing of segVCrossings) {
          const gapNearSide = goingDown ? (crossing.y - gapSize) : (crossing.y + gapSize);
          const gapFarSide  = goingDown ? (crossing.y + gapSize) : (crossing.y - gapSize);
          const shouldDraw = goingDown ? (gapNearSide > y) : (gapNearSide < y);
          if (shouldDraw) {
            d += ` L ${segX} ${gapNearSide}`;
          }
          // Draw thin line through the gap to show wire passing under bridge
          d += ` L ${segX} ${crossing.y - 1}`;
          d += ` M ${segX} ${crossing.y + 1}`;
          d += ` M ${segX} ${gapFarSide}`;
          y = gapFarSide;
        }
        d += ` L ${curr.x} ${curr.y}`;

      } else {
        // Diagonal segment (shouldn't happen in Manhattan routing)
        d += ` L ${curr.x} ${curr.y}`;
      }
    }

    visualPath.setAttribute('d', d);
  }
}
