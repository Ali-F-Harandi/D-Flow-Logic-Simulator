import { Wire } from '../../core/Wire.js';
import {
  ConnectWireCommand,
  DisconnectWireCommand,
  DeleteComponentCommand
} from '../../utils/UndoManager.js';
import { ComponentLayoutPolicy } from '../../core/ComponentLayoutPolicy.js';

export class CanvasEvents {
  constructor(
    compManager, dragHandler, wiring, selection, panZoom, core,
    contextMenu, propertyEditor, undoManager, eventBus, positionCache,
    canvas          // <-- Canvas instance
  ) {
    this.compManager = compManager;
    this.dragHandler = dragHandler;
    this.wiring = wiring;
    this.selection = selection;
    this.panZoom = panZoom;
    this.core = core;
    this.contextMenu = contextMenu;
    this.propertyEditor = propertyEditor;
    this.undoManager = undoManager;
    this.eventBus = eventBus;
    this.positionCache = positionCache;
    this.canvas = canvas;    // <-- store real Canvas instance
    this._toaster = null;

    this.element = document.getElementById('canvas-container');
    if (!this.element) this.element = core.element;

    this._focusedComponentIndex = -1;
    this._lastMagnetNodeId = null;

    // Track double-click timing for wire editing
    this._lastClickTime = 0;
    this._lastClickTarget = null;

    this._bindMouse();
    this._bindKeyboard();
    this._bindContextMenu();
    this._bindDrop();
  }

  get engine() { return this.wiring.engine; }
  get toaster() { return this._toaster; }

  /* ---------- Mouse ---------- */
  _bindMouse() {
    this.element.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
        e.preventDefault();
        this.panZoom.startPan(e.clientX, e.clientY);
        return;
      }
      if (this.wiring.wiring) return;

      const target = e.target;

      // --- Wire control point drag ---
      if (this.wiring._wireEditHandler) {
        const hit = this.wiring._wireEditHandler.hitTestControlPoint(target);
        if (hit) {
          e.preventDefault();
          e.stopPropagation();
          if (hit.type === 'control') {
            this.wiring._wireEditHandler.startDrag(hit.wireId, hit.pointIndex, e.clientX, e.clientY);
          } else if (hit.type === 'add') {
            this.wiring._wireEditHandler.addPointAtSegment(hit.wireId, hit.afterIndex, e.clientX, e.clientY);
          }
          return;
        }
      }

      const compEl = target.closest('.component');

      if (compEl && !target.classList.contains('connector')) {
        const comp = this.compManager.getComponentById(compEl.dataset.compId);
        if (!comp) return;
        if (e.shiftKey) {
          if (this.selection.selectedComponents.has(comp.id)) {
            this.selection.selectedComponents.delete(comp.id);
            compEl.classList.remove('selected');
          } else {
            this.selection.selectedComponents.add(comp.id);
            compEl.classList.add('selected');
          }
          return;
        }
        e.preventDefault();
        if (!this.selection.selectedComponents.has(comp.id)) {
          this.selection.clearSelection();
          this.selection.selectedComponents.add(comp.id);
          compEl.classList.add('selected');
        }
        this.dragHandler.startDrag(comp, e.clientX, e.clientY);
        return;
      }

      if (target.closest('g[data-wire-id]')) {
        const wireEl = target.closest('g[data-wire-id]');
        const wireId = wireEl.dataset.wireId;
        this.selection._clearWireSelection();
        this.selection.clearSelection();
        const wire = this.wiring.wires.find(w => w.id === wireId);
        if (wire) {
          this.selection.selectedWires.add(wireId);
          wireEl.classList.add('wire-selected');
          const visual = wireEl.querySelector('.wire-visual');
          if (visual) visual.setAttribute('stroke-width', '4');

          // Show control handles for this wire
          if (this.wiring._wireEditHandler) {
            this.wiring._wireEditHandler.setActiveWire(wire);
          }
        }
        return;
      }

