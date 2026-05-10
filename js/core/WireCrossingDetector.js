/**
 * WireCrossingDetector — detects crossings between orthogonal wire segments
 * and generates SVG arc segments for bridge/jump visualization.
 *
 * ANSI style: The horizontal wire gets a semicircular "bridge" arc that
 * appears to jump over the vertical wire. The vertical wire is drawn fully
 * (no gap), and a background-colored cover strip is placed behind the arc
 * to visually separate the crossing. This ensures the vertical wire remains
 * visible on both sides of the bridge.
 *
 * IEC style: Junction dots only (no bridges).
 */
export class WireCrossingDetector {
  constructor() {
    this._crossings = [];
    this._bridgeRadius = 4;   // Radius of jump arc
    this._bridgeOffset = 2;   // Gap before/after arc
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

    const crossX = vSeg.x1; // vSeg.x1 === vSeg.x2
    const crossY = hSeg.y1; // hSeg.y1 === hSeg.y2

    if (crossX >= hSeg.x1 && crossX <= hSeg.x2 &&
        crossY >= vSeg.y1 && crossY <= vSeg.y2) {
      return { x: crossX, y: crossY };
    }
    return null;
  }

  /**
   * Apply bridge/jump arcs to wire SVG paths.
   *
   * For ANSI style:
   *   - Horizontal wires get bridge arcs at crossings
   *   - Background-colored cover strips are placed behind arcs to visually
   *     separate the bridge from the vertical wire beneath
   *   - Vertical wires are drawn fully (no gaps), ensuring they remain
   *     visible on both sides of every bridge
   *
   * @param {Array} wires - Array of Wire objects
   * @returns {Array} Modified wire IDs
   */
  applyBridges(wires) {
    if (this._style !== 'ansi') return [];
    if (this._crossings.length === 0) return [];

    const modifiedWireIds = new Set();

    // Remove any previous bridge cover elements
    for (const wire of wires) {
      if (wire.element) {
        wire.element.querySelectorAll('.bridge-cover').forEach(el => el.remove());
      }
    }

    // Group crossings by the horizontal wire
    const crossingsByHWire = {};
    // Group crossings by the vertical wire
    const crossingsByVWire = {};

    for (const crossing of this._crossings) {
      if (crossing.hasConnection) continue; // Don't bridge junctions
      const hWireId = crossing.horizontalWireId;
      const vWireId = crossing.wire1Id === hWireId ? crossing.wire2Id : crossing.wire1Id;

      if (!crossingsByHWire[hWireId]) crossingsByHWire[hWireId] = [];
      crossingsByHWire[hWireId].push(crossing);

      if (!crossingsByVWire[vWireId]) crossingsByVWire[vWireId] = [];
      crossingsByVWire[vWireId].push(crossing);
    }

    // Determine the background color from the current theme
    const bgColor = this._getBackgroundColor();

    // For each horizontal wire with crossings, add bridge arcs and cover strips
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

            const nearSide = goingRight ? bridgeStart : bridgeEnd;
            const farSide  = goingRight ? bridgeEnd : bridgeStart;

            // Draw line from current position to the near side of the bridge
            const shouldDraw = goingRight ? (nearSide > x) : (nearSide < x);
            if (shouldDraw) {
              d += ` L ${nearSide} ${segY}`;
            }

            // Add a background-colored cover strip behind the arc.
            // This covers the vertical wire beneath the bridge, making the
            // crossing visually clean while keeping the vertical wire visible
            // on both sides of the bridge.
            if (wire.element) {
              this._addBridgeCover(wire, crossing, bgColor);
            }

            // Draw arc over crossing
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
        if (visualPath) visualPath.setAttribute('d', d);
      }
      modifiedWireIds.add(wireId);
    }

    // For vertical wires: draw them fully (no gaps).
    // The bridge cover strips on horizontal wires visually separate the crossing.
    // We only need to process vertical wires if they also have horizontal crossings
    // on the same wire (different segments), in which case we build a combined path.
    for (const [wireId, crossings] of Object.entries(crossingsByVWire)) {
      const wire = wires.find(w => w.id === wireId);
      if (!wire || !wire.pathPoints || wire.pathPoints.length < 2) continue;

      if (modifiedWireIds.has(wireId)) {
        // This wire has BOTH horizontal and vertical crossings (different segments).
        // Build a combined path: bridges on horizontal segments, full draw on vertical segments.
        this._applyCombinedPath(wire, crossings, bgColor);
      }
      // If the wire only has vertical crossings, it stays fully drawn (no gap needed).
      // The bridge covers on the horizontal wires handle the visual separation.
      modifiedWireIds.add(wireId);
    }

    return [...modifiedWireIds];
  }

  /**
   * Get all detected crossings.
   */
  getCrossings() { return this._crossings; }

  /* ─── Internal: Background Color Detection ─── */

  /**
   * Determine the canvas background color from the current theme.
   * Used for bridge cover strips that visually separate the crossing.
   */
  _getBackgroundColor() {
    const style = getComputedStyle(document.documentElement);
    return style.getPropertyValue('--color-bg').trim() || '#1e1e1e';
  }

  /* ─── Internal: Bridge Cover Strip ─── */

  /**
   * Add a background-colored rectangle/strip behind a bridge arc.
   * This covers the vertical wire at the crossing point, making the
   * bridge arc appear to cleanly jump over the vertical wire while
   * keeping the vertical wire visible above and below the bridge.
   *
   * @param {Wire} wire - The horizontal wire element
   * @param {Object} crossing - Crossing location {x, y}
   * @param {string} bgColor - Background color for the cover
   */
  _addBridgeCover(wire, crossing, bgColor) {
    if (!wire.element) return;

    // Avoid duplicate covers
    const existing = wire.element.querySelectorAll('.bridge-cover');
    for (const el of existing) {
      const ex = parseFloat(el.getAttribute('x'));
      const ey = parseFloat(el.getAttribute('y'));
      if (Math.abs(ex - crossing.x) < 2 && Math.abs(ey - crossing.y) < 2) return;
    }

    const coverWidth = (this._bridgeOffset + this._bridgeRadius) * 2 + 2;
    const coverHeight = this._bridgeRadius * 2 + 2;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', crossing.x - coverWidth / 2);
    rect.setAttribute('y', crossing.y - coverHeight / 2 - 1);
    rect.setAttribute('width', coverWidth);
    rect.setAttribute('height', coverHeight);
    rect.setAttribute('fill', bgColor);
    rect.setAttribute('stroke', 'none');
    rect.setAttribute('pointer-events', 'none');
    rect.classList.add('bridge-cover');

    // Insert before the visual path so the cover is behind the arc
    const visualPath = wire.element.querySelector('.wire-visual');
    if (visualPath) {
      wire.element.insertBefore(rect, visualPath);
    } else {
      wire.element.appendChild(rect);
    }
  }

  /* ─── Internal: Combined Bridge + Full-Draw Path ─── */

  /**
   * Build a combined path for a wire that has both horizontal crossings
   * (needing bridge arcs) and vertical crossings (drawn fully, no gaps).
   * Bridge covers are added for horizontal crossing points.
   *
   * @param {Wire} wire
   * @param {Array} verticalCrossings - Crossings where this wire is vertical
   * @param {string} bgColor - Background color for bridge covers
   */
  _applyCombinedPath(wire, verticalCrossings, bgColor) {
    if (!wire.element || !wire.pathPoints || wire.pathPoints.length < 2) return;

    const visualPath = wire.element.querySelector('.wire-visual');
    if (!visualPath) return;

    // Get horizontal crossings for this wire
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
        // Apply bridge arcs with cover strips
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

          // Add background cover
          this._addBridgeCover(wire, crossing, bgColor);

          if (goingRight ? (bridgeStart > x) : (bridgeStart < x)) {
            d += ` L ${bridgeStart} ${segY}`;
          }
          const sweepFlag = goingRight ? 1 : 0;
          d += ` A ${this._bridgeRadius} ${this._bridgeRadius} 0 0 ${sweepFlag} ${bridgeEnd} ${segY}`;
          x = bridgeEnd;
        }
        if (goingRight ? (curr.x > x) : (curr.x < x)) {
          d += ` L ${curr.x} ${curr.y}`;
        }

      } else if (isVertical) {
        // Vertical segment: draw fully (no gaps).
        // The bridge covers on horizontal wires handle the visual separation.
        d += ` L ${curr.x} ${curr.y}`;

      } else {
        // Diagonal segment (shouldn't happen in Manhattan routing)
        d += ` L ${curr.x} ${curr.y}`;
      }
    }

    visualPath.setAttribute('d', d);
  }
}
