import { Wire } from '../../core/Wire.js';
import { DeleteComponentCommand, DisconnectWireCommand } from '../../utils/UndoManager.js';

export class CanvasTouch {
  constructor(
    core, compManager, dragHandler, wiring, selection, panZoom,
    contextMenu, propertyEditor, element, undoManager, engine,
    canvas           // <-- Canvas instance
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
    this.canvas = canvas;

    this.touchPanning = false;
    this.touchPanStart = null;
    this.longPressTimer = null;
    this.lastTouchDist = null;
    this.touchMoved = false;

    // Long-press configuration
    this.LONG_PRESS_MS = 500;
    this.LONG_PRESS_MOVE_THRESHOLD = 10; // px before we consider it a move (not long-press)

    // Auto-magnet configuration
    this.MAGNET_RADIUS = 30; // px — snap distance for connector magnet

    // Track touch start position for move threshold detection
    this.touchStartPos = null;

    // Track if long press already fired (to avoid double actions)
    this.longPressFired = false;

    // Track if a component was tapped (for toggle actions)
    this.tappedComponent = null;

    // Track if we're dragging a wire control point
    this._draggingControlPoint = false;

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
    if (this.wiring._wireEditHandler && this.wiring._wireEditHandler.isDragging) {
      this.wiring._wireEditHandler.endDrag();
    }
    this._draggingControlPoint = false;
    this.touchPanning = false;
    this.touchPanStart = null;
    this.lastTouchDist = null;
    this.touchMoved = false;
    this.touchStartPos = null;
    this.longPressFired = false;
    this.tappedComponent = null;
  }

  _onTouchStart(e) {
    this._cleanupTouch();
    if (e.touches.length === 2) {
      // Pinch zoom — store initial distance
      this.lastTouchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      this.lastPinchCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
      return;
    }

    const touch = e.touches[0];
    const target = e.target;
    this.touchStartPos = { x: touch.clientX, y: touch.clientY };
    this.touchMoved = false;

    // --- Wire control point drag (touch) ---
    if (this.wiring._wireEditHandler) {
      const hit = this.wiring._wireEditHandler.hitTestControlPoint(target);
      if (hit) {
        e.preventDefault();
        if (hit.type === 'control') {
          this.wiring._wireEditHandler.startDrag(hit.wireId, hit.pointIndex, touch.clientX, touch.clientY);
          this._draggingControlPoint = true;
        } else if (hit.type === 'add') {
          this.wiring._wireEditHandler.addPointAtSegment(hit.wireId, hit.afterIndex, touch.clientX, touch.clientY);
          this._draggingControlPoint = true;
        }
        return;
      }
    }

    // ---- Check for DIP8 bit toggle squares ----
    const dipBit = target.closest('.dip-bit');
    if (dipBit) {
      // Don't preventDefault() — let the dip-bit's own touchend handler fire
      const compEl = dipBit.closest('.component');
      if (compEl) {
        const comp = this.compManager.getComponentById(compEl.dataset.compId);
        if (comp && comp.type === 'DipSwitch' && typeof comp.toggleBit === 'function') {
          // Just set up long-press for context menu; toggle is handled by the
          // dip-bit's own touchend handler
          this.longPressFired = false;
          this.longPressTimer = setTimeout(() => {
            if (!this.longPressFired) {
              this.longPressFired = true;
              if (navigator.vibrate) navigator.vibrate(50);
              this._showComponentContextMenu(comp, touch.clientX, touch.clientY);
            }
          }, this.LONG_PRESS_MS);
        }
      }
      return;
    }

    // ---- Check for component touch ----
    const compEl = target.closest('.component');
    if (compEl && !target.classList.contains('connector')) {
      const comp = this.compManager.getComponentById(compEl.dataset.compId);
      if (comp) {
        // For ALL components (including ToggleSwitch): start drag immediately.
        // For toggle-type components (ToggleSwitch), a short tap (no move) will
        // toggle in _onTouchEnd, while a drag will move the component.
        e.preventDefault();
        this.dragHandler.startDrag(comp, touch.clientX, touch.clientY);

        // Also track tap for toggle-type components
        const isTapToggleable = comp.type === 'ToggleSwitch';
        if (isTapToggleable && !target.closest('.connector')) {
          this.tappedComponent = comp;
        }

        // Set up long-press timer for context menu
        this.longPressFired = false;
        this.longPressTimer = setTimeout(() => {
          if (!this.touchMoved && !this.longPressFired) {
            this.longPressFired = true;
            // Cancel drag since long-press triggers context menu instead
            if (this.dragHandler.isDragging) this.dragHandler.endDrag();
            if (navigator.vibrate) navigator.vibrate(50);
            this._showComponentContextMenu(comp, touch.clientX, touch.clientY);
          }
        }, this.LONG_PRESS_MS);
        return;
      }
    }

    // ---- Check for connector tap (wire start) ----
    if (target.classList.contains('connector')) {
      e.preventDefault();
      const nodeId = target.dataset.node;
      const comp = this.engine._findComponentByNode(nodeId);
      if (comp) {
        this.wiring.startWiring(comp, nodeId, target.classList.contains('output'));
      }
      return;
    }

    // ---- Check for wire tap (for selection) ----
    const wireEl = target.closest('g[data-wire-id]');
    if (wireEl) {
      const wireId = wireEl.dataset.wireId;
      const wire = this.wiring.wires.find(w => w.id === wireId);
      if (wire) {
        e.preventDefault();
        this.selection._clearWireSelection();
        this.selection.clearSelection();
        this.selection.selectedWires.add(wireId);
        wireEl.classList.add('wire-selected');
        const visual = wireEl.querySelector('.wire-visual');
        if (visual) visual.setAttribute('stroke-width', '4');

        // Show control handles for this wire
        if (this.wiring._wireEditHandler) {
          this.wiring._wireEditHandler.setActiveWire(wire);
        }

        // Long-press on wire shows context menu
        this.longPressFired = false;
        this.longPressTimer = setTimeout(() => {
          if (!this.touchMoved && !this.longPressFired) {
            this.longPressFired = true;
            if (navigator.vibrate) navigator.vibrate(50);
            this._showWireContextMenu(wire, touch.clientX, touch.clientY);
          }
        }, this.LONG_PRESS_MS);
        return;
      }
    }

    // ---- Empty canvas: start panning ----
    this.touchPanning = true;
    this.touchPanStart = {
      x: touch.clientX - this.core.panOffset.x,
      y: touch.clientY - this.core.panOffset.y
    };

    // Long-press on empty canvas
    this.longPressFired = false;
    this.longPressTimer = setTimeout(() => {
      if (!this.touchMoved && !this.longPressFired) {
        this.longPressFired = true;
        if (navigator.vibrate) navigator.vibrate(50);
        this._showCanvasContextMenu(touch.clientX, touch.clientY);
      }
    }, this.LONG_PRESS_MS);
  }