      if (target.classList.contains('connector')) {
        e.stopPropagation();
        const nodeId = target.dataset.node;
        const isOutput = target.classList.contains('output');
        const comp = this.engine._findComponentByNode(nodeId);
        if (comp) {
          this.wiring.startWiring(comp, nodeId, isOutput);
        }
        return;
      }

      if (!target.closest('.connector')) {
        this.selection.startSelection(e);
        // Hide wire control handles when clicking empty canvas
        if (this.wiring._wireEditHandler) {
          this.wiring._wireEditHandler.clearActive();
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.panZoom.isPanning) { this.panZoom.movePan(e.clientX, e.clientY); return; }

      // Wire control point drag
      if (this.wiring._wireEditHandler && this.wiring._wireEditHandler.isDragging) {
        this.wiring._wireEditHandler.moveDrag(e.clientX, e.clientY);
        return;
      }

      if (this.dragHandler.isDragging) { this.dragHandler.moveDrag(e.clientX, e.clientY); }
      if (this.wiring.wiring && this.wiring.wiring.tempPath) {
        const fromPos = this.positionCache.getPosition(this.wiring.wiring.fromNodeId);
        let toPos = this.core.canvasCoords(e.clientX, e.clientY);
        // AUTO-MAGNET: Snap wire end to nearest compatible connector
        const magnetResult = this._findNearestConnector(e.clientX, e.clientY);
        if (magnetResult) {
          toPos = magnetResult.position;
          this._highlightConnector(magnetResult.nodeId, true);
        }
        if (this._lastMagnetNodeId && this._lastMagnetNodeId !== magnetResult?.nodeId) {
          this._highlightConnector(this._lastMagnetNodeId, false);
        }
        this._lastMagnetNodeId = magnetResult?.nodeId || null;
        const busY = this.core.getBusBarY(this.compManager.components);
        // Use A* routing for preview (fast enough with obstacle cache)
        try {
          const router = this.wiring._getRouter();
          const previewD = Wire.computePath(fromPos, toPos, {
            minClearY: busY,
            router,
            sourceNodeId: this.wiring.wiring.fromNodeId
          });
          this.wiring.wiring.tempPath.setAttribute('d', previewD);
        } catch (e) {
          // Fallback to simple routing if A* fails
          this.wiring.wiring.tempPath.setAttribute('d', Wire.computePath(fromPos, toPos, { minClearY: busY }));
        }
      }
      if (this.selection.selectionRect) { this.selection.updateSelection(e); }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.panZoom.isPanning) { this.panZoom.endPan(); return; }

      // Wire control point drag end
      if (this.wiring._wireEditHandler && this.wiring._wireEditHandler.isDragging) {
        this.wiring._wireEditHandler.endDrag();
        return;
      }

      if (this.dragHandler.isDragging) { this.dragHandler.endDrag(); return; }

