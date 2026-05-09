import { Wire } from '../core/Wire.js';
import { ContextMenu } from './ContextMenu.js';
import { PropertyEditor } from './PropertyEditor.js';
import { NodePositionCache } from '../utils/NodePositionCache.js';
import { GRID_SIZE } from '../config.js';
import { CanvasToast } from './canvas/CanvasToast.js';
import { CanvasCore } from './canvas/CanvasCore.js';
import { CanvasPanZoom } from './canvas/CanvasPanZoom.js';
import { CanvasComponentManager } from './canvas/CanvasComponentManager.js';
import { CanvasWiring } from './canvas/CanvasWiring.js';
import { CanvasSelection } from './canvas/CanvasSelection.js';
import { CanvasDrag } from './canvas/CanvasDrag.js';
import { CanvasTouch } from './canvas/CanvasTouch.js';
import { CanvasEvents } from './canvas/CanvasEvents.js';
import { WireEditHandler } from './canvas/WireEditHandler.js';

export class Canvas {
  constructor(container, eventBus, engine, factory, undoManager) {
    this.container = container;
    this.eventBus = eventBus;
    this.engine = engine;
    this.factory = factory;
    this.undoManager = undoManager;

    this.contextMenu = new ContextMenu(eventBus);
    this.propertyEditor = new PropertyEditor(eventBus);

    this.element = container.querySelector('#canvas-container');
    if (!this.element) {
      this.element = document.createElement('div');
      this.element.id = 'canvas-container';
      container.appendChild(this.element);
    }

    this.gridSize = GRID_SIZE;

    this.core = new CanvasCore(this.element, this.gridSize);
    this.positionCache = new NodePositionCache(this.element, this.core.panOffset, this.core.scale);
    const originalApplyTransform = this.core.applyTransform.bind(this.core);
    this.core.applyTransform = () => {
      originalApplyTransform();
      this.positionCache.setTransform(this.core.panOffset, this.core.scale);
    };

    this.toaster = new CanvasToast();
    this.panZoom = new CanvasPanZoom(this.core, this.element);
    this.compManager = new CanvasComponentManager(this.engine, this.core, this.eventBus);

    // Pass `this` (the Canvas instance) to wiring, selection, touch & events
    this.wiring = new CanvasWiring(this.engine, this.eventBus, this.undoManager, this.core, this.positionCache, this);
    this.wiring._getComponents = () => this.compManager.components;
    this.wiring._redrawCallback = () => this.wiring.performRedraw(this.compManager.components);

    // Wire edit handler — manages control point dragging for manual wire editing
    this.wireEditHandler = new WireEditHandler(this.wiring, this.core, this.positionCache, this);
    this.wiring.setWireEditHandler(this.wireEditHandler);

    this.selection = new CanvasSelection(
      this.engine, this.undoManager, this.compManager, this.wiring,
      this.toaster, this.core, this.element, this.eventBus, this   // <-- canvas
    );

    this.dragHandler = new CanvasDrag(this.core, this.compManager, this.wiring, this.selection);

    this.touchHandler = new CanvasTouch(
      this.core, this.compManager, this.dragHandler, this.wiring, this.selection,
      this.panZoom, this.contextMenu, this.propertyEditor, this.element,
      this.undoManager, this.engine, this    // <-- canvas
    );

    this.events = new CanvasEvents(
      this.compManager, this.dragHandler, this.wiring, this.selection,
      this.panZoom, this.core, this.contextMenu, this.propertyEditor,
      this.undoManager, this.eventBus, this.positionCache, this   // <-- canvas
    );
    this.events._toaster = this.toaster;

    // STABLE: Engine updates only change wire colors, NOT paths
    this.engine.onUpdate = () => this.wiring.updateWireColorsOnly();

    // Center the canvas view so (0,0) is at the center of the viewport
    // with equal blank area in all four directions (N, S, E, W).
    requestAnimationFrame(() => this.core.centerView());

    this.eventBus.on('component-created', (comp) => this.addComponent(comp));
    this.eventBus.on('component-modified', (comp) => this._onComponentModified(comp));
    this.eventBus.on('canvas-touch-drop', ({ type, clientX, clientY }) => {
      // Use clientX/clientY (viewport-relative) instead of pageX/pageY
      // (document-relative) because canvasCoords expects viewport coords.
      const pos = this.core.canvasCoords(clientX, clientY);
      this._placeComponent(type, pos);
    });

    // Reroute all wires button
    this.eventBus.on('reroute-all-wires', () => {
      this.wiring.rerouteAllWires();
    });

    // Wire crossing style toggle
    this.eventBus.on('set-crossing-style', (style) => {
      this.wiring.setCrossingStyle(style);
    });

    document.addEventListener('wire-removed', (e) => {
      this.wiring.removeVisualWireByEngineId(e.detail.wireId);
    });

    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-label', 'Circuit canvas');
    this.element.setAttribute('tabindex', '0');

    // Floating mobile delete button — appears when selection is active
    this._createMobileDeleteButton();
  }

