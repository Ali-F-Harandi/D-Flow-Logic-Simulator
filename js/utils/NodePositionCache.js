export class NodePositionCache {
  constructor(canvasElement, panOffset, scale) {
    this._canvas = canvasElement;
    this._scene = canvasElement.querySelector('#canvas-scene');
    this._panOffset = panOffset;
    this._scale = scale;
    this._cache = new Map();
    this._valid = false;
    this._observer = new ResizeObserver(() => this.invalidate());
    this._observer.observe(canvasElement);
  }

  invalidate() {
    this._valid = false;
  }

  setTransform(panOffset, scale) {
    this._panOffset = panOffset;
    this._scale = scale;
    this.invalidate();
  }

  getPosition(nodeId) {
    if (!this._valid) this._rebuild();
    return this._cache.get(nodeId) || { x: 0, y: 0 };
  }

  /**
   * Rebuild the position cache by reading connector dot positions.
   * Uses the scene element's bounding rect for conversion, which
   * avoids any offset between the canvas container and the scene.
   */
  _rebuild() {
    this._cache.clear();
    // Use the scene element for coordinate conversion – its getBoundingClientRect()
    // already includes the CSS transform (translate + scale), so we can convert
    // directly: sceneX = (dotCenterX_viewport - sceneRect.left) / scale
    const scene = this._scene || this._canvas.querySelector('#canvas-scene');
    const sceneRect = scene ? scene.getBoundingClientRect() : null;
    const scale = this._scale;

    const dots = this._canvas.querySelectorAll('.connector[data-node]');
    dots.forEach(dot => {
      const nodeId = dot.dataset.node;
      const dotRect = dot.getBoundingClientRect();

      // Use area check instead of offsetParent — more reliable across CSS contexts.
      // offsetParent is null for position:fixed elements and during certain layout
      // states (display:none transitions, first render before paint), causing valid
      // connectors to be silently skipped and their wires routed to (0, 0).
      if (dotRect.width === 0 && dotRect.height === 0) return;
      let x, y;
      if (sceneRect) {
        // Direct conversion using scene's viewport position.
        // sceneRect.left/top is the viewport position of the scene's origin (0,0).
        x = (dotRect.left + dotRect.width / 2 - sceneRect.left) / scale;
        y = (dotRect.top + dotRect.height / 2 - sceneRect.top) / scale;
      } else {
        // Fallback: use canvas container rect + panOffset
        const canvasRect = this._canvas.getBoundingClientRect();
        x = (dotRect.left + dotRect.width / 2 - canvasRect.left - this._panOffset.x) / scale;
        y = (dotRect.top + dotRect.height / 2 - canvasRect.top - this._panOffset.y) / scale;
      }
      this._cache.set(nodeId, { x, y });
    });
    this._valid = true;
  }

  disconnect() {
    this._observer.disconnect();
  }
}