      if (this.wiring.wiring && this.wiring.wiring.tempPath) {
        // First try: check if mouse is directly over a connector
        const targetConn = e.target.closest('.connector');
        let connected = false;

        if (targetConn && targetConn.dataset.node) {
          const isTargetOutput = targetConn.classList.contains('output');
          const isSourceOutput = this.wiring.wiring.fromIsOutput;
          let success = false, errorMsg = '';
          if (isSourceOutput && !isTargetOutput) {
            const fromComp = this.engine._findComponentByNode(this.wiring.wiring.fromNodeId);
            const toComp = this.engine._findComponentByNode(targetConn.dataset.node);
            if (fromComp && toComp && fromComp.id === toComp.id) errorMsg = 'Cannot connect a component to itself!';
            else success = this.wiring.completeConnection(this.wiring.wiring.fromNodeId, targetConn.dataset.node);
          } else if (!isSourceOutput && isTargetOutput) {
            const fromComp = this.engine._findComponentByNode(targetConn.dataset.node);
            const toComp = this.engine._findComponentByNode(this.wiring.wiring.fromNodeId);
            if (fromComp && toComp && fromComp.id === toComp.id) errorMsg = 'Cannot connect a component to itself!';
            else success = this.wiring.completeConnection(targetConn.dataset.node, this.wiring.wiring.fromNodeId);
          } else if (isSourceOutput && isTargetOutput) errorMsg = 'Cannot connect output to output';
          else errorMsg = 'Cannot connect input to input';
          if (success) connected = true;
          else if (errorMsg) this.toaster ? this.toaster.show(errorMsg, 'error') : console.warn(errorMsg);
        }

        // Second try: if direct click failed, use auto-magnet result to connect
        if (!connected && this._lastMagnetNodeId) {
          const magnetComp = this.engine._findComponentByNode(this._lastMagnetNodeId);
          const magnetDot = magnetComp?.element?.querySelector(`.connector[data-node="${this._lastMagnetNodeId}"]`);
          const isMagnetOutput = magnetDot?.classList.contains('output') ?? false;
          const isSourceOutput = this.wiring.wiring.fromIsOutput;
          let success = false;
          if (isSourceOutput && !isMagnetOutput) {
            const fromComp = this.engine._findComponentByNode(this.wiring.wiring.fromNodeId);
            if (fromComp && fromComp.id === magnetComp?.id) {
              // self-connection check
            } else {
              success = this.wiring.completeConnection(this.wiring.wiring.fromNodeId, this._lastMagnetNodeId);
            }
          } else if (!isSourceOutput && isMagnetOutput) {
            const fromComp = this.engine._findComponentByNode(this._lastMagnetNodeId);
            const toComp = this.engine._findComponentByNode(this.wiring.wiring.fromNodeId);
            if (fromComp && toComp && fromComp.id === toComp.id) {
              // self-connection check
            } else {
              success = this.wiring.completeConnection(this._lastMagnetNodeId, this.wiring.wiring.fromNodeId);
            }
          }
          if (!success && !connected) {
            // No error toast for magnet fallback
          }
        }

        // Clear magnet highlight
        if (this._lastMagnetNodeId) {
          this._highlightConnector(this._lastMagnetNodeId, false);
          this._lastMagnetNodeId = null;
        }
        this.wiring.cancelWiring();
        return;
      }

