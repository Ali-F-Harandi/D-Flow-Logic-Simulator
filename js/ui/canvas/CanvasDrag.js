import { MoveComponentCommand, CompositeCommand } from '../../utils/UndoManager.js';
import { GRID_SIZE } from '../../config.js';

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

    // Feature 6: Snap-to-connections state
    this._snapHighlightTimer = null;
    this._lastSnappedConnector = null;
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
   * Uses incremental grid updates during drag for better performance,
   * with full grid rebuild + reroute on drop.
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

      // Store old position for incremental grid update
      const oldPos = { x: comp.position.x, y: comp.position.y };
      comp.updatePosition(nx, ny);

      // Feature 6: Snap-to-connections — align ports with nearby unconnected ports
      if (this.dragData.components.length === 1) {
        this._snapToConnections(comp);
      }

      // Update cached dimensions
      if (comp.element) {
        comp._cachedWidth = comp.element.offsetWidth;
        comp._cachedHeight = comp.element.offsetHeight;
      }

      // Use incremental grid update (avoids full rebuild during drag)
      const router = this.wiring._getRouter();
      if (router && router._gridBuilt) {
        router.updateComponentOnGrid(comp, oldPos, (nodeId) => this.wiring.positionCache.getPosition(nodeId));
      }
    });
    this.dragData.components.forEach(comp => this.wiring.updateWiresForComponent(comp));
    this.wiring.positionCache.invalidate();

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

    // Feature 6: Clear snap highlight
    this._clearSnapHighlight();
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

  /* ========== Feature 6: Snap-to-Connections During Drag ========== */

  /**
   * Snap a dragged component's unconnected ports to align with nearby
   * unconnected ports on other components. Only snaps to compatible
   * connectors (input ↔ output).
   *
   * SNAP_THRESHOLD = 1 grid unit (20px). When an unconnected port on
   * the dragged component is within this distance of an unconnected
   * compatible port on another component, the component position is
   * adjusted so the ports align exactly.
   *
   * @param {Component} comp – The component being dragged
   */
  _snapToConnections(comp) {
    const SNAP_THRESHOLD = GRID_SIZE; // 1 grid unit = 20px
    const draggedCompId = comp.id;

    // Get all connectors of the dragged component with their positions
    const dragConnectors = this._getConnectors(comp);

    // Get all other components' unconnected connectors
    const otherConnectors = [];
    for (const otherComp of this.compManager.components) {
      if (otherComp.id === draggedCompId) continue;
      // Skip other selected/dragged components
      if (this.dragData && this.dragData.components.some(c => c.id === otherComp.id)) continue;
      const conns = this._getConnectors(otherComp, true); // only unconnected
      otherConnectors.push(...conns);
    }

    let bestSnap = null;
    let bestDist = SNAP_THRESHOLD;

    for (const dragConn of dragConnectors) {
      // Only consider unconnected connectors on the dragged component
      if (dragConn.connectedTo) continue;

      for (const otherConn of otherConnectors) {
        // Only snap compatible types: input ↔ output
        if (dragConn.isOutput === otherConn.isOutput) continue;

        const dx = dragConn.x - otherConn.x;
        const dy = dragConn.y - otherConn.y;
        const dist = Math.hypot(dx, dy);

        if (dist < bestDist) {
          bestDist = dist;
          bestSnap = {
            dragConn,
            otherConn,
            offsetX: -dx,
            offsetY: -dy,
            otherComp: otherConn.comp
          };
        }
      }
    }

    if (bestSnap) {
      // Apply the snap offset to the component position
      const nx = this.core.snap(comp.position.x + bestSnap.offsetX);
      const ny = this.core.snap(comp.position.y + bestSnap.offsetY);
      comp.updatePosition(nx, ny);

      // Highlight the snapped-to connector briefly
      this._highlightSnappedConnector(bestSnap.otherConn);
    }
  }

  /**
   * Get all connectors of a component with their current canvas positions.
   *
   * @param {Component} comp
   * @param {boolean} [unconnectedOnly=false] – Only return connectors that have no connection
   * @returns {Array<{nodeId: string, isOutput: boolean, x: number, y: number, connectedTo: *, comp: Component}>}
   */
  _getConnectors(comp, unconnectedOnly = false) {
    const connectors = [];

    // Input connectors
    for (const inp of comp.inputs) {
      if (unconnectedOnly && inp.connectedTo) continue;
      const pos = this._getConnectorPosition(comp, inp.id, false);
      if (pos) {
        connectors.push({
          nodeId: inp.id,
          isOutput: false,
          x: pos.x,
          y: pos.y,
          connectedTo: inp.connectedTo,
          comp
        });
      }
    }

    // Output connectors
    for (const out of comp.outputs) {
      // Outputs don't have connectedTo in the same way; they can always accept fan-out
      // For snap purposes, we check if there's already a wire from this output
      const hasWire = this.wiring.wires.some(w => w.fromNode.nodeId === out.id);
      if (unconnectedOnly && hasWire) continue;
      const pos = this._getConnectorPosition(comp, out.id, true);
      if (pos) {
        connectors.push({
          nodeId: out.id,
          isOutput: true,
          x: pos.x,
          y: pos.y,
          connectedTo: hasWire ? 'wired' : null,
          comp
        });
      }
    }

    return connectors;
  }

  /**
   * Get the canvas position of a connector dot.
   * Uses the position cache if available, otherwise falls back to DOM query.
   *
   * @param {Component} comp
   * @param {string} nodeId
   * @param {boolean} isOutput
   * @returns {{x: number, y: number} | null}
   */
  _getConnectorPosition(comp, nodeId, isOutput) {
    // Try position cache first
    if (this.positionCache) {
      const pos = this.positionCache.getPosition(nodeId);
      if (pos && (pos.x !== 0 || pos.y !== 0)) return pos;
    }

    // Fallback: query the DOM element
    if (comp.element) {
      const dot = comp.element.querySelector(`.connector[data-node="${nodeId}"]`);
      if (dot) {
        const rect = dot.getBoundingClientRect();
        const sceneRect = this.core.scene?.getBoundingClientRect();
        if (sceneRect) {
          return {
            x: (rect.left + rect.width / 2 - sceneRect.left) / this.core.scale,
            y: (rect.top + rect.height / 2 - sceneRect.top) / this.core.scale
          };
        }
      }
    }

    return null;
  }

  /**
   * Briefly highlight a connector that was snapped to.
   * The highlight fades after 800ms.
   *
   * @param {Object} conn – Connector info object with nodeId and comp
   */
  _highlightSnappedConnector(conn) {
    // Clear previous highlight
    this._clearSnapHighlight();

    const comp = conn.comp;
    if (!comp?.element) return;

    const dot = comp.element.querySelector(`.connector[data-node="${conn.nodeId}"]`);
    if (!dot) return;

    // Add snap highlight class
    dot.classList.add('snap-highlight');
    this._lastSnappedConnector = dot;

    // Auto-remove highlight after 800ms
    this._snapHighlightTimer = setTimeout(() => {
      this._clearSnapHighlight();
    }, 800);
  }

  /**
   * Clear the snap highlight from the previously snapped connector.
   */
  _clearSnapHighlight() {
    if (this._snapHighlightTimer) {
      clearTimeout(this._snapHighlightTimer);
      this._snapHighlightTimer = null;
    }
    if (this._lastSnappedConnector) {
      this._lastSnappedConnector.classList.remove('snap-highlight');
      this._lastSnappedConnector = null;
    }
  }
}
