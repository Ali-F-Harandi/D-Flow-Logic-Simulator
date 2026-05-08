export class CanvasPanZoom {
  /**
   * @param {CanvasCore} core
   * @param {HTMLElement} canvasElement   – the canvas container (for wheel event)
   */
  constructor(core, canvasElement) {
    this.core = core;
    this.isPanning = false;
    this.panStart = null;

    // Wheel zoom
    canvasElement.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvasElement.getBoundingClientRect();
      this.core.zoom(e.deltaY > 0 ? -1 : 1, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });
  }

  startPan(clientX, clientY) {
    this.isPanning = true;
    this.panStart = { x: clientX - this.core.panOffset.x, y: clientY - this.core.panOffset.y };
    this.core.element.style.cursor = 'grabbing';
  }

  movePan(clientX, clientY) {
    if (!this.isPanning) return;
    this.core.panOffset.x = clientX - this.panStart.x;
    this.core.panOffset.y = clientY - this.panStart.y;
    this.core.applyTransform();
  }

  endPan() {
    this.isPanning = false;
    this.core.element.style.cursor = '';
  }
}