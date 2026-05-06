import { Wire } from '../core/Wire.js';
import { generateId } from '../utils/IdGenerator.js';
import { ContextMenu } from './ContextMenu.js';
import { PropertyEditor } from './PropertyEditor.js';
import { UndoManager, AddComponentCommand, DeleteComponentCommand, ConnectWireCommand, DisconnectWireCommand } from '../utils/UndoManager.js';

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

    this.svgLayer = this._createSVGLayer();
    this.element.appendChild(this.svgLayer);

    this.components = [];
    this.wires = [];
    this.wiring = null;          // { fromComp, fromNodeId, tempPath }
    this.dragData = null;
    this.isDragging = false;

    this.gridSize = 20;          // pixels
    this._drawGrid();

    this._bindEvents();
    this._bindTouchEvents();     // touch listeners
    eventBus.on('component-created', (comp) => this.addComponent(comp));
    eventBus.on('component-modified', (comp) => this._onComponentModified(comp));
    engine.onUpdate = () => this._redrawWires();
    this._setupDrop();

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        this.undoManager.undo();
      } else if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        this.undoManager.redo();
      }
    });
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
    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.id = 'grid-pattern';
    pattern.setAttribute('width', this.gridSize);
    pattern.setAttribute('height', this.gridSize);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', this.gridSize);
    dot.setAttribute('cy', this.gridSize);
    dot.setAttribute('r', 1);
    // Use CSS class to let theme control the colour
    dot.classList.add('grid-dot');
    pattern.appendChild(dot);
    svg.appendChild(pattern);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', 'url(#grid-pattern)');
    rect.style.pointerEvents = 'none';
    svg.insertBefore(rect, svg.firstChild);
  }

  /* ---------- Snap helper ---------- */
  _snap(value) {
    return Math.round(value / this.gridSize) * this.gridSize;
  }

  /* ---------- Event binding ---------- */
  _bindEvents() {
    this.element.addEventListener('mousedown', (e) => this._onMouseDown(e));
    window.addEventListener('mousemove', (e) => this._onMouseMove(e));
    window.addEventListener('mouseup', (e) => this._onMouseUp(e));
    this.element.addEventListener('contextmenu', (e) => this._onContextMenu(e));
  }

  /* ---------- Touch event binding ---------- */
  _bindTouchEvents() {
    let longPressTimer = null;
    let touchMoved = false;

    const handleTouchStart = (e) => {
      if (this.wiring) return;
      const touch = e.touches[0];
      const target = e.target;

      const compEl = target.closest('.component');
      if (compEl && !target.classList.contains('connector')) {
        e.preventDefault();
        const compId = compEl.dataset.compId;
        const comp = this.components.find(c => c.id === compId);
        if (comp) {
          this.isDragging = true;
          this._startDrag(comp, touch.clientX, touch.clientY);
          touchMoved = false;
          clearTimeout(longPressTimer);
          longPressTimer = setTimeout(() => {
            if (!touchMoved) {
              const items = [
                { label: 'Properties', action: () => this.propertyEditor.open(comp) },
                { label: 'Delete', action: () => {
                    const cmd = new DeleteComponentCommand(this.engine, this, comp);
                    this.undoManager.execute(cmd);
                  }}
              ];
              this.contextMenu.show(touch.clientX, touch.clientY, items);
            }
          }, 500);
        }
      }
      else if (target.classList.contains('connector') && target.classList.contains('output')) {
        e.preventDefault();
        const nodeId = target.dataset.node;
        const comp = this._findComponentByNode(nodeId);
        if (comp) this._startWiring(comp, nodeId, touch);
      }
    };

    const handleTouchMove = (e) => {
      if (!this.dragData && !this.wiring) return;
      e.preventDefault();
      const touch = e.touches[0];
      if (this.dragData) {
        touchMoved = true;
        clearTimeout(longPressTimer);
        const dx = touch.clientX - this.dragData.startX;
        const dy = touch.clientY - this.dragData.startY;
        let newX = this._snap(this.dragData.origLeft + dx);
        let newY = this._snap(this.dragData.origTop + dy);
        this.dragData.component.updatePosition(newX, newY);
        this._updateWiresForComponent(this.dragData.component);
      }
      if (this.wiring && this.wiring.tempPath) {
        const rect = this.element.getBoundingClientRect();
        const toPos = {
          x: touch.clientX - rect.left + this.element.scrollLeft,
          y: touch.clientY - rect.top + this.element.scrollTop
        };
        const fromPos = this._getNodePosition(this.wiring.fromNodeId);
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
          const toNodeId = targetConn.dataset.node;
          this._completeConnection(this.wiring.fromNodeId, toNodeId);
        }
        this._cancelWiring();
      }
    };

    this.element.addEventListener('touchstart', handleTouchStart, { passive: false });
    this.element.addEventListener('touchmove', handleTouchMove, { passive: false });
    this.element.addEventListener('touchend', handleTouchEnd);
  }

  _onMouseDown(e) {
    if (this.wiring) return;
    const compEl = e.target.closest('.component');
    if (compEl && !e.target.classList.contains('connector')) {
      const compId = compEl.dataset.compId;
      const comp = this.components.find(c => c.id === compId);
      if (comp) {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = true;
        this._startDrag(comp, e.clientX, e.clientY);
      }
    }
  }

  _startDrag(comp, mx, my) {
    this.dragData = {
      component: comp,
      startX: mx,
      startY: my,
      origLeft: comp.position.x,
      origTop: comp.position.y
    };
  }

  _onMouseMove(e) {
    if (this.dragData) {
      const dx = e.clientX - this.dragData.startX;
      const dy = e.clientY - this.dragData.startY;
      let newX = this.dragData.origLeft + dx;
      let newY = this.dragData.origTop + dy;
      newX = this._snap(newX);
      newY = this._snap(newY);
      this.dragData.component.updatePosition(newX, newY);
      this._updateWiresForComponent(this.dragData.component);
    }
    if (this.wiring && this.wiring.tempPath) {
      const rect = this.element.getBoundingClientRect();
      const toPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const fromPos = this._getNodePosition(this.wiring.fromNodeId);
      this.wiring.tempPath.setAttribute('d', this._getManhattanPath(fromPos, toPos));
    }
  }

  _onMouseUp(e) {
    if (this.dragData) {
      this.dragData = null;
      this.isDragging = false;
    }
    if (this.wiring && this.wiring.tempPath) {
      const targetConn = e.target.closest('.connector');
      if (targetConn && targetConn.dataset.node && !targetConn.classList.contains('output')) {
        const toNodeId = targetConn.dataset.node;
        this._completeConnection(this.wiring.fromNodeId, toNodeId);
      }
      this._cancelWiring();
    }
  }

  /* ---------- Context menu (right‑click) ---------- */
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

  /* ---------- Drop handling ---------- */
  _setupDrop() {
    this.element.addEventListener('dragover', (e) => e.preventDefault());
    this.element.addEventListener('drop', (e) => {
      e.preventDefault();
      if (this.isDragging) return;
      const type = e.dataTransfer.getData('text/plain');
      if (!type) return;
      const canvasRect = this.element.getBoundingClientRect();
      const centerX = e.clientX - canvasRect.left;
      const centerY = e.clientY - canvasRect.top;
      const snappedCenterX = this._snap(centerX);
      const snappedCenterY = this._snap(centerY);
      this.eventBus.emit('component-drop', {
        type,
        x: snappedCenterX - 40,
        y: snappedCenterY - 20
      });
    });
  }

  /* ---------- Adding & modifying components ---------- */
  addComponent(component) {
    component.render(this.element);
    component.element.addEventListener('dragstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    component.element.dataset.compId = component.id;
    component.element.querySelectorAll('.connector').forEach(dot => {
      dot.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const nodeId = dot.dataset.node;
        const isOutput = dot.classList.contains('output');
        if (isOutput) {
          this._startWiring(component, nodeId, e);
        }
      });
    });
    this.components.push(component);
  }

  _onComponentModified(comp) {
    if (!comp.element) return;
    comp.element.setAttribute('draggable', 'false');
    comp.element.draggable = false;
    comp.element.addEventListener('dragstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    comp.element.dataset.compId = comp.id;
    comp.element.querySelectorAll('.connector').forEach(dot => {
      dot.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const nodeId = dot.dataset.node;
        const isOutput = dot.classList.contains('output');
        if (isOutput) {
          this._startWiring(comp, nodeId, e);
        }
      });
    });
    this._updateWiresForComponent(comp);
    this._redrawWires();
  }

  /* ---------- Deletion ---------- */
  _deleteComponent(compId) {
    this.engine.removeComponent(compId);
    const comp = this.components.find(c => c.id === compId);
    if (comp && comp.element) comp.element.remove();
    this.wires = this.wires.filter(w => {
      const belongs = w.fromNode.nodeId.startsWith(compId) || w.toNode.nodeId.startsWith(compId);
      if (belongs && w.element) w.element.remove();
      return !belongs;
    });
    this.components = this.components.filter(c => c.id !== compId);
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

  /* ---------- Wiring (visual) ---------- */
  _startWiring(component, nodeId, e) {
    if (this.wiring) return;
    this.wiring = { fromComp: component, fromNodeId: nodeId };
    const svg = this.svgLayer;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke', '#4ec9b0');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('pointer-events', 'none');
    const fromPos = this._getNodePosition(nodeId);
    path.setAttribute('d', this._getManhattanPath(fromPos, { x: fromPos.x, y: fromPos.y }));
    svg.appendChild(path);
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

  /* ---------- Geometry helpers ---------- */
  _getNodePosition(nodeId) {
    const dot = this.element.querySelector(`[data-node="${nodeId}"]`);
    if (!dot) return { x: 0, y: 0 };
    const canvasRect = this.element.getBoundingClientRect();
    const dotRect = dot.getBoundingClientRect();
    return {
      x: dotRect.left + dotRect.width / 2 - canvasRect.left + this.element.scrollLeft,
      y: dotRect.top + dotRect.height / 2 - canvasRect.top + this.element.scrollTop
    };
  }

  _getManhattanPath(from, to) {
    const midX = from.x + 20;
    return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
  }

  /* ---------- Wire updates ---------- */
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

  /* ---------- Utility ---------- */
  _findComponentByNode(nodeId) {
    return this.engine._findComponentByNode(nodeId);
  }
}