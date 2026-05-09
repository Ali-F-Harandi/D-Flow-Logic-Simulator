import { MoveComponentCommand, CompositeCommand } from '../../utils/UndoManager.js';

export class CanvasDrag {
  constructor(core, compManager, wiring, selection, undoManager, engine, canvas, positionCache) {
    this.core = core;
    this.compManager = compManager;
    this.wiring = wiring;
    this.selection = selection;
    this.undoManager = undoManager;
    this.engine = engine;
    this.canvas = canvas;
    this.positionCache = positionCache;
    this.isDragging = false;
    this.dragData = null;

    // Snap-to-grid alignment indicators
    this._alignLines = null;
    this._createAlignLines();
  }

  /**
   * Create SVG elements for alignment indicator lines.
   * These are subtle dotted lines that extend to the canvas edges
   * when a component is being dragged, making it easier to align
   * components precisely.
   */
  _createAlignLines() {
    this._alignLines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this._alignLines.setAttribute('class', 'align-indicators');
    this._alignLines.setAttribute('width', '20000');
    this._alignLines.setAttribute('height', '20000');
    this._alignLines.setAttribute('viewBox', '0 0 20000 20000');
    this._alignLines.style.position = 'absolute';
    this._alignLines.style.top = '0';
    this._alignLines.style.left = '0';
    this._alignLines.style.pointerEvents = 'none';
    this._alignLines.style.overflow = 'visible';
    this._alignLines.style.display = 'none';
    this._alignLines.style.zIndex = '0';  // Behind wires and components
  }

  /**
   * Start dragging a component (or multiple selected components) at the given screen coordinates.
   */
  startDrag(comp, clientX, clientY) {
    if (this.isDragging) return;
    // Ensure the component is in the selection if not already
    if (!this.selection.selectedComponents.has(comp.id)) {
      this.selection.clearSelection();
      this.selection.selectedComponents.add(comp.id);
      comp.element.classList.add('selected');
    }

    const selectedComps = Array.from(this.selection.selectedComponents)
      .map(id => this.compManager.getComponentById(id))
      .filter(Boolean);

    this.isDragging = true;
    this.dragData = {
      components: selectedComps,
      startX: clientX,
      startY: clientY,
      origins: {}
    };
    selectedComps.forEach(c => {
      this.dragData.origins[c.id] = { x: c.position.x, y: c.position.y };
      c.element.style.zIndex = '1000';
    });

    // Show alignment indicators
    this._showAlignIndicators();
  }

  /**
   * Update dragged components positions.
   */
  moveDrag(clientX, clientY) {
    if (!this.dragData) return;
    const dx = (clientX - this.dragData.startX) / this.core.scale;
    const dy = (clientY - this.dragData.startY) / this.core.scale;
    this.dragData.components.forEach(comp => {
      const orig = this.dragData.origins[comp.id];
      let nx = orig.x + dx;
      let ny = orig.y + dy;
      nx = this.core.snap(nx);
      ny = this.core.snap(ny);
      comp.updatePosition(nx, ny);
    });
    this.dragData.components.forEach(comp => this.wiring.updateWiresForComponent(comp));
    this.wiring.positionCache.invalidate();

    // Update obstacle cache incrementally during drag for smoother wire routing
    this.dragData.components.forEach(comp => {
      if (comp.element) {
        comp._cachedWidth = comp.element.offsetWidth;
        comp._cachedHeight = comp.element.offsetHeight;
      }
      const orig = this.dragData.origins[comp.id];
      this.wiring.updateObstacleCacheForComponent(comp, orig);
    });

    // Update alignment indicators
    this._updateAlignIndicators();
  }

  endDrag() {
    const draggedComps = this.dragData ? [...this.dragData.components] : [];

    // Create undo commands for component moves
    if (this.undoManager && draggedComps.length > 0 && this.dragData) {
      const commands = [];
      for (const comp of draggedComps) {
        const oldPos = this.dragData.origins[comp.id];
        const newPos = { x: comp.position.x, y: comp.position.y };
        // Only create command if the component actually moved
        if (oldPos.x !== newPos.x || oldPos.y !== newPos.y) {
          commands.push(new MoveComponentCommand(
            this.engine, this.canvas, this.compManager,
            this.wiring, this.positionCache,
            comp.id, oldPos, newPos
          ));
        }
      }
      if (commands.length > 0) {
        if (commands.length === 1) {
          this.undoManager.execute(commands[0]);
        } else {
          this.undoManager.execute(new CompositeCommand(commands));
        }
      }
    }

    if (this.dragData) {
      this.dragData.components.forEach(c => c.element.style.zIndex = '');
      this.dragData = null;
    }
    this.isDragging = false;

    // Rebuild obstacle cache fully after drag ends for consistency
    this.wiring.rebuildObstacleCache();

    // Auto-reroute ALL wires after component drop (unless disabled).
    // Using full reroute ensures channel allocation and overlap resolution
    // across ALL wires, not just the moved component's wires.
    if (this.wiring.autoRerouteOnDrop && draggedComps.length > 0) {
      this.wiring.rerouteWithFanOut();
    }

    // Hide alignment indicators
    this._hideAlignIndicators();
  }

