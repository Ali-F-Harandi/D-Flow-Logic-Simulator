export class Wire {
  constructor(id, fromNode, toNode) {
    this.id = id;
    this.fromNode = fromNode; // { component, nodeId }
    this.toNode = toNode;
    this.element = null; // SVG <g> group
  }

  getPath(fromPos, toPos) {
    const startX = fromPos.x;
    const startY = fromPos.y;
    const endX = toPos.x;
    const endY = toPos.y;

    if (endX >= startX - 10) {
      // Standard Forward Routing 
      const midX = startX + (endX - startX) / 2;
      return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
    } else {
      // Backward Routing (Feedback loop wrap-around)
      const offset = 20; // Distance to push the wire outward
      const midY = startY + (endY - startY) / 2 + 40; // Drop it below the components
      
      return `M ${startX} ${startY} 
              L ${startX + offset} ${startY} 
              L ${startX + offset} ${midY} 
              L ${endX - offset} ${midY} 
              L ${endX - offset} ${endY} 
              L ${endX} ${endY}`;
    }
  }

  render(svgLayer, getNodePosition) {
    if (this.element) return;

    // Create a group to hold both visual and hit‑area paths
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.dataset.wireId = this.id;
    group.style.pointerEvents = 'none'; // default, hit‑area overrides

    // Visual path – drawn, does not catch events
    const visualPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    visualPath.setAttribute('stroke', '#888');
    visualPath.setAttribute('stroke-width', '2');
    visualPath.setAttribute('fill', 'none');
    visualPath.setAttribute('pointer-events', 'none');
    visualPath.classList.add('wire-visual');

    // Hit‑area path – transparent, wide, catches events
    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.setAttribute('stroke', 'transparent');
    hitPath.setAttribute('stroke-width', '15');   // generous hit area
    hitPath.setAttribute('fill', 'none');
    hitPath.setAttribute('pointer-events', 'stroke');
    hitPath.classList.add('wire-hitarea');

    const fromPos = getNodePosition(this.fromNode.nodeId);
    const toPos = getNodePosition(this.toNode.nodeId);
    const d = this.getPath(fromPos, toPos);

    visualPath.setAttribute('d', d);
    hitPath.setAttribute('d', d);

    group.appendChild(visualPath);
    group.appendChild(hitPath);
    svgLayer.appendChild(group);

    this.element = group;
  }

  updatePath(getNodePosition) {
    if (!this.element) return;
    const fromPos = getNodePosition(this.fromNode.nodeId);
    const toPos = getNodePosition(this.toNode.nodeId);
    const d = this.getPath(fromPos, toPos);

    this.element.querySelector('.wire-visual').setAttribute('d', d);
    this.element.querySelector('.wire-hitarea').setAttribute('d', d);
  }

  updateColor(sourceValue) {
    if (this.element) {
      this.element.querySelector('.wire-visual').setAttribute('stroke', sourceValue ? '#00cc66' : '#888');
    }
  }
}