  _onTouchMove(e) {
    // Pinch zoom
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (this.lastTouchDist) {
        // FIX: Use proportional scaling instead of +1/-1 steps for smoother pinch zoom
        const scaleFactor = dist / this.lastTouchDist;
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = this.element.getBoundingClientRect();
        this.core.zoomProportional(scaleFactor, midX - rect.left, midY - rect.top);
      }
      this.lastTouchDist = dist;
      this.lastPinchCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
      return;
    }

    const touch = e.touches[0];

    // Detect if touch moved beyond threshold
    if (this.touchStartPos) {
      const dx = touch.clientX - this.touchStartPos.x;
      const dy = touch.clientY - this.touchStartPos.y;
      if (Math.hypot(dx, dy) > this.LONG_PRESS_MOVE_THRESHOLD) {
        this.touchMoved = true;
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
        // If moved significantly, it's a drag — cancel any pending tap
        this.tappedComponent = null;
      }
    }

    // Wire control point drag
    if (this.wiring._wireEditHandler && this.wiring._wireEditHandler.isDragging) {
      e.preventDefault();
      this.wiring._wireEditHandler.moveDrag(touch.clientX, touch.clientY);
      return;
    }

    if (this.dragHandler.isDragging) {
      e.preventDefault();
      this.dragHandler.moveDrag(touch.clientX, touch.clientY);
    } else if (this.touchPanning) {
      this.panZoom.movePan(touch.clientX, touch.clientY);
    }

