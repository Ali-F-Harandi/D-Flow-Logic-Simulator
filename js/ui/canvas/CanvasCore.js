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
    this.scene.style.width = '20000px';
    this.scene.style.height = '20000px';
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
    svg.setAttribute('viewBox', '0 0 20000 20000');
    svg.setAttribute('width', '20000');
    svg.setAttribute('height', '20000');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.overflow = 'visible';
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
   * Uses the scene element's bounding rect directly for accuracy,
   * which avoids any offset between the canvas container and the scene.
   */
  canvasCoords(clientX, clientY) {
    const sceneRect = this.scene.getBoundingClientRect();
    return {
      x: (clientX - sceneRect.left) / this.scale,
      y: (clientY - sceneRect.top) / this.scale
    };
  }

  /**
   * Zoom by delta steps. centerX/Y are relative to the canvas container.
   * Used for mouse wheel zoom (discrete steps).
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
   * Zoom proportionally by a scale factor. centerX/Y are relative to the canvas container.
   * Used for pinch zoom on touch devices — provides much smoother zoom than discrete steps.
   * @param {number} scaleFactor - The ratio to scale by (e.g., 1.02 for slight zoom in, 0.98 for slight zoom out)
   * @param {number} centerX - X position relative to canvas container
   * @param {number} centerY - Y position relative to canvas container
   */
  zoomProportional(scaleFactor, centerX, centerY) {
    const oldScale = this.scale;
    // Clamp the scale factor to prevent zooming too fast in a single frame
    const clampedFactor = Math.max(0.95, Math.min(1.05, scaleFactor));
    const newScale = Math.min(this.maxScale, Math.max(this.minScale, oldScale * clampedFactor));
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

  /**
   * Center the canvas view so that the scene origin (0, 0) is at the center
   * of the viewport, with equal blank area in all four directions (N, S, E, W).
   * This gives a balanced starting view where new components can be placed
   * symmetrically around the center point.
   */
  centerView() {
    const rect = this.element.getBoundingClientRect();
    // Place the scene origin (0,0) at the center of the visible canvas area
    this.panOffset.x = rect.width / 2;
    this.panOffset.y = rect.height / 2;
    this.scale = 1;
    this.applyTransform();
  }
}