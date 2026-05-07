export class NodePositionCache {
  constructor(canvasElement, panOffset, scale) {
    this._canvas = canvasElement;
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

  _rebuild() {
    this._cache.clear();
    const canvasRect = this._canvas.getBoundingClientRect();
    const dots = this._canvas.querySelectorAll('.connector[data-node]');
    dots.forEach(dot => {
      // Skip dots that are not visible (removed from DOM or hidden)
      if (!dot.offsetParent) return;

      const nodeId = dot.dataset.node;
      const dotRect = dot.getBoundingClientRect();
      const x = (dotRect.left + dotRect.width / 2 - canvasRect.left - this._panOffset.x) / this._scale;
      const y = (dotRect.top + dotRect.height / 2 - canvasRect.top - this._panOffset.y) / this._scale;
      this._cache.set(nodeId, { x, y });
    });
    this._valid = true;
  }

  disconnect() {
    this._observer.disconnect();
  }
}