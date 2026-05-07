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

    this.scale = 1;
    this.panOffset = { x: 0, y: 0 };
    this.minScale = 0.2;
    this.maxScale = 4;

    // Inner transformable container – must fill the canvas-container
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
    this.selectionRect = null;
    this.selectionStart = null;

    this.gridSize = 20;
    this._drawGrid();
    this._updateTransform();

    this._bindEvents();
    this._bindTouchEvents();
    this._bindZoomAndPan();

    eventBus.on('component-created', (comp) => this.addComponent(comp));
    eventBus.on('component-modified', (comp) => this._onComponentModified(comp));
    engine.onUpdate = () => this._redrawWires();
    
    // Touch‑initiated drops from the sidebar
    eventBus.on('canvas-touch-drop', ({ type, pageX, pageY }) => {
      const pos = this._canvasCoords({ pageX, pageY });
      this._placeComponent(type, pos);
    });

    this._setupDrop();

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        this.undoManager.undo();
      } else if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        this.undoManager.redo();
      } else if (e.key === 'Escape') {
        this.clearSelection();
      }
    });
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
    this._redrawWires();
    this._updateGrid();
  }

  _updateGrid() {
    const pattern = this.svgLayer.querySelector('#grid-pattern');
    if (pattern) {
      pattern.setAttribute('width', this.gridSize * this.scale);
      pattern.setAttribute('height', this.gridSize * this.scale);
    }
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

  _drawGrid() {
    const svg = this.svgLayer;
    let pattern = svg.querySelector('#grid-pattern');
    if (pattern) pattern.remove();
    pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.id = 'grid-pattern';
    pattern.setAttribute('width', this.gridSize);
    pattern.setAttribute('height', this.gridSize);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', this.gridSize);
    dot.setAttribute('cy', this.gridSize);
    dot.setAttribute('r', 1);
    dot.classList.add('grid-dot');
    pattern.appendChild(dot);
    svg.appendChild(pattern);

    let rect = svg.querySelector('.grid-rect');
    if (!rect) {
      rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.classList.add('grid-rect');
      rect.setAttribute('width', '100%');
      rect.setAttribute('height', '100%');
      rect.setAttribute('fill', 'url(#grid-pattern)');
      rect.style.pointerEvents = 'none';
      svg.insertBefore(rect, svg.firstChild);
    }
  }

  _snap(value) {
    return Math.round(value / this.gridSize) * this.gridSize;
  }

  /* ---------- Mouse Events (drag adjusted for zoom) ---------- */
  _bindEvents() {
    this.element.addEventListener('mousedown', (e) => this._onMouseDown(e));
    window.addEventListener('mousemove', (e) => this._onMouseMove(e));
    window.addEventListener('mouseup', (e) => this._onMouseUp(e));
    this.element.addEventListener('contextmenu', (e) => this._onContextMenu(e));
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
        });
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
      // Scale the delta to match scene coordinates
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
    }
    if (this.wiring && this.wiring.tempPath) {
      const fromPos = this._getNodePosition(this.wiring.fromNodeId);
      const toPos = this._canvasCoords(e);
      this.wiring.tempPath.setAttribute('d', this._getManhattanPath(fromPos, toPos));
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
      this.dragData = null;
      this.isDragging = false;
    }
    if (this.wiring && this.wiring.tempPath) {
      const targetConn = e.target.closest('.connector');
      if (targetConn && targetConn.dataset.node && !targetConn.classList.contains('output')) {
        this._completeConnection(this.wiring.fromNodeId, targetConn.dataset.node);
      }
      this._cancelWiring();
    }
    if (this.selectionRect) {
      this._endSelection(e);
    }
  }

  /* ---------- Touch Events (full drag + wiring) ---------- */
  _bindTouchEvents() {
    let longPressTimer = null;
    let touchMoved = false;

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
        } else if (target.classList.contains('connector') && target.classList.contains('output')) {
          e.preventDefault();
          const nodeId = target.dataset.node;
          const comp = this._findComponentByNode(nodeId);
          if (comp) this._startWiring(comp, nodeId, e);
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
      }
      if (this.wiring && this.wiring.tempPath) {
        const fromPos = this._getNodePosition(this.wiring.fromNodeId);
        const touch = e.touches[0];
        const toPos = this._canvasCoords({ clientX: touch.clientX, clientY: touch.clientY });
        this.wiring.tempPath.setAttribute('d', this._getManhattanPath(fromPos, toPos));
      }
    };

    const handleTouchEnd = (e) => {
      clearTimeout(longPressTimer);
      if (this.dragData) {
        this.dragData = null;
        this.isDragging = false;
      }
      if (this.wiring && this.wiring.tempPath) {
        const touch = e.changedTouches[0];
        const targetConn = document.elementFromPoint(touch.clientX, touch.clientY);
        if (targetConn && targetConn.classList.contains('connector') && !targetConn.classList.contains('output')) {
          this._completeConnection(this.wiring.fromNodeId, targetConn.dataset.node);
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
    if (conn && conn.dataset.node && conn.classList.contains('output')) {
      const nodeId = conn.dataset.node;
      items.push({ label: 'Generate Truth Table', action: () => {
        this.eventBus.emit('show-panel', 'truth');
        this.eventBus.emit('generate-truth-table', nodeId);
      }});
      items.push({ label: 'Set as TestBench Output', action: () => {
        this.eventBus.emit('set-testbench-output', nodeId);
      }});
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
    // No clamping – allow placement anywhere on infinite canvas
    this.eventBus.emit('component-drop', { type, x, y });
  }

  addComponent(component) {
    component.render(this.scene);
    component.element.addEventListener('dragstart', (e) => { e.preventDefault(); e.stopPropagation(); });
    component.element.dataset.compId = component.id;
    component.element.querySelectorAll('.connector').forEach(dot => {
      dot.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const nodeId = dot.dataset.node;
        if (dot.classList.contains('output')) this._startWiring(component, nodeId, e);
      });
    });
    this.components.push(component);
  }

  _onComponentModified(comp) {
    if (!comp.element) return;
    comp.element.setAttribute('draggable', 'false');
    comp.element.draggable = false;
    comp.element.addEventListener('dragstart', (e) => { e.preventDefault(); e.stopPropagation(); });
    comp.element.dataset.compId = comp.id;
    comp.element.querySelectorAll('.connector').forEach(dot => {
      dot.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (dot.classList.contains('output')) this._startWiring(comp, dot.dataset.node, e);
      });
    });
    this._updateWiresForComponent(comp);
    this._redrawWires();
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
  }

  _deleteWire(visualWireId) {
    const wire = this.wires.find(w => w.id === visualWireId);
    if (!wire) return;
    this.engine.disconnect(wire.engineId);
    if (wire.element) wire.element.remove();
    this.wires = this.wires.filter(w => w.id !== visualWireId);
  }

  _removeVisualWireByEngineId(engineId) {
    const wire = this.wires.find(w => w.engineId === engineId);
    if (wire) {
      if (wire.element) wire.element.remove();
      this.wires = this.wires.filter(w => w.engineId !== engineId);
    }
  }

  _startWiring(component, nodeId, e) {
    if (this.wiring) return;
    this.wiring = { fromComp: component, fromNodeId: nodeId };
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke', '#4ec9b0');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('pointer-events', 'none');
    const fromPos = this._getNodePosition(nodeId);
    path.setAttribute('d', this._getManhattanPath(fromPos, fromPos));
    this.svgLayer.appendChild(path);
    this.wiring.tempPath = path;
  }

  _completeConnection(fromNodeId, toNodeId) {
    const cmd = new ConnectWireCommand(this.engine, this, fromNodeId, toNodeId);
    this.undoManager.execute(cmd);
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
    wire.render(this.svgLayer, (nodeId) => this._getNodePosition(nodeId));
    this.wires.push(wire);
  }

  _reconnectWire(engineId, fromNodeId, toNodeId) {
    this._addVisualWire(engineId, fromNodeId, toNodeId);
  }

  _getNodePosition(nodeId) {
    const dot = this.element.querySelector(`[data-node="${nodeId}"]`);
    if (!dot) return { x: 0, y: 0 };
    const canvasRect = this.element.getBoundingClientRect();
    const dotRect = dot.getBoundingClientRect();
    return {
      x: (dotRect.left + dotRect.width/2 - canvasRect.left - this.panOffset.x) / this.scale,
      y: (dotRect.top + dotRect.height/2 - canvasRect.top - this.panOffset.y) / this.scale
    };
  }

  _getManhattanPath(from, to) {
    const midX = from.x + 20;
    return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
  }

  _updateWiresForComponent(comp) {
    const prefix = comp.id + '.';
    this.wires.forEach(wire => {
      if (wire.fromNode.nodeId.startsWith(prefix) || wire.toNode.nodeId.startsWith(prefix)) {
        wire.updatePath((nodeId) => this._getNodePosition(nodeId));
      }
    });
  }

  _redrawWires() {
    this.wires.forEach(wire => {
      wire.updatePath((nodeId) => this._getNodePosition(nodeId));
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
}