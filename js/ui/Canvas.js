import { Wire } from '../core/Wire.js';
import { generateId } from '../utils/IdGenerator.js';
import { ContextMenu } from './ContextMenu.js';
import { PropertyEditor } from './PropertyEditor.js';
import { 
  UndoManager, 
  AddComponentCommand, 
  DeleteComponentCommand, 
  ConnectWireCommand, 
  DisconnectWireCommand 
} from '../utils/UndoManager.js';
import { NodePositionCache } from '../utils/NodePositionCache.js';
import { GRID_SIZE } from '../config.js';

export class Canvas {
  constructor(container, eventBus, engine, factory, undoManager) {
    // ... (constructor unchanged except where grid is set up; the code below uses the CSS grid approach from earlier, but the z-index fix is independent)
    // NOTE: The following is the full constructor with the CSS grid setup for completeness.
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

    this.scale = 1;
    this.panOffset = { x: 0, y: 0 };
    this.minScale = 0.2;
    this.maxScale = 4;

    this.scene = document.createElement('div');
    this.scene.id = 'canvas-scene';
    this.scene.style.position = 'absolute';
    this.scene.style.transformOrigin = '0 0';
    this.scene.style.width = '100%';
    this.scene.style.height = '100%';
    this.element.appendChild(this.scene);

    this.svgLayer = this._createSVGLayer();
    this.scene.appendChild(this.svgLayer);

    this.components = [];
    this.wires = [];
    this.wiring = null;
    this.dragData = null;
    this.isDragging = false;
    this.isPanning = false;
    this.panStart = null;

    this.selectedComponents = new Set();
    this.selectedWires = new Set();
    this.selectionRect = null;
    this.selectionStart = null;

    this.gridSize = GRID_SIZE;

    // 1. Create the position cache early
    this.positionCache = new NodePositionCache(this.element, this.panOffset, this.scale);

    // 2. Override _updateTransform to keep cache, grid, and dot size in sync
    const originalUpdateTransform = this._updateTransform.bind(this);
    this._updateTransform = () => {
      originalUpdateTransform();
      this.positionCache.setTransform(this.panOffset, this.scale);

      // Dynamic grid with balanced dot size
      const scaledSize = this.gridSize * this.scale;
      const dotRadius = Math.max(1.2, Math.min(3.5, scaledSize * 0.15));
      this.element.style.backgroundSize = `${scaledSize}px ${scaledSize}px`;
      this.element.style.backgroundPosition = `${this.panOffset.x}px ${this.panOffset.y}px`;
      this.element.style.backgroundImage =
        `radial-gradient(circle at 0px 0px, var(--grid-dot-color) ${dotRadius}px, transparent ${dotRadius}px)`;
    };

    // 3. Initial grid setup (will be applied by _updateTransform)
    this._updateTransform();

    // Batched wire redraw
    this._redrawRequested = false;
    this._scheduleRedraw = () => {
      if (!this._redrawRequested) {
        this._redrawRequested = true;
        requestAnimationFrame(() => {
          this._performRedraw();
          this._redrawRequested = false;
        });
      }
    };

    // Accessibility
    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-label', 'Circuit canvas');
    this.element.setAttribute('tabindex', '0');
    this._focusedComponentIndex = -1;

    this._bindEvents();
    this._bindTouchEvents();
    this._bindZoomAndPan();

    eventBus.on('component-created', (comp) => this.addComponent(comp));
    eventBus.on('component-modified', (comp) => this._onComponentModified(comp));
    engine.onUpdate = () => this._scheduleRedraw();

    eventBus.on('canvas-touch-drop', ({ type, pageX, pageY }) => {
      const pos = this._canvasCoords({ pageX, pageY });
      this._placeComponent(type, pos);
    });

    this._setupDrop();

    document.addEventListener('wire-removed', (e) => {
      const wireId = e.detail.wireId;
      const wire = this.wires.find(w => w.engineId === wireId);
      if (wire) {
        if (wire.element) wire.element.remove();
        this.wires = this.wires.filter(w => w.engineId !== wireId);
        this._updateJunctions();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        this.undoManager.undo();
      } else if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        this.undoManager.redo();
      } else if (e.ctrlKey && e.key === 'c') {
        this._copySelected();
      } else if (e.ctrlKey && e.key === 'v') {
        this._pasteCopied();
      } else if (e.key === 'Escape') {
        this.clearSelection();
      }
    });

