import { WIRE_VISUAL_WIDTH, WIRE_HIT_WIDTH, JUNCTION_RADIUS } from '../config.js';

export class Wire {
  constructor(id, fromNode, toNode) {
    this.id = id;
    this.fromNode = fromNode;
    this.toNode = toNode;
    this.element = null;
  }

  /**
   * Compute a Manhattan path.
   * @param {Object} fromPos - { x, y }
   * @param {Object} toPos   - { x, y }
   * @param {Object} [opts]  - optional parameters
   * @param {number} [opts.minClearY] - a guaranteed safe Y below all components
   * @returns {string} SVG path data
   */
  static computePath(fromPos, toPos, opts = {}) {
    const startX = fromPos.x;
    const startY = fromPos.y;
    const endX = toPos.x;
    const endY = toPos.y;
    const { minClearY } = opts;

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

  getPath(fromPos, toPos, opts) {
    return Wire.computePath(fromPos, toPos, opts);
  }

  render(svgLayer, getNodePosition, busBarY = null) {
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
    const d = this.getPath(fromPos, toPos, { minClearY: busBarY });

    visualPath.setAttribute('d', d);
    hitPath.setAttribute('d', d);

    junctionDot.setAttribute('cx', fromPos.x);
    junctionDot.setAttribute('cy', fromPos.y);

    group.appendChild(visualPath);
    group.appendChild(hitPath);
    group.appendChild(junctionDot);
    svgLayer.appendChild(group);

    this.element = group;
  }

  updatePath(getNodePosition, busBarY = null) {
    if (!this.element) return;
    const fromPos = getNodePosition(this.fromNode.nodeId);
    const toPos = getNodePosition(this.toNode.nodeId);
    const d = this.getPath(fromPos, toPos, { minClearY: busBarY });

    this.element.querySelector('.wire-visual').setAttribute('d', d);
    this.element.querySelector('.wire-hitarea').setAttribute('d', d);

    const junctionDot = this.element.querySelector('.wire-junction');
    if (junctionDot) {
      junctionDot.setAttribute('cx', fromPos.x);
      junctionDot.setAttribute('cy', fromPos.y);
    }
  }

  updateColor(sourceValue) {
    if (this.element) {
      // HP-7 FIX: Use CSS custom property values instead of hardcoded colors.
      // Previously used hardcoded '#00cc66' / '#888' which broke in light
      // theme and high-contrast theme. Now reads from theme CSS variables.
      const style = getComputedStyle(document.documentElement);
      const highColor = style.getPropertyValue('--wire-high-color').trim() || '#00cc66';
      const neutralColor = style.getPropertyValue('--wire-neutral-color').trim() || '#888';
      const color = sourceValue ? highColor : neutralColor;
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