  /**
   * Create a floating delete button for mobile devices.
   * Shows when components or wires are selected, and deletes them on tap.
   */
  _createMobileDeleteButton() {
    const btn = document.createElement('button');
    btn.id = 'mobile-delete-btn';
    btn.textContent = '🗑 Delete';
    btn.title = 'Delete selected components/wires';
    btn.setAttribute('aria-label', 'Delete selected');
    btn.style.display = 'none';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.selection.deleteSelectedComponents();
    });
    document.body.appendChild(btn);
    this._mobileDeleteBtn = btn;

    // Show/hide based on selection changes
    const updateVisibility = () => {
      const hasSelection = this.selection.selectedComponents.size > 0 || this.selection.selectedWires.size > 0;
      btn.style.display = hasSelection ? 'flex' : 'none';
    };

    // Check periodically for selection changes (simple approach)
    setInterval(updateVisibility, 300);
  }

  // Public delegations
  get scene() { return this.core.scene; }
  get svgLayer() { return this.core.svgLayer; }

  addComponent(comp) {
    this.compManager.addComponent(comp);
    this.positionCache.invalidate();
    // Cache component dimensions to avoid layout reflow in A* router
    if (comp.element) {
      comp._cachedWidth = comp.element.offsetWidth;
      comp._cachedHeight = comp.element.offsetHeight;
    }
    // Rebuild obstacle cache when components change
    this.wiring.rebuildObstacleCache();
  }

  _onComponentModified(comp) {
    this.compManager._onComponentModified(comp);
    // Update cached dimensions after modification
    if (comp.element) {
      comp._cachedWidth = comp.element.offsetWidth;
      comp._cachedHeight = comp.element.offsetHeight;
    }
    // STABLE: Only update wire endpoints, don't reroute
    this.wiring.updateWiresForComponent(comp);
    // Update wire colors
    this.wiring.updateWireColorsOnly();
    // Don't rebuild obstacle cache here — it's rebuilt on drag end and reroute
  }

  _deleteComponent(compId) {
    this.compManager._deleteComponent(compId);
    this.positionCache.invalidate();
    // Rebuild obstacle cache after component deletion
    this.wiring.rebuildObstacleCache();
  }

  _addVisualWire(engineId, fromNodeId, toNodeId) {
    return this.wiring.addVisualWire(engineId, fromNodeId, toNodeId);
  }
  _removeVisualWireByEngineId(engineId) {
    return this.wiring.removeVisualWireByEngineId(engineId);
  }
  _reconnectWire(engineId, fromNodeId, toNodeId) {
    return this.wiring.reconnectWire(engineId, fromNodeId, toNodeId);
  }

  deleteSelectedComponents() {
    this.selection.deleteSelectedComponents();
  }

  clearSelection() {
    this.selection.clearSelection();
  }

  showToast(message, type, duration) {
    this.toaster.show(message, type, duration);
  }

  zoomToFit() {
    if (this.compManager.components.length === 0) return;
    const canvasRect = this.element.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const comp of this.compManager.components) {
      if (comp.element) {
        minX = Math.min(minX, comp.position.x);
        minY = Math.min(minY, comp.position.y);
        maxX = Math.max(maxX, comp.position.x + comp.element.offsetWidth);
        maxY = Math.max(maxY, comp.position.y + comp.element.offsetHeight);
      }
    }
    if (minX === Infinity) return;
    const padding = 60;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    const scaleX = canvasRect.width / contentW;
    const scaleY = canvasRect.height / contentH;
    this.core.scale = Math.min(scaleX, scaleY, this.core.maxScale);
    this.core.scale = Math.max(this.core.scale, this.core.minScale);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    this.core.panOffset.x = canvasRect.width / 2 - centerX * this.core.scale;
    this.core.panOffset.y = canvasRect.height / 2 - centerY * this.core.scale;
    this.core.applyTransform();
  }

  clearAll() {
    this.compManager.clear();
    this.selection.clearSelection();
    this.wiring.wires.forEach(wire => {
      wire.hideControlHandles();
      if (wire.element) wire.element.remove();
    });
    this.wiring.wires = [];
    this.positionCache.invalidate();
  }

  _placeComponent(type, scenePos) {
    // Center the component on the drop point using half of standard gate dimensions
    const halfW = 2 * GRID_SIZE;   // 40px – half of 4*GRID
    const halfH = 1.5 * GRID_SIZE; // 30px – half of 3*GRID (typical 2-input gate height)
    let x = this.core.snap(scenePos.x - halfW);
    let y = this.core.snap(scenePos.y - halfH);
    this.eventBus.emit('component-drop', { type, x, y });
  }

  _findComponentByNode(nodeId) {
    return this.engine._findComponentByNode(nodeId);
  }
}