    this._createToastContainer();
    this._clipboard = null;
  }

  /* ---------- Toast Notifications ---------- */
  _createToastContainer() {
    this.toastContainer = document.createElement('div');
    this.toastContainer.id = 'toast-container';
    document.body.appendChild(this.toastContainer);
  }

  showToast(message, type = 'info', duration = 2500) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    this.toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-show'));
    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  /* ---------- Copy / Paste ---------- */
  _copySelected() {
    const ids = Array.from(this.selectedComponents);
    if (ids.length === 0) return;
    this._clipboard = ids.map(id => {
      const comp = this.components.find(c => c.id === id);
      return comp ? { type: comp.type, dx: comp.position.x, dy: comp.position.y } : null;
    }).filter(Boolean);
    if (this._clipboard.length > 0) {
      const minX = Math.min(...this._clipboard.map(c => c.dx));
      const minY = Math.min(...this._clipboard.map(c => c.dy));
      this._clipboard.forEach(c => { c.dx -= minX; c.dy -= minY; });
      this.showToast(`Copied ${this._clipboard.length} component(s)`, 'success');
    }
  }

  _pasteCopied() {
    if (!this._clipboard || this._clipboard.length === 0) {
      this.showToast('Nothing to paste', 'warning');
      return;
    }
    const offsetX = 80;
    const offsetY = 40;
    this._clipboard.forEach(c => {
      this.eventBus.emit('component-drop', {
        type: c.type,
        x: c.dx + offsetX,
        y: c.dy + offsetY
      });
    });
    this.showToast(`Pasted ${this._clipboard.length} component(s)`, 'success');
  }

  /* ---------- Transform Helpers ---------- */
  _updateTransform() {
    this.scene.style.transform = `translate(${this.panOffset.x}px, ${this.panOffset.y}px) scale(${this.scale})`;
  }

  _canvasCoords(eOrCoords) {
    const rect = this.element.getBoundingClientRect();
    if (eOrCoords.clientX !== undefined && eOrCoords.clientY !== undefined) {
      return {
        x: (eOrCoords.clientX - rect.left - this.panOffset.x) / this.scale,
        y: (eOrCoords.clientY - rect.top - this.panOffset.y) / this.scale
      };
    } else if (eOrCoords.pageX !== undefined) {
      return {
        x: (eOrCoords.pageX - rect.left - this.panOffset.x) / this.scale,
        y: (eOrCoords.pageY - rect.top - this.panOffset.y) / this.scale
      };
    }
    return { x: 0, y: 0 };
  }

  _zoom(delta, centerX, centerY) {
    const oldScale = this.scale;
    const newScale = Math.min(this.maxScale, Math.max(this.minScale, oldScale * (delta > 0 ? 1.1 : 0.9)));
    const factor = newScale / oldScale;
    this.panOffset.x = centerX - (centerX - this.panOffset.x) * factor;
    this.panOffset.y = centerY - (centerY - this.panOffset.y) * factor;
    this.scale = newScale;
    this._updateTransform();
    this._scheduleRedraw();
  }

  zoomToFit() {
    if (this.components.length === 0) return;
    const canvasRect = this.element.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.components.forEach(comp => {
      if (comp.element) {
        minX = Math.min(minX, comp.position.x);
        minY = Math.min(minY, comp.position.y);
        maxX = Math.max(maxX, comp.position.x + comp.element.offsetWidth);
        maxY = Math.max(maxY, comp.position.y + comp.element.offsetHeight);
      }
    });
    if (minX === Infinity) return;
    const padding = 60;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    const scaleX = canvasRect.width / contentW;
    const scaleY = canvasRect.height / contentH;
    this.scale = Math.min(scaleX, scaleY, this.maxScale);
    this.scale = Math.max(this.scale, this.minScale);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    this.panOffset.x = canvasRect.width / 2 - centerX * this.scale;
    this.panOffset.y = canvasRect.height / 2 - centerY * this.scale;
    this._updateTransform();
    this._scheduleRedraw();
  }

  /* ---------- Panning ---------- */
  _startPan(e) {
    this.isPanning = true;
    this.panStart = { x: e.clientX - this.panOffset.x, y: e.clientY - this.panOffset.y };
    this.element.style.cursor = 'grabbing';
  }
  _movePan(e) {
    if (!this.isPanning) return;
    this.panOffset.x = e.clientX - this.panStart.x;
    this.panOffset.y = e.clientY - this.panStart.y;
    this._updateTransform();
  }
  _endPan() {
    this.isPanning = false;
    this.element.style.cursor = '';
  }

  /* ---------- Selection ---------- */
  _startSelection(e) {
    this.selectionStart = this._canvasCoords(e);
    this.selectionRect = document.createElement('div');
    this.selectionRect.className = 'selection-rect';
    this.selectionRect.style.position = 'absolute';
    this.selectionRect.style.border = '1px dashed var(--color-accent)';
    this.selectionRect.style.background = 'rgba(0,122,204,0.1)';
    this.selectionRect.style.pointerEvents = 'none';
    this.element.appendChild(this.selectionRect);
  }
  _updateSelection(e) {
    if (!this.selectionRect) return;
    const curr = this._canvasCoords(e);
    const x = Math.min(this.selectionStart.x, curr.x) * this.scale + this.panOffset.x;
    const y = Math.min(this.selectionStart.y, curr.y) * this.scale + this.panOffset.y;
    const w = Math.abs(curr.x - this.selectionStart.x) * this.scale;
    const h = Math.abs(curr.y - this.selectionStart.y) * this.scale;
    this.selectionRect.style.left = x + 'px';
    this.selectionRect.style.top = y + 'px';
    this.selectionRect.style.width = w + 'px';
    this.selectionRect.style.height = h + 'px';
  }
  _endSelection(e) {
    if (!this.selectionRect) return;
    const rect = this.selectionRect.getBoundingClientRect();
    const canvasRect = this.element.getBoundingClientRect();
    const minX = (rect.left - canvasRect.left - this.panOffset.x) / this.scale;
    const minY = (rect.top - canvasRect.top - this.panOffset.y) / this.scale;
    const maxX = minX + rect.width / this.scale;
    const maxY = minY + rect.height / this.scale;
    if (!e.shiftKey) this.clearSelection();
    this.components.forEach(comp => {
      if (!comp.element) return;
      const cx = comp.position.x + 40;
      const cy = comp.position.y + 40;
      if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
        this.selectedComponents.add(comp.id);
        comp.element.classList.add('selected');
      }
    });
    this.selectionRect.remove();
    this.selectionRect = null;
    this.selectionStart = null;
  }

  clearSelection() {
    this.selectedComponents.forEach(id => {
      const comp = this.components.find(c => c.id === id);
      if (comp && comp.element) comp.element.classList.remove('selected');
    });
    this.selectedComponents.clear();
    this._clearWireSelection();
  }

  _clearWireSelection() {
    this.selectedWires.forEach(wireId => {
      const wire = this.wires.find(w => w.id === wireId);
      if (wire && wire.element) {
        wire.element.classList.remove('wire-selected');
        const visual = wire.element.querySelector('.wire-visual');
        if (visual) visual.setAttribute('stroke-width', '2');
      }
    });
    this.selectedWires.clear();
  }

  _selectWire(wireId) {
    this._clearWireSelection();
    this.clearSelection();
    const wire = this.wires.find(w => w.id === wireId);
    if (wire && wire.element) {
      this.selectedWires.add(wireId);
      wire.element.classList.add('wire-selected');
      const visual = wire.element.querySelector('.wire-visual');
      if (visual) visual.setAttribute('stroke-width', '4');
    }
  }

  deleteSelectedComponents() {
    const ids = Array.from(this.selectedComponents);
    ids.forEach(id => {
      const comp = this.components.find(c => c.id === id);
      if (comp) {
        const cmd = new DeleteComponentCommand(this.engine, this, comp);
        this.undoManager.execute(cmd);
      }
    });
    this.selectedComponents.clear();

    const wireIds = Array.from(this.selectedWires);
    wireIds.forEach(wireId => {
      const wire = this.wires.find(w => w.id === wireId);
      if (wire) {
        const cmd = new DisconnectWireCommand(this.engine, this, wire.engineId);
        this.undoManager.execute(cmd);
      }
    });
    this.selectedWires.clear();
  }

  /* ---------- SVG & Grid ---------- */
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

  _snap(value) {
    return Math.round(value / this.gridSize) * this.gridSize;
  }

  /* ---------- Mouse Events ---------- */
  _bindEvents() {
    this.element.addEventListener('mousedown', (e) => this._onMouseDown(e));
    window.addEventListener('mousemove', (e) => this._onMouseMove(e));
    window.addEventListener('mouseup', (e) => this._onMouseUp(e));
    this.element.addEventListener('contextmenu', (e) => this._onContextMenu(e));
    this.element.addEventListener('keydown', (e) => this._onKeyDown(e));
  }

  _onMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
      e.preventDefault();
      this._startPan(e);
      return;
    }
    if (this.wiring) return;
    const compEl = e.target.closest('.component');
    if (compEl && !e.target.classList.contains('connector')) {
      if (e.shiftKey) {
        const compId = compEl.dataset.compId;
        if (this.selectedComponents.has(compId)) {
          this.selectedComponents.delete(compId);
          compEl.classList.remove('selected');
        } else {
          this.selectedComponents.add(compId);
          compEl.classList.add('selected');
        }
        return;
      }
      const compId = compEl.dataset.compId;
      const comp = this.components.find(c => c.id === compId);
      if (comp) {
        e.preventDefault();
        if (!this.selectedComponents.has(compId)) {
          this.clearSelection();
          this.selectedComponents.add(compId);
          compEl.classList.add('selected');
        }
        this.isDragging = true;
        const selected = Array.from(this.selectedComponents).map(id => this.components.find(c => c.id === id)).filter(Boolean);
        this.dragData = {
          components: selected,
          startX: e.clientX,
          startY: e.clientY,
          origins: {}
        };
        selected.forEach(c => {
          this.dragData.origins[c.id] = { x: c.position.x, y: c.position.y };
          c.element.style.zIndex = '1000';                 // <-- bring to front
        });
      }
    } else if (e.target.closest('g[data-wire-id]')) {
      const wireEl = e.target.closest('g[data-wire-id]');
      const wireId = wireEl.dataset.wireId;
      this._clearWireSelection();
      this.clearSelection();
      const wire = this.wires.find(w => w.id === wireId);
      if (wire) {
        this.selectedWires.add(wireId);
        wireEl.classList.add('wire-selected');
        const visual = wireEl.querySelector('.wire-visual');
        if (visual) visual.setAttribute('stroke-width', '4');
      }
    } else if (!e.target.closest('.connector')) {
      this._startSelection(e);
    }
  }

  _onMouseMove(e) {
    if (this.isPanning) {
      this._movePan(e);
      return;
    }
    if (this.dragData) {
      const dx = (e.clientX - this.dragData.startX) / this.scale;
      const dy = (e.clientY - this.dragData.startY) / this.scale;
      this.dragData.components.forEach(comp => {
        const orig = this.dragData.origins[comp.id];
        let nx = orig.x + dx;
        let ny = orig.y + dy;
        nx = this._snap(nx);
        ny = this._snap(ny);
        comp.updatePosition(nx, ny);
      });
      this.dragData.components.forEach(comp => this._updateWiresForComponent(comp));
      this.positionCache.invalidate();
    }
    if (this.wiring && this.wiring.tempPath) {
      const fromPos = this._getNodePosition(this.wiring.fromNodeId);
      const toPos = this._canvasCoords(e);
      const busY = this._getBusBarY();
      this.wiring.tempPath.setAttribute('d', Wire.computePath(fromPos, toPos, { minClearY: busY }));
    }
    if (this.selectionRect) {
      this._updateSelection(e);
    }
  }

  _onMouseUp(e) {
    if (this.isPanning) {
      this._endPan();
      return;
    }
    if (this.dragData) {
      this.dragData.components.forEach(c => c.element.style.zIndex = '');  // reset
      this.dragData = null;
      this.isDragging = false;
    }
    if (this.wiring && this.wiring.tempPath) {
      const targetConn = e.target.closest('.connector');
      if (targetConn && targetConn.dataset.node) {
        const isTargetOutput = targetConn.classList.contains('output');
        const isSourceOutput = this.wiring.fromIsOutput;
        if (isSourceOutput && !isTargetOutput) {
          const fromComp = this.engine._findComponentByNode(this.wiring.fromNodeId);
          const toComp = this.engine._findComponentByNode(targetConn.dataset.node);
          if (fromComp && toComp && fromComp.id === toComp.id) {
            this.showToast('Cannot connect a component to itself!', 'error');
          } else {
            this._completeConnection(this.wiring.fromNodeId, targetConn.dataset.node);
          }
        } else if (!isSourceOutput && isTargetOutput) {
          const fromComp = this.engine._findComponentByNode(targetConn.dataset.node);
          const toComp = this.engine._findComponentByNode(this.wiring.fromNodeId);
          if (fromComp && toComp && fromComp.id === toComp.id) {
            this.showToast('Cannot connect a component to itself!', 'error');
          } else {
            this._completeConnection(targetConn.dataset.node, this.wiring.fromNodeId);
          }
        } else if (isSourceOutput && isTargetOutput) {
          this.showToast('Cannot connect output to output', 'error');
        } else {
          this.showToast('Cannot connect input to input', 'error');
        }
      }
      this._cancelWiring();
    }
    if (this.selectionRect) {
      this._endSelection(e);
    }
  }

  /* ---------- Keyboard Events ---------- */
  _onKeyDown(e) {
    if (this.wiring) return;
    const step = this.gridSize;
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        this._moveSelectedComponents(0, -step);
        break;
      case 'ArrowDown':
        e.preventDefault();
        this._moveSelectedComponents(0, step);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this._moveSelectedComponents(-step, 0);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this._moveSelectedComponents(step, 0);
        break;
      case 'Tab':
        e.preventDefault();
        this._cycleComponentFocus(e.shiftKey ? -1 : 1);
        break;
      case 'Delete':
      case 'Backspace':
        if (this.selectedComponents.size > 0 || this.selectedWires.size > 0) {
          e.preventDefault();
          this.deleteSelectedComponents();
        }
        break;
    }
  }

  _moveSelectedComponents(dx, dy) {
    if (this.selectedComponents.size === 0) return;
    this.selectedComponents.forEach(id => {
      const comp = this.components.find(c => c.id === id);
      if (comp) {
        const nx = this._snap(comp.position.x + dx);
        const ny = this._snap(comp.position.y + dy);
        comp.updatePosition(nx, ny);
      }
    });
    this.selectedComponents.forEach(id => {
      const comp = this.components.find(c => c.id === id);
      if (comp) this._updateWiresForComponent(comp);
    });
    this.positionCache.invalidate();
    this._scheduleRedraw();
  }

  _cycleComponentFocus(direction) {
    if (this.components.length === 0) return;
    if (this._focusedComponentIndex >= 0) {
      const prev = this.components[this._focusedComponentIndex];
      if (prev && prev.element) prev.element.classList.remove('component-focused');
    }
    this._focusedComponentIndex += direction;
    if (this._focusedComponentIndex >= this.components.length) this._focusedComponentIndex = 0;
    if (this._focusedComponentIndex < 0) this._focusedComponentIndex = this.components.length - 1;

    const comp = this.components[this._focusedComponentIndex];
    if (comp && comp.element) {
      comp.element.classList.add('component-focused');
      this.clearSelection();
      this.selectedComponents.add(comp.id);
      comp.element.classList.add('selected');
      comp.element.focus();
    }
  }

  /* ---------- Touch Events ---------- */
  _bindTouchEvents() {
    let longPressTimer = null;
    let touchMoved = false;

    const cleanup = () => {
      clearTimeout(longPressTimer);
      if (this.dragData) {
        this.dragData.components.forEach(c => c.element.style.zIndex = '');  // reset
        this.dragData = null;
        this.isDragging = false;
      }
      if (this.wiring && this.wiring.tempPath) {
        this._cancelWiring();
      }
      if (this.selectionRect) {
        this._endSelection(null);
      }
    };

    const handleTouchStart = (e) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const target = e.target;
        const compEl = target.closest('.component');
        if (compEl && !target.classList.contains('connector')) {
          e.preventDefault();
          const compId = compEl.dataset.compId;
          const comp = this.components.find(c => c.id === compId);
          if (comp) {
            touchMoved = false;
            this._startDrag(comp, touch.clientX, touch.clientY);
            clearTimeout(longPressTimer);
            longPressTimer = setTimeout(() => {
              if (!touchMoved) {
                this.contextMenu.show(touch.clientX, touch.clientY, [
                  { label: 'Properties', action: () => this.propertyEditor.open(comp) },
                  { label: 'Delete', action: () => {
                    const cmd = new DeleteComponentCommand(this.engine, this, comp);
                    this.undoManager.execute(cmd);
                  }}
                ]);
              }
            }, 500);
          }
        } else if (target.classList.contains('connector')) {
          e.preventDefault();
          const nodeId = target.dataset.node;
          const comp = this._findComponentByNode(nodeId);
          if (comp) this._startWiring(comp, nodeId, e, target.classList.contains('output'));
        }
      }
    };

    const handleTouchMove = (e) => {
      if (this.dragData) {
        e.preventDefault();
        touchMoved = true;
        clearTimeout(longPressTimer);
        const touch = e.touches[0];
        const dx = (touch.clientX - this.dragData.startX) / this.scale;
        const dy = (touch.clientY - this.dragData.startY) / this.scale;
        this.dragData.components.forEach(comp => {
          const orig = this.dragData.origins[comp.id];
          let nx = orig.x + dx;
          let ny = orig.y + dy;
          nx = this._snap(nx);
          ny = this._snap(ny);
          comp.updatePosition(nx, ny);
        });
        this.dragData.components.forEach(comp => this._updateWiresForComponent(comp));
        this.positionCache.invalidate();
      }
      if (this.wiring && this.wiring.tempPath) {
        const fromPos = this._getNodePosition(this.wiring.fromNodeId);
        const touch = e.touches[0];
        const toPos = this._canvasCoords({ clientX: touch.clientX, clientY: touch.clientY });
        this.wiring.tempPath.setAttribute('d', Wire.computePath(fromPos, toPos));
      }
    };

    const handleTouchEnd = (e) => {
      clearTimeout(longPressTimer);
      if (this.dragData) {
        this.dragData.components.forEach(c => c.element.style.zIndex = '');  // reset
        this.dragData = null;
        this.isDragging = false;
      }
      if (this.wiring && this.wiring.tempPath) {
        const touch = e.changedTouches[0];
        const targetConn = document.elementFromPoint(touch.clientX, touch.clientY);
        if (targetConn && targetConn.classList.contains('connector') && targetConn.dataset.node) {
          const isTargetOutput = targetConn.classList.contains('output');
          const isSourceOutput = this.wiring.fromIsOutput;
          if (isSourceOutput && !isTargetOutput) {
            this._completeConnection(this.wiring.fromNodeId, targetConn.dataset.node);
          } else if (!isSourceOutput && isTargetOutput) {
            this._completeConnection(targetConn.dataset.node, this.wiring.fromNodeId);
          }
        }
        this._cancelWiring();
      }
      if (this.selectionRect) {
        this._endSelection(e);
      }
    };

    this.element.addEventListener('touchstart', handleTouchStart, { passive: false });
    this.element.addEventListener('touchmove', handleTouchMove, { passive: false });
    this.element.addEventListener('touchend', handleTouchEnd);
    this.element.addEventListener('touchcancel', cleanup);
  }

  _startDrag(comp, mx, my) {
    if (!this.selectedComponents.has(comp.id)) {
      this.clearSelection();
      this.selectedComponents.add(comp.id);
      comp.element.classList.add('selected');
    }
    const selected = Array.from(this.selectedComponents).map(id => this.components.find(c => c.id === id)).filter(Boolean);
    this.dragData = {
      components: selected,
      startX: mx,
      startY: my,
      origins: {}
    };
    selected.forEach(c => {
      this.dragData.origins[c.id] = { x: c.position.x, y: c.position.y };
      c.element.style.zIndex = '1000';                 // <-- bring to front on touch drag as well
    });
  }

  /* ---------- Zoom & Pan binding ---------- */
  _bindZoomAndPan() {
    this.element.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.element.getBoundingClientRect();
      this._zoom(e.deltaY > 0 ? -1 : 1, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    let lastDist = 0;
    this.element.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        lastDist = Math.hypot(
          e.touches[0].pageX - e.touches[1].pageX,
          e.touches[0].pageY - e.touches[1].pageY
        );
      }
    }, { passive: false });

    this.element.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].pageX - e.touches[1].pageX,
          e.touches[0].pageY - e.touches[1].pageY
        );
        const delta = dist - lastDist;
        if (Math.abs(delta) > 5) {
          const rect = this.element.getBoundingClientRect();
          const cx = (e.touches[0].pageX + e.touches[1].pageX) / 2 - rect.left;
          const cy = (e.touches[0].pageY + e.touches[1].pageY) / 2 - rect.top;
          this._zoom(delta, cx, cy);
          lastDist = dist;
        }
      }
    }, { passive: false });
  }

  /* ---------- Context menu, drop, wiring, etc. ---------- */
  _onContextMenu(e) {
    e.preventDefault();
    const items = [];
    const compEl = e.target.closest('.component');
    if (compEl && !e.target.classList.contains('connector')) {
      const compId = compEl.dataset.compId;
      const comp = this.components.find(c => c.id === compId);
      if (comp) {
        items.push({ label: 'Properties', action: () => this.propertyEditor.open(comp) });
        items.push({ label: 'Delete', action: () => {
          const cmd = new DeleteComponentCommand(this.engine, this, comp);
          this.undoManager.execute(cmd);
        }});
        this.contextMenu.show(e.clientX, e.clientY, items);
        return;
      }
    }
    const wireEl = e.target.closest('g[data-wire-id]');
    if (wireEl) {
      const wireId = wireEl.dataset.wireId;
      const wire = this.wires.find(w => w.id === wireId);
      if (wire) {
        items.push({ label: 'Delete Wire', action: () => {
          const cmd = new DisconnectWireCommand(this.engine, this, wire.engineId);
          this.undoManager.execute(cmd);
        }});
        this.contextMenu.show(e.clientX, e.clientY, items);
        return;
      }
    }
    const conn = e.target.closest('.connector');
    if (conn && conn.dataset.node) {
      const isOutput = conn.classList.contains('output');
      if (isOutput) {
        items.push({ label: 'Generate Truth Table', action: () => {
          this.eventBus.emit('show-panel', 'truth');
          this.eventBus.emit('generate-truth-table', conn.dataset.node);
        }});
        items.push({ label: 'Set as TestBench Output', action: () => {
          this.eventBus.emit('set-testbench-output', conn.dataset.node);
        }});
      } else {
        items.push({ label: 'Set as TestBench Output', action: () => {
          this.eventBus.emit('set-testbench-output', conn.dataset.node);
        }});
      }
      this.contextMenu.show(e.clientX, e.clientY, items);
    }
  }

  _setupDrop() {
    this.element.addEventListener('dragover', (e) => e.preventDefault());
    this.element.addEventListener('drop', (e) => {
      e.preventDefault();
      if (this.isDragging) return;
      const type = e.dataTransfer.getData('text/plain');
      if (!type) return;
      const pos = this._canvasCoords(e);
      this._placeComponent(type, pos);
    });
  }

  _placeComponent(type, scenePos) {
    let x = this._snap(scenePos.x - 40);
    let y = this._snap(scenePos.y - 20);
    this.eventBus.emit('component-drop', { type, x, y });
  }

  addComponent(component) {
    component.render(this.scene);
    component.element.addEventListener('dragstart', (e) => { e.preventDefault(); e.stopPropagation(); });
    component.element.dataset.compId = component.id;
    component.element.setAttribute('tabindex', '-1');
    component.element.setAttribute('role', 'group');
    component.element.setAttribute('aria-label', `${component.type} component`);
    component.element.querySelectorAll('.connector').forEach(dot => {
      dot.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const nodeId = dot.dataset.node;
        const isOutput = dot.classList.contains('output');
        this._startWiring(component, nodeId, e, isOutput);
      });
    });
    this.components.push(component);
    this.positionCache.invalidate();
  }

  _onComponentModified(comp) {
    if (!comp.element) return;
    comp.element.setAttribute('draggable', 'false');
    comp.element.draggable = false;
    comp.element.addEventListener('dragstart', (e) => { e.preventDefault(); e.stopPropagation(); });
    comp.element.dataset.compId = comp.id;
    comp.element.setAttribute('tabindex', '-1');
    comp.element.setAttribute('role', 'group');
    comp.element.setAttribute('aria-label', `${comp.type} component`);
    comp.element.querySelectorAll('.connector').forEach(dot => {
      dot.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const isOutput = dot.classList.contains('output');
        this._startWiring(comp, dot.dataset.node, e, isOutput);
      });
    });
    this._updateWiresForComponent(comp);
    this._scheduleRedraw();
  }

  _deleteComponent(compId) {
    this.engine.removeComponent(compId);
    const comp = this.components.find(c => c.id === compId);
    if (comp && comp.element) comp.element.remove();
    this.wires = this.wires.filter(w => {
      if (w.fromNode.nodeId.startsWith(compId) || w.toNode.nodeId.startsWith(compId)) {
        if (w.element) w.element.remove();
        return false;
      }
      return true;
    });
    this.components = this.components.filter(c => c.id !== compId);
    this.selectedComponents.delete(compId);
    this._updateJunctions();
    this.positionCache.invalidate();
  }

  _deleteWire(visualWireId) {
    const wire = this.wires.find(w => w.id === visualWireId);
    if (!wire) return;
    this.engine.disconnect(wire.engineId);
    if (wire.element) wire.element.remove();
    this.wires = this.wires.filter(w => w.id !== visualWireId);
    this._updateJunctions();
  }

  _removeVisualWireByEngineId(engineId) {
    const wire = this.wires.find(w => w.engineId === engineId);
    if (wire) {
      if (wire.element) wire.element.remove();
      this.wires = this.wires.filter(w => w.engineId !== engineId);
      this._updateJunctions();
    }
  }

  _startWiring(component, nodeId, e, isOutput) {
    if (this.wiring) return;
    this.wiring = { fromComp: component, fromNodeId: nodeId, fromIsOutput: isOutput };
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke', '#4ec9b0');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('pointer-events', 'none');
    path.setAttribute('stroke-dasharray', '6,4');
    const fromPos = this._getNodePosition(nodeId);
    path.setAttribute('d', Wire.computePath(fromPos, fromPos));
    this.svgLayer.appendChild(path);
    this.wiring.tempPath = path;
  }

  _completeConnection(fromNodeId, toNodeId) {
    const cmd = new ConnectWireCommand(this.engine, this, fromNodeId, toNodeId);
    const success = this.undoManager.execute(cmd);
    if (!success) {
      this.showToast('Connection failed', 'error');
    }
  }

  _cancelWiring() {
    if (this.wiring && this.wiring.tempPath) {
      this.wiring.tempPath.remove();
    }
    this.wiring = null;
  }

  _addVisualWire(engineId, fromNodeId, toNodeId) {
    const visualId = generateId('wire');
    const wire = new Wire(visualId, { nodeId: fromNodeId }, { nodeId: toNodeId });
    wire.engineId = engineId;
    const busY = this._getBusBarY();
    wire.render(this.svgLayer, (nodeId) => this._getNodePosition(nodeId), busY);
    this.wires.push(wire);
    this._updateJunctions();
  }

  /**
 * Return the lowest Y coordinate of any component plus a safe margin.
 * This guarantees that a horizontal wire drawn at this Y will not cross
 * any existing component.
 */
