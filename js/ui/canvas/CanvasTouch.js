import { Wire } from '../../core/Wire.js';
import { DeleteComponentCommand } from '../../utils/UndoManager.js';

export class CanvasTouch {
  constructor(
    core, compManager, dragHandler, wiring, selection, panZoom,
    contextMenu, propertyEditor, element, undoManager, engine,
    canvas           // <-- NEW PARAMETER
  ) {
    this.core = core;
    this.compManager = compManager;
    this.dragHandler = dragHandler;
    this.wiring = wiring;
    this.selection = selection;
    this.panZoom = panZoom;
    this.contextMenu = contextMenu;
    this.propertyEditor = propertyEditor;
    this.element = element;
    this.undoManager = undoManager;
    this.engine = engine;
    this.canvas = canvas;    // <-- store

    this.touchPanning = false;
    this.touchPanStart = null;
    this.longPressTimer = null;
    this.lastTouchDist = null;
    this.touchMoved = false;

    this._bindEvents();
  }

  _bindEvents() {
    this.element.addEventListener('touchstart', this._onTouchStart.bind(this), { passive: false });
    this.element.addEventListener('touchmove', this._onTouchMove.bind(this), { passive: false });
    this.element.addEventListener('touchend', this._onTouchEnd.bind(this));
    this.element.addEventListener('touchcancel', this._cleanupTouch.bind(this));
  }

  _cleanupTouch() {
    clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
    if (this.dragHandler.isDragging) this.dragHandler.endDrag();
    this.touchPanning = false;
    this.touchPanStart = null;
    this.lastTouchDist = null;
    this.touchMoved = false;
  }

  _onTouchStart(e) {
    this._cleanupTouch();
    if (e.touches.length === 2) {
      this.lastTouchDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
      return;
    }

    const touch = e.touches[0];
    const target = e.target;
    const compEl = target.closest('.component');

    if (compEl && !target.classList.contains('connector')) {
      e.preventDefault();
      const comp = this.compManager.getComponentById(compEl.dataset.compId);
      if (comp) {
        this.touchMoved = false;
        this.dragHandler.startDrag(comp, touch.clientX, touch.clientY);
        this.longPressTimer = setTimeout(() => {
          if (!this.touchMoved) {
            this.contextMenu.show(touch.clientX, touch.clientY, [
              { label: 'Properties', action: () => this.propertyEditor.open(comp) },
              { label: 'Delete', action: () => {
                const cmd = new DeleteComponentCommand(this.engine, this.canvas, comp);
                this.undoManager.execute(cmd);
              }}
            ]);
          }
        }, 500);
      }
    } else if (target.classList.contains('connector')) {
      e.preventDefault();
      const nodeId = target.dataset.node;
      const comp = this.engine._findComponentByNode(nodeId);
      if (comp) this.wiring.startWiring(comp, nodeId, target.classList.contains('output'));
    } else {
      this.touchPanning = true;
      this.touchPanStart = { x: touch.clientX - this.core.panOffset.x, y: touch.clientY - this.core.panOffset.y };
    }
  }

  _onTouchMove(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
      if (this.lastTouchDist) {
        const delta = dist > this.lastTouchDist ? 1 : -1;
        const midX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
        const midY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
        const rect = this.element.getBoundingClientRect();
        this.core.zoom(delta, midX - rect.left, midY - rect.top);
      }
      this.lastTouchDist = dist;
      return;
    }

    if (this.dragHandler.isDragging) {
      e.preventDefault();
      this.touchMoved = true;
      clearTimeout(this.longPressTimer);
      const touch = e.touches[0];
      this.dragHandler.moveDrag(touch.clientX, touch.clientY);
    } else if (this.touchPanning) {
      const touch = e.touches[0];
      this.panZoom.movePan(touch.clientX, touch.clientY);
    }

    if (this.wiring.wiring && this.wiring.wiring.tempPath) {
      const fromPos = this.wiring.positionCache.getPosition(this.wiring.wiring.fromNodeId);
      const touch = e.touches[0];
      const toPos = this.core.canvasCoords(touch.clientX, touch.clientY);
      const busY = this.core.getBusBarY(this.compManager.components);
      this.wiring.wiring.tempPath.setAttribute('d', Wire.computePath(fromPos, toPos, { minClearY: busY }));
    }
  }

  _onTouchEnd(e) {
    clearTimeout(this.longPressTimer);
    if (this.dragHandler.isDragging) this.dragHandler.endDrag();
    if (this.wiring.wiring && this.wiring.wiring.tempPath) {
      const touch = e.changedTouches[0];
      const targetConn = document.elementFromPoint(touch.clientX, touch.clientY);
      if (targetConn?.classList.contains('connector') && targetConn.dataset.node) {
        const isTargetOutput = targetConn.classList.contains('output');
        const isSourceOutput = this.wiring.wiring.fromIsOutput;
        if (isSourceOutput && !isTargetOutput) {
          this.wiring.completeConnection(this.wiring.wiring.fromNodeId, targetConn.dataset.node);
        } else if (!isSourceOutput && isTargetOutput) {
          this.wiring.completeConnection(targetConn.dataset.node, this.wiring.wiring.fromNodeId);
        }
      }
      this.wiring.cancelWiring();
    }
    if (this.selection.selectionRect) this.selection.endSelection(e);
    this._cleanupTouch();
  }
}