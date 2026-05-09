import { WIRE_VISUAL_WIDTH, WIRE_HIT_WIDTH, JUNCTION_RADIUS, GRID_SIZE } from '../config.js';
import { AStarRouter } from './AStarRouter.js';

export class Wire {
  constructor(id, fromNode, toNode) {
    this.id = id;
    this.fromNode = fromNode;
    this.toNode = toNode;
    this.element = null;
    this.occupiedCells = new Set();  // Cached grid cells this wire occupies
  }

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

    // Cache occupied cells for fast obstacle grid building
    this.updateOccupiedCells(d);

    junctionDot.setAttribute('cx', fromPos.x);
    junctionDot.setAttribute('cy', fromPos.y);

    group.appendChild(visualPath);
    group.appendChild(hitPath);
    group.appendChild(junctionDot);
    svgLayer.appendChild(group);

    this.element = group;
  }

  updatePath(getNodePosition, busBarY = null, router = null) {
    if (!this.element) return;
    const fromPos = getNodePosition(this.fromNode.nodeId);
    const toPos = getNodePosition(this.toNode.nodeId);
    const d = this.getPath(fromPos, toPos, {
      minClearY: busBarY,
      router,
      sourceNodeId: this.fromNode.nodeId
    });

    this.element.querySelector('.wire-visual').setAttribute('d', d);
    this.element.querySelector('.wire-hitarea').setAttribute('d', d);

    // Update cached occupied cells
    this.updateOccupiedCells(d);

    const junctionDot = this.element.querySelector('.wire-junction');
    if (junctionDot) {
      junctionDot.setAttribute('cx', fromPos.x);
      junctionDot.setAttribute('cy', fromPos.y);
    }
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