_getBusBarY() {
    let maxBottom = 0;
    for (const comp of this.components) {
      if (comp.element) {
        const bottom = comp.position.y + comp.element.offsetHeight;
        if (bottom > maxBottom) maxBottom = bottom;
      }
    }
    return maxBottom + 40;   // 40px extra clearance
  }

  _reconnectWire(engineId, fromNodeId, toNodeId) {
    this._addVisualWire(engineId, fromNodeId, toNodeId);
  }

  _updateJunctions() {
    const outputFanout = {};
    this.wires.forEach(w => {
      const fromId = w.fromNode.nodeId;
      outputFanout[fromId] = (outputFanout[fromId] || 0) + 1;
    });
    this.wires.forEach(w => {
      if (outputFanout[w.fromNode.nodeId] > 1) {
        w.showJunction();
      } else {
        w.hideJunction();
      }
    });
  }

  _getNodePosition(nodeId) {
    return this.positionCache.getPosition(nodeId);
  }

  _updateWiresForComponent(comp) {
    const prefix = comp.id + '.';
    const busY = this._getBusBarY();   // compute once for all affected wires
    this.wires.forEach(wire => {
      if (wire.fromNode.nodeId.startsWith(prefix) || wire.toNode.nodeId.startsWith(prefix)) {
        wire.updatePath((nodeId) => this._getNodePosition(nodeId), busY);
      }
    });
  }

  _performRedraw() {
    const busY = this._getBusBarY();
    this.wires.forEach(wire => {
      wire.updatePath((nodeId) => this._getNodePosition(nodeId), busY);
      const sourceComp = this.engine._findComponentByNode(wire.fromNode.nodeId);
      if (sourceComp) {
        const outNode = sourceComp.outputs.find(o => o.id === wire.fromNode.nodeId);
        if (outNode) wire.updateColor(outNode.value);
      }
    });
  }

  _findComponentByNode(nodeId) {
    return this.engine._findComponentByNode(nodeId);
  }

  clearAll() {
    this.components.forEach(comp => {
      if (comp.element) comp.element.remove();
    });
    this.components = [];
    this.selectedComponents.clear();
    this._clearWireSelection();
    this.wires.forEach(wire => {
      if (wire.element) wire.element.remove();
    });
    this.wires = [];
    this.positionCache.invalidate();
  }
}