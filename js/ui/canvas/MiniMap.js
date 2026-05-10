/**
 * MiniMap.js — A small overview map of the entire circuit canvas.
 * Shows component positions as colored dots and current viewport as a rectangle.
 * Allows clicking on the minimap to navigate to that position.
 */

export class MiniMap {
  constructor(canvas, core, compManager) {
    this.canvas = canvas;
    this.core = core;
    this.compManager = compManager;
    this.element = null;
    this._canvas = null;
    this._ctx = null;
    this._visible = true;
    this._updateTimer = null;

    this._build();
    this._bindEvents();
    this.scheduleUpdate();
  }

  _build() {
    const container = document.createElement('div');
    container.id = 'minimap';
    container.innerHTML = `
      <div class="minimap-header">
        <span>Minimap</span>
        <button class="minimap-toggle" title="Toggle minimap">−</button>
      </div>
      <canvas class="minimap-canvas" width="180" height="120"></canvas>
    `;
    document.getElementById('canvas-container').appendChild(container);
    this.element = container;
    this._canvas = container.querySelector('.minimap-canvas');
    this._ctx = this._canvas.getContext('2d');
  }

  _bindEvents() {
    // Toggle visibility
    this.element.querySelector('.minimap-toggle').addEventListener('click', () => {
      this._visible = !this._visible;
      this._canvas.style.display = this._visible ? 'block' : 'none';
      this.element.querySelector('.minimap-toggle').textContent = this._visible ? '−' : '+';
    });

    // Click to navigate
    this._canvas.addEventListener('click', (e) => {
      const rect = this._canvas.getBoundingClientRect();
      const clickX = (e.clientX - rect.left) / rect.width;
      const clickY = (e.clientY - rect.top) / rect.height;

      const bounds = this._getBounds();
      if (!bounds) return;

      const worldX = bounds.minX + clickX * (bounds.maxX - bounds.minX);
      const worldY = bounds.minY + clickY * (bounds.maxY - bounds.minY);

      const canvasRect = this.core.element.getBoundingClientRect();
      this.core.panOffset.x = canvasRect.width / 2 - worldX * this.core.scale;
      this.core.panOffset.y = canvasRect.height / 2 - worldY * this.core.scale;
      this.core.applyTransform();
      this.scheduleUpdate();
    });
  }

  _getBounds() {
    const components = this.compManager.components;
    if (components.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const comp of components) {
      const w = comp._cachedWidth || 80;
      const h = comp._cachedHeight || 60;
      minX = Math.min(minX, comp.position.x);
      minY = Math.min(minY, comp.position.y);
      maxX = Math.max(maxX, comp.position.x + w);
      maxY = Math.max(maxY, comp.position.y + h);
    }

    const padding = 100;
    return { minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding };
  }

  scheduleUpdate() {
    if (this._updateTimer) return;
    this._updateTimer = requestAnimationFrame(() => {
      this._updateTimer = null;
      this.render();
    });
  }

  render() {
    if (!this._visible || !this._ctx) return;

    const ctx = this._ctx;
    const w = this._canvas.width;
    const h = this._canvas.height;

    // Clear
    ctx.fillStyle = 'rgba(30, 30, 30, 0.9)';
    ctx.fillRect(0, 0, w, h);

    const bounds = this._getBounds();
    if (!bounds) {
      ctx.fillStyle = '#666';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No components', w / 2, h / 2);
      return;
    }

    const scaleX = w / (bounds.maxX - bounds.minX);
    const scaleY = h / (bounds.maxY - bounds.minY);
    const scale = Math.min(scaleX, scaleY);

    const offsetX = (w - (bounds.maxX - bounds.minX) * scale) / 2;
    const offsetY = (h - (bounds.maxY - bounds.minY) * scale) / 2;

    // Draw components as colored dots
    for (const comp of this.compManager.components) {
      const cx = offsetX + (comp.position.x - bounds.minX) * scale + (comp._cachedWidth || 80) * scale / 2;
      const cy = offsetY + (comp.position.y - bounds.minY) * scale + (comp._cachedHeight || 60) * scale / 2;

      // Color based on component type
      let color = '#007acc';
      if (comp.type === 'ToggleSwitch' || comp.type === 'DipSwitch' || comp.type === 'Clock') color = '#ffc107';
      else if (comp.type === 'LightBulb' || comp.type === 'SevenSegment' || comp.type === 'LedArray') color = '#ff4444';
      else if (comp.type === 'LogicProbe') color = '#4ec9b0';
      else if (comp.type.includes('FlipFlop') || comp.type === 'SRLatch' || comp.type === 'ShiftRegister') color = '#ab47bc';

      ctx.fillStyle = color;
      const compW = Math.max(4, (comp._cachedWidth || 80) * scale);
      const compH = Math.max(3, (comp._cachedHeight || 60) * scale);
      ctx.fillRect(
        offsetX + (comp.position.x - bounds.minX) * scale,
        offsetY + (comp.position.y - bounds.minY) * scale,
        compW, compH
      );
    }

    // Draw viewport rectangle
    const canvasRect = this.core.element.getBoundingClientRect();
    const vpLeft = -this.core.panOffset.x / this.core.scale;
    const vpTop = -this.core.panOffset.y / this.core.scale;
    const vpWidth = canvasRect.width / this.core.scale;
    const vpHeight = canvasRect.height / this.core.scale;

    const vpX = offsetX + (vpLeft - bounds.minX) * scale;
    const vpY = offsetY + (vpTop - bounds.minY) * scale;
    const vpW = vpWidth * scale;
    const vpH = vpHeight * scale;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vpX, vpY, vpW, vpH);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(vpX, vpY, vpW, vpH);
  }
}