      if (this.selection.selectionRect) { this.selection.endSelection(e); }
    });

    // Double-click on wire to add a control point
    this.element.addEventListener('dblclick', (e) => {
      const wireEl = e.target.closest('g[data-wire-id]');
      if (!wireEl) return;

      // If double-clicking on a control point, remove it
      if (this.wiring._wireEditHandler) {
        const hit = this.wiring._wireEditHandler.hitTestControlPoint(e.target);
        if (hit && hit.type === 'control') {
          this.wiring._wireEditHandler.removePoint(hit.wireId, hit.pointIndex);
          return;
        }
      }

      // Otherwise, add a new control point at the click position
      const wireId = wireEl.dataset.wireId;
      const wire = this.wiring.wires.find(w => w.id === wireId);
      if (wire && this.wiring._wireEditHandler) {
        const canvasPos = this.core.canvasCoords(e.clientX, e.clientY);
        this.wiring._wireEditHandler.addPointAtPosition(canvasPos, wire);
        this.wiring._wireEditHandler.setActiveWire(wire);
      }
    });
  }

  /* ---------- Keyboard ---------- */
  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (this.wiring.wiring) return;
      const step = this.core.gridSize;
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this.undoManager.undo(); }
      else if (e.ctrlKey && e.key === 'y') { e.preventDefault(); this.undoManager.redo(); }
      else if (e.ctrlKey && e.key === 'c') { e.preventDefault(); this.selection.copySelected(); }
      else if (e.ctrlKey && e.key === 'v') { e.preventDefault(); this.selection.pasteCopied(); }
      else if (e.key === 'Escape') { this.selection.clearSelection(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selection.selectedComponents.size > 0 || this.selection.selectedWires.size > 0) {
          e.preventDefault();
          this.selection.deleteSelectedComponents();
        }
      }
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        this.dragHandler.moveSelectedComponents(dx, dy);
      }
      else if (e.key === 'Tab') {
        e.preventDefault();
        this._cycleFocus(e.shiftKey ? -1 : 1);
      }
    });
  }

  _cycleFocus(direction) {
    const comps = this.compManager.components;
    if (comps.length === 0) return;
    if (this._focusedComponentIndex >= 0 && comps[this._focusedComponentIndex]) {
      comps[this._focusedComponentIndex].element?.classList.remove('component-focused');
    }
    this._focusedComponentIndex = (this._focusedComponentIndex + direction + comps.length) % comps.length;
    const comp = comps[this._focusedComponentIndex];
    if (comp?.element) {
      comp.element.classList.add('component-focused');
      this.selection.clearSelection();
      this.selection.selectedComponents.add(comp.id);
      comp.element.classList.add('selected');
      comp.element.focus();
    }
  }

  /* ---------- Context Menu ---------- */
  _bindContextMenu() {
    this.element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const items = [];

      // Check for wire control point right-click (remove point)
      if (this.wiring._wireEditHandler) {
        const hit = this.wiring._wireEditHandler.hitTestControlPoint(e.target);
        if (hit && hit.type === 'control') {
          items.push({ label: 'Remove Control Point', action: () => {
            this.wiring._wireEditHandler.removePoint(hit.wireId, hit.pointIndex);
          }});
          this.contextMenu.show(e.clientX, e.clientY, items);
          return;
        }
      }

      const compEl = e.target.closest('.component');
      if (compEl && !e.target.classList.contains('connector')) {
        const comp = this.compManager.getComponentById(compEl.dataset.compId);
        if (comp) {
          items.push({ label: 'Properties', action: () => this.propertyEditor.open(comp) });
          items.push({ label: 'Delete', action: () => {
            const cmd = new DeleteComponentCommand(this.engine, this.canvas, comp);
            this.undoManager.execute(cmd);
          }});
          this.contextMenu.show(e.clientX, e.clientY, items);
          return;
        }
      }

      const wireEl = e.target.closest('g[data-wire-id]');
      if (wireEl) {
        const wireId = wireEl.dataset.wireId;
        const wire = this.wiring.wires.find(w => w.id === wireId);
        if (wire) {
          items.push({ label: 'Delete Wire', action: () => {
            const cmd = new DisconnectWireCommand(this.engine, this.canvas, wire.engineId);
            this.undoManager.execute(cmd);
          }});
          items.push({ label: 'Reroute This Wire', action: () => {
            const busY = this.core.getBusBarY(this.compManager.components);
            const router = this.wiring._getRouter();
            wire.forceReroute(
              (nodeId) => this.positionCache.getPosition(nodeId),
              busY,
              router
            );
            wire.refreshControlHandles();
            this.wiring.updateWireCrossings();
          }});
          items.push({ label: 'Add Control Point Here', action: () => {
            const canvasPos = this.core.canvasCoords(e.clientX, e.clientY);
            if (this.wiring._wireEditHandler) {
              this.wiring._wireEditHandler.addPointAtPosition(canvasPos, wire);
              this.wiring._wireEditHandler.setActiveWire(wire);
            }
          }});
          items.push({ label: wire.isLocked ? 'Unlock Wire' : 'Lock Wire', action: () => {
            if (wire.isLocked) {
              wire.unlock();
            } else {
              wire.lock();
              wire.hideControlHandles();
            }
          }});
          // Show wire state info
          const stateLabel = wire.wireState === 'auto' ? 'Auto-routed' :
                            wire.wireState === 'manual' ? 'Manually edited' : 'Locked';
          items.push({ label: `State: ${stateLabel}`, action: () => {} });
          this.contextMenu.show(e.clientX, e.clientY, items);
          return;
        }
      }

      const conn = e.target.closest('.connector');
      if (conn && conn.dataset.node) {
        if (conn.classList.contains('output')) {
          items.push({ label: 'Generate Truth Table', action: () => {
            this.eventBus.emit('show-panel', 'truth');
            this.eventBus.emit('generate-truth-table', conn.dataset.node);
          }});
        }
        items.push({ label: 'Set as TestBench Output', action: () => {
          this.eventBus.emit('set-testbench-output', conn.dataset.node);
        }});
        this.contextMenu.show(e.clientX, e.clientY, items);
      }
    });
  }

  /* ---------- Drop ---------- */
  _bindDrop() {
    this.element.addEventListener('dragover', (e) => e.preventDefault());
    this.element.addEventListener('drop', (e) => {
      e.preventDefault();
      if (this.dragHandler.isDragging) return;
      const type = e.dataTransfer.getData('text/plain');
      if (!type) return;
      const pos = this.core.canvasCoords(e.clientX, e.clientY);
      // Use ComponentLayoutPolicy for accurate drop centering
      const factory = this.canvas?.factory;
      const comp = factory ? factory.createComponent(type) : null;
      let halfW, halfH;
      if (comp) {
        const offset = ComponentLayoutPolicy.getCenterOffset(comp.type, comp.inputs.length, comp.outputs.length);
        halfW = offset.x;
        halfH = offset.y;
      } else {
        halfW = 2 * 20;
        halfH = 1.5 * 20;
      }
      const x = this.core.snap(pos.x - halfW);
      const y = this.core.snap(pos.y - halfH);
      this.eventBus.emit('component-drop', { type, x, y });
    });
  }

  /* ---------- Auto-Magnet Helpers ---------- */

  /**
   * Find the nearest connector to a screen point within the magnet radius.
   * Returns { nodeId, isOutput, position: {x, y} } or null.
   */
  _findNearestConnector(clientX, clientY) {
    const MAGNET_RADIUS = 30;
    const fromIsOutput = this.wiring.wiring?.fromIsOutput;
    const fromNodeId = this.wiring.wiring?.fromNodeId;
    let closest = null;
    let closestDist = MAGNET_RADIUS;

    for (const comp of this.compManager.components) {
      const allNodes = [
        ...comp.inputs.map(inp => ({ nodeId: inp.id, isOutput: false })),
        ...comp.outputs.map(out => ({ nodeId: out.id, isOutput: true }))
      ];

      for (const nodeInfo of allNodes) {
        if (fromIsOutput === nodeInfo.isOutput) continue;
        if (comp.id === this.engine._findComponentByNode(fromNodeId)?.id) continue;
        if (!nodeInfo.isOutput) {
          const inputNode = comp.inputs.find(i => i.id === nodeInfo.nodeId);
          if (inputNode?.connectedTo) continue;
        }

        try {
          const pos = this.positionCache.getPosition(nodeInfo.nodeId);
          if (!pos) continue;
          const rect = this.core.element.getBoundingClientRect();
          const screenX = rect.left + pos.x * this.core.scale + this.core.panOffset.x;
          const screenY = rect.top + pos.y * this.core.scale + this.core.panOffset.y;
          const dist = Math.hypot(clientX - screenX, clientY - screenY);

          if (dist < closestDist) {
            closestDist = dist;
            closest = { nodeId: nodeInfo.nodeId, isOutput: nodeInfo.isOutput, position: pos };
          }
        } catch (e) { /* skip */ }
      }
    }
    return closest;
  }

  /**
   * Visually highlight/unhighlight a connector dot for auto-magnet feedback.
   */
  _highlightConnector(nodeId, highlight) {
    if (!nodeId) return;
    const comp = this.engine._findComponentByNode(nodeId);
    if (!comp?.element) return;
    const dot = comp.element.querySelector(`.connector[data-node="${nodeId}"]`);
    if (!dot) return;
    if (highlight) {
      dot.style.transform = 'scale(1.8)';
      dot.style.boxShadow = '0 0 8px var(--color-accent)';
      dot.style.zIndex = '10';
    } else {
      dot.style.transform = '';
      dot.style.boxShadow = '';
      dot.style.zIndex = '';
    }
  }
}