    // Wire drawing with auto-magnet
    if (this.wiring.wiring && this.wiring.wiring.tempPath) {
      e.preventDefault();
      const fromPos = this.wiring.positionCache.getPosition(this.wiring.wiring.fromNodeId);

      // AUTO-MAGNET: Find the nearest connector to the touch point and snap to it
      let toPos = this.core.canvasCoords(touch.clientX, touch.clientY);
      const magnetResult = this._findNearestConnector(touch.clientX, touch.clientY);
      if (magnetResult) {
        toPos = magnetResult.position;
        // Highlight the magnetized connector
        this._highlightConnector(magnetResult.nodeId, true);
      }
      // Un-highlight previously highlighted connector
      if (this._lastMagnetNodeId && this._lastMagnetNodeId !== magnetResult?.nodeId) {
        this._highlightConnector(this._lastMagnetNodeId, false);
      }
      this._lastMagnetNodeId = magnetResult?.nodeId || null;

      const busY = this.core.getBusBarY(this.compManager.components);
      // Use A* routing for touch preview (fast with obstacle cache)
      try {
        const router = this.wiring._getRouter();
        this.wiring.wiring.tempPath.setAttribute('d', Wire.computePath(fromPos, toPos, {
          minClearY: busY,
          router,
          sourceNodeId: this.wiring.wiring.fromNodeId
        }));
      } catch (e) {
        this.wiring.wiring.tempPath.setAttribute('d', Wire.computePath(fromPos, toPos, { minClearY: busY }));
      }
    }
  }

  _onTouchEnd(e) {
    clearTimeout(this.longPressTimer);

    // Handle toggleable component tap (only if not moved and no long-press)
    if (this.tappedComponent && !this.touchMoved && !this.longPressFired) {
      const comp = this.tappedComponent;
      if (comp.type === 'ToggleSwitch' && typeof comp.toggle === 'function') {
        comp.toggle();
      }
      this.tappedComponent = null;
    }

    // End wire control point drag
    if (this.wiring._wireEditHandler && this.wiring._wireEditHandler.isDragging) {
      this.wiring._wireEditHandler.endDrag();
      this._draggingControlPoint = false;
    }

    // End drag if active
    if (this.dragHandler.isDragging) this.dragHandler.endDrag();

    // Complete wire connection with auto-magnet
    if (this.wiring.wiring && this.wiring.wiring.tempPath) {
      const touch = e.changedTouches[0];

      // AUTO-MAGNET: Try to find the nearest connector to snap to
      const magnetResult = this._findNearestConnector(touch.clientX, touch.clientY);
      if (magnetResult) {
        const isTargetOutput = magnetResult.isOutput;
        const isSourceOutput = this.wiring.wiring.fromIsOutput;
        if (isSourceOutput && !isTargetOutput) {
          this.wiring.completeConnection(this.wiring.wiring.fromNodeId, magnetResult.nodeId);
        } else if (!isSourceOutput && isTargetOutput) {
          this.wiring.completeConnection(magnetResult.nodeId, this.wiring.wiring.fromNodeId);
        }
        this._highlightConnector(magnetResult.nodeId, false);
      } else {
        // Fallback: try elementFromPoint
        const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
        if (targetEl?.classList.contains('connector') && targetEl.dataset.node) {
          const isTargetOutput = targetEl.classList.contains('output');
          const isSourceOutput = this.wiring.wiring.fromIsOutput;
          if (isSourceOutput && !isTargetOutput) {
            this.wiring.completeConnection(this.wiring.wiring.fromNodeId, targetEl.dataset.node);
          } else if (!isSourceOutput && isTargetOutput) {
            this.wiring.completeConnection(targetEl.dataset.node, this.wiring.wiring.fromNodeId);
          }
        }
      }

      // Clear magnet highlights
      if (this._lastMagnetNodeId) {
        this._highlightConnector(this._lastMagnetNodeId, false);
        this._lastMagnetNodeId = null;
      }

      this.wiring.cancelWiring();
    }

    if (this.selection.selectionRect) this.selection.endSelection(e);
    this._cleanupTouch();
  }

  /* ========== Auto-Magnet Helper ========== */

  /**
   * Find the nearest connector to a screen point within the magnet radius.
   * Returns { nodeId, isOutput, position: {x, y} } or null.
   */
  _findNearestConnector(clientX, clientY) {
    const fromIsOutput = this.wiring.wiring?.fromIsOutput;
    const fromNodeId = this.wiring.wiring?.fromNodeId;
    let closest = null;
    let closestDist = this.MAGNET_RADIUS;

    for (const comp of this.compManager.components) {
      // Check all connectors on this component
      const allNodes = [
        ...comp.inputs.map(inp => ({ nodeId: inp.id, isOutput: false })),
        ...comp.outputs.map(out => ({ nodeId: out.id, isOutput: true }))
      ];

      for (const nodeInfo of allNodes) {
        // Skip same-direction connections (output→output, input→input)
        if (fromIsOutput === nodeInfo.isOutput) continue;
        // Skip self-connection
        if (comp.id === this.engine._findComponentByNode(fromNodeId)?.id) continue;
        // Skip already-connected inputs
        if (!nodeInfo.isOutput) {
          const inputNode = comp.inputs.find(i => i.id === nodeInfo.nodeId);
          if (inputNode?.connectedTo) continue;
        }

        try {
          const pos = this.wiring.positionCache.getPosition(nodeInfo.nodeId);
          if (!pos) continue;

          // Convert position to screen coordinates for distance check
          const rect = this.core.element.getBoundingClientRect();
          const screenX = rect.left + pos.x * this.core.scale + this.core.panOffset.x;
          const screenY = rect.top + pos.y * this.core.scale + this.core.panOffset.y;
          const dist = Math.hypot(clientX - screenX, clientY - screenY);

          if (dist < closestDist) {
            closestDist = dist;
            closest = { nodeId: nodeInfo.nodeId, isOutput: nodeInfo.isOutput, position: pos };
          }
        } catch (e) {
          // Position not available yet, skip
        }
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

  /* ========== Context Menu Builders ========== */

  _showComponentContextMenu(comp, clientX, clientY) {
    const items = [
      { label: 'Properties', action: () => this.propertyEditor.open(comp) },
      { label: 'Delete', action: () => {
        const cmd = new DeleteComponentCommand(this.engine, this.canvas, comp);
        this.undoManager.execute(cmd);
      }},
      { label: 'Select', action: () => {
        this.selection.clearSelection();
        this.selection.selectedComponents.add(comp.id);
        if (comp.element) comp.element.classList.add('selected');
      }}
    ];
    this.contextMenu.show(clientX, clientY, items);
  }

  _showWireContextMenu(wire, clientX, clientY) {
    const items = [
      { label: 'Delete Wire', action: () => {
        const cmd = new DisconnectWireCommand(this.engine, this.canvas, wire.engineId);
        this.undoManager.execute(cmd);
      }},
      { label: 'Reroute This Wire', action: () => {
        const busY = this.core.getBusBarY(this.compManager.components);
        const router = this.wiring._getRouter();
        wire.forceReroute(
          (nodeId) => this.wiring.positionCache.getPosition(nodeId),
          busY,
          router
        );
        wire.refreshControlHandles();
      }},
      { label: 'Add Control Point', action: () => {
        const canvasPos = this.core.canvasCoords(clientX, clientY);
        if (this.wiring._wireEditHandler) {
          this.wiring._wireEditHandler.addPointAtPosition(canvasPos, wire);
          this.wiring._wireEditHandler.setActiveWire(wire);
        }
      }},
      { label: 'Select Wire', action: () => {
        this.selection._clearWireSelection();
        this.selection.clearSelection();
        this.selection.selectedWires.add(wire.id);
        if (wire.element) {
          wire.element.classList.add('wire-selected');
          const visual = wire.element.querySelector('.wire-visual');
          if (visual) visual.setAttribute('stroke-width', '4');
        }
      }}
    ];
    this.contextMenu.show(clientX, clientY, items);
  }

  _showCanvasContextMenu(clientX, clientY) {
    const items = [];
    // Show paste option if clipboard has content
    if (this.selection._clipboard?.components?.length) {
      items.push({ label: 'Paste', action: () => this.selection.pasteCopied() });
    }
    items.push({ label: 'Select All', action: () => {
      this.selection.clearSelection();
      this.compManager.components.forEach(comp => {
        this.selection.selectedComponents.add(comp.id);
        if (comp.element) comp.element.classList.add('selected');
      });
    }});
    items.push({ label: 'Zoom to Fit', action: () => this.canvas.zoomToFit() });
    items.push({ label: 'Reroute All Wires', action: () => {
      this.wiring.rerouteAllWires();
    }});
    this.contextMenu.show(clientX, clientY, items);
  }
}