  /**
   * Move selected components by keyboard arrows (already snaps).
   * Also triggers auto-reroute if enabled.
   */
  moveSelectedComponents(dx, dy) {
    const movedComps = [];
    this.selection.selectedComponents.forEach(id => {
      const comp = this.compManager.getComponentById(id);
      if (comp) {
        const nx = this.core.snap(comp.position.x + dx);
        const ny = this.core.snap(comp.position.y + dy);
        comp.updatePosition(nx, ny);
        movedComps.push(comp);
      }
    });
    this.selection.selectedComponents.forEach(id => {
      const comp = this.compManager.getComponentById(id);
      if (comp) this.wiring.updateWiresForComponent(comp);
    });
    this.wiring.positionCache.invalidate();

    // Auto-reroute after keyboard move if enabled — use full reroute for overlap prevention
    if (this.wiring.autoRerouteOnDrop && movedComps.length > 0) {
      this.wiring.rerouteWithFanOut();
    }

    this.wiring.scheduleRedraw();
  }

  /* ========== Snap-to-Grid Alignment Indicators ========== */

  _showAlignIndicators() {
    if (!this._alignLines || !this.core.svgLayer) return;
    // Insert alignment indicator SVG before the wire layer so wires render on top
    const svgLayer = this.core.svgLayer;
    if (svgLayer.parentNode) {
      svgLayer.parentNode.insertBefore(this._alignLines, svgLayer);
    }
    this._alignLines.style.display = '';
  }

  _hideAlignIndicators() {
    if (this._alignLines) {
      this._alignLines.style.display = 'none';
      // Clear all indicator lines
      while (this._alignLines.firstChild) {
        this._alignLines.removeChild(this._alignLines.firstChild);
      }
    }
  }

  _updateAlignIndicators() {
    if (!this._alignLines || !this.dragData) return;

    // Clear previous indicators
    while (this._alignLines.firstChild) {
      this._alignLines.removeChild(this._alignLines.firstChild);
    }

    const gs = this.core.gridSize;
    const canvasW = 20000;
    const canvasH = 20000;

    // Collect alignment points from dragged components
    const dragPoints = { xs: new Set(), ys: new Set() };
    for (const comp of this.dragData.components) {
      const x = comp.position.x;
      const y = comp.position.y;
      const w = comp.element?.offsetWidth || 4 * gs;
      const h = comp.element?.offsetHeight || 3 * gs;

      // Key alignment points: left edge, center-x, right edge
      dragPoints.xs.add(x);
      dragPoints.xs.add(x + w);
      dragPoints.xs.add(Math.round(x + w / 2 / gs) * gs);

      // Key alignment points: top edge, center-y, bottom edge
      dragPoints.ys.add(y);
      dragPoints.ys.add(y + h);
      dragPoints.ys.add(Math.round(y + h / 2 / gs) * gs);
    }

    // Collect alignment points from OTHER (non-dragged) components
    const otherPoints = { xs: new Set(), ys: new Set() };
    const draggedIds = new Set(this.dragData.components.map(c => c.id));
    for (const comp of this.compManager.components) {
      if (draggedIds.has(comp.id)) continue;
      const x = comp.position.x;
      const y = comp.position.y;
      const w = comp.element?.offsetWidth || 4 * gs;
      const h = comp.element?.offsetHeight || 3 * gs;

      otherPoints.xs.add(x);
      otherPoints.xs.add(x + w);
      otherPoints.xs.add(Math.round(x + w / 2 / gs) * gs);
      otherPoints.ys.add(y);
      otherPoints.ys.add(y + h);
      otherPoints.ys.add(Math.round(y + h / 2 / gs) * gs);
    }

    // Find matching X positions (with 1px tolerance)
    const matchingXs = [];
    for (const dx of dragPoints.xs) {
      for (const ox of otherPoints.xs) {
        if (Math.abs(dx - ox) < 2) {
          matchingXs.push(dx);
          break;
        }
      }
    }

    // Find matching Y positions (with 1px tolerance)
    const matchingYs = [];
    for (const dy of dragPoints.ys) {
      for (const oy of otherPoints.ys) {
        if (Math.abs(dy - oy) < 2) {
          matchingYs.push(dy);
          break;
        }
      }
    }

    // Draw vertical alignment lines for matching X positions
    for (const x of matchingXs) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x));
      line.setAttribute('y1', '0');
      line.setAttribute('x2', String(x));
      line.setAttribute('y2', String(canvasH));
      line.setAttribute('stroke', 'var(--color-accent)');
      line.setAttribute('stroke-width', '0.5');
      line.setAttribute('stroke-dasharray', '4,6');
      line.setAttribute('opacity', '0.35');
      this._alignLines.appendChild(line);
    }

    // Draw horizontal alignment lines for matching Y positions
    for (const y of matchingYs) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('y1', String(y));
      line.setAttribute('x2', String(canvasW));
      line.setAttribute('y2', String(y));
      line.setAttribute('stroke', 'var(--color-accent)');
      line.setAttribute('stroke-width', '0.5');
      line.setAttribute('stroke-dasharray', '4,6');
      line.setAttribute('opacity', '0.35');
      this._alignLines.appendChild(line);
    }
  }
}
