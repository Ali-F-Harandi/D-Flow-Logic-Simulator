export class CanvasCore {
  constructor(canvasElement, gridSize) {
    this.element = canvasElement;
    this.gridSize = gridSize;
    this.scale = 1;
    this.panOffset = { x: 0, y: 0 };
    this.minScale = 0.2;
    this.maxScale = 4;

    // Create the huge scene
    this.scene = document.createElement('div');
    this.scene.id = 'canvas-scene';
    this.scene.style.position = 'absolute';
    this.scene.style.transformOrigin = '0 0';
    this.scene.style.width = '10000px';
    this.scene.style.height = '10000px';
    this.element.appendChild(this.scene);

    // SVG layer for wires
    this.svgLayer = this._createSVGLayer();
    this.scene.appendChild(this.svgLayer);

    this._updateTransform();
    this._updateGridBackground();
  }

  _createSVGLayer() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'wire-layer');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    return svg;
  }

  _updateTransform() {
    this.scene.style.transform = `translate(${this.panOffset.x}px, ${this.panOffset.y}px) scale(${this.scale})`;
  }

  _updateGridBackground() {
    const scaledSize = this.gridSize * this.scale;
    const dotRadius = Math.max(1.2, Math.min(3.5, scaledSize * 0.15));
    this.element.style.backgroundSize = `${scaledSize}px ${scaledSize}px`;
    this.element.style.backgroundPosition = `${this.panOffset.x}px ${this.panOffset.y}px`;
    this.element.style.backgroundImage =
      `radial-gradient(circle at 0px 0px, var(--grid-dot-color) ${dotRadius}px, transparent ${dotRadius}px)`;
  }

  applyTransform() {
    this._updateTransform();
    this._updateGridBackground();
  }

  /**
   * Convert screen (client) coordinates to canvas (scene) coordinates.
   */
  canvasCoords(clientX, clientY) {
    const rect = this.element.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.panOffset.x) / this.scale,
      y: (clientY - rect.top - this.panOffset.y) / this.scale
    };
  }

  /**
   * Zoom by delta steps. centerX/Y are relative to the canvas container.
   */
  zoom(delta, centerX, centerY) {
    const oldScale = this.scale;
    const newScale = Math.min(this.maxScale, Math.max(this.minScale,
      oldScale * (delta > 0 ? 1.1 : 0.9)));
    const factor = newScale / oldScale;
    this.panOffset.x = centerX - (centerX - this.panOffset.x) * factor;
    this.panOffset.y = centerY - (centerY - this.panOffset.y) * factor;
    this.scale = newScale;
    this.applyTransform();
  }

  /**
   * Snap a coordinate to the grid.
   */
  snap(value) {
    return Math.round(value / this.gridSize) * this.gridSize;
  }

  /**
   * Calculate a safe Y level for backward routing (below all components).
   * @param {Array} components – array of component objects with position and element.
   */
  getBusBarY(components) {
    let maxBottom = 0;
    for (const comp of components) {
      if (comp.element) {
        const bottom = comp.position.y + comp.element.offsetHeight;
        if (bottom > maxBottom) maxBottom = bottom;
      }
    }
    return maxBottom + 40;
  }
}