/**
 * Timing Diagram Panel — visualizes signal waveforms over simulation steps.
 * Users right-click output connectors and choose "Add to Timing Diagram"
 * to monitor signals. Waveforms are rendered as SVG showing HIGH / LOW
 * transitions. The panel updates live as the simulation runs or steps.
 */
export class TimingDiagramPanel {
  constructor(container, eventBus, engine) {
    this.container = container;
    this.eventBus = eventBus;
    this.engine = engine;
    this.signals = new Map(); // nodeId -> { name, history: [] }
    this.maxHistoryLength = 200;
    this.stepWidth = 8;          // px per simulation step
    this.rowHeight = 30;         // px per signal row
    this.labelWidth = 120;       // px for signal name column
    this.paddingY = 6;           // vertical padding inside each row
    this.autoScroll = true;
    this._rafPending = false;    // requestAnimationFrame throttle flag

    this.panel = this._build();
    container.appendChild(this.panel);

    // Listen for signal add requests via the EventBus
    this.eventBus.on('add-timing-signal', (nodeId) => this.addSignal(nodeId));

    // Listen for simulation-step events (dispatched by Engine)
    document.addEventListener('simulation-step', () => this.recordSignals());

    // Also listen on the EventBus as a secondary channel
    this.eventBus.on('simulation-step', () => this.recordSignals());

    // Clear history on simulation reset
    document.addEventListener('simulation-reset', () => this.clearSignals());
  }

  /* ------------------------------------------------------------------ */
  /*  DOM Construction                                                   */
  /* ------------------------------------------------------------------ */

  _build() {
    const panel = document.createElement('div');
    panel.className = 'timing-diagram-panel';
    panel.style.cssText = `
      padding: 0; font-family: var(--font-family); font-size: 12px;
      overflow: hidden; height: 100%; color: var(--color-text);
      display: flex; flex-direction: column;
    `;

    // ── Header ──
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 12px 8px; border-bottom: 1px solid var(--color-border);
      flex-shrink: 0;
    `;

    const title = document.createElement('h3');
    title.textContent = 'Timing Diagram';
    title.style.cssText = `margin: 0; font-size: 14px; color: var(--color-accent);`;

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = `display: flex; gap: 6px; align-items: center;`;

    // Zoom controls
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.textContent = '−';
    zoomOutBtn.title = 'Zoom out';
    zoomOutBtn.className = 'toolbar-btn';
    zoomOutBtn.style.cssText = `font-size: 14px; padding: 2px 8px; min-width: 28px;`;
    zoomOutBtn.addEventListener('click', () => { this.stepWidth = Math.max(3, this.stepWidth - 2); this.render(); });

    const zoomInBtn = document.createElement('button');
    zoomInBtn.textContent = '+';
    zoomInBtn.title = 'Zoom in';
    zoomInBtn.className = 'toolbar-btn';
    zoomInBtn.style.cssText = `font-size: 14px; padding: 2px 8px; min-width: 28px;`;
    zoomInBtn.addEventListener('click', () => { this.stepWidth = Math.min(30, this.stepWidth + 2); this.render(); });

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.className = 'toolbar-btn';
    clearBtn.style.cssText = `font-size: 11px; padding: 4px 10px;`;
    clearBtn.addEventListener('click', () => this.clearSignals());

    btnGroup.appendChild(zoomOutBtn);
    btnGroup.appendChild(zoomInBtn);
    btnGroup.appendChild(clearBtn);

    header.appendChild(title);
    header.appendChild(btnGroup);
    panel.appendChild(header);

    // ── SVG container (scrollable) ──
    this.svgContainer = document.createElement('div');
    this.svgContainer.style.cssText = `
      flex: 1; overflow: auto; position: relative;
    `;

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    this.svg.style.cssText = `display: block;`;

    this.svgContainer.appendChild(this.svg);
    panel.appendChild(this.svgContainer);

    // ── Empty-state message ──
    this.emptyMsg = document.createElement('div');
    this.emptyMsg.style.cssText = `
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      color: var(--color-text-muted); text-align: center;
      pointer-events: none; padding: 20px;
    `;
    this.emptyMsg.innerHTML = `
      <p style="margin:0 0 6px; font-size:13px;">No signals monitored</p>
      <p style="margin:0; font-size:11px; opacity:0.7;">Right-click an output connector and choose<br>"Add to Timing Diagram"</p>
    `;
    this.svgContainer.appendChild(this.emptyMsg);

    return panel;
  }

  /* ------------------------------------------------------------------ */
  /*  Signal Management                                                  */
  /* ------------------------------------------------------------------ */

  addSignal(nodeId) {
    if (this.signals.has(nodeId)) return; // already monitored

    const comp = this.engine._findComponentByNode(nodeId);
    if (!comp) return;

    // Determine signal name: ComponentType.outputIndex
    const outIndex = comp.outputs.findIndex(o => o.id === nodeId);
    const compLabel = comp.constructor.label || comp.type;
    const name = outIndex >= 0
      ? `${compLabel}.O${outIndex}`
      : `${compLabel}`;

    this.signals.set(nodeId, {
      name,
      history: []
    });

    // Record current value immediately
    this._recordOne(nodeId);
    this.render();
  }

  removeSignal(nodeId) {
    this.signals.delete(nodeId);
    this.render();
  }

  clearSignals() {
    for (const sig of this.signals.values()) {
      sig.history = [];
    }
    this.render();
  }

  /* ------------------------------------------------------------------ */
  /*  Recording                                                          */
  /* ------------------------------------------------------------------ */

  recordSignals() {
    for (const nodeId of this.signals.keys()) {
      this._recordOne(nodeId);
    }
    // Trim history
    for (const sig of this.signals.values()) {
      if (sig.history.length > this.maxHistoryLength) {
        sig.history = sig.history.slice(sig.history.length - this.maxHistoryLength);
      }
    }
    this._scheduleRender();
  }

  _recordOne(nodeId) {
    const sig = this.signals.get(nodeId);
    if (!sig) return;

    const comp = this.engine._findComponentByNode(nodeId);
    if (!comp) return;

    const outNode = comp.outputs.find(o => o.id === nodeId);
    // Also handle input nodes (for output-type components like LightBulb)
    const inNode = !outNode ? comp.inputs.find(i => i.id === nodeId) : null;

    let value = false;
    if (outNode) {
      value = outNode.value === true;
    } else if (inNode) {
      value = inNode.value === true;
    }

    sig.history.push(value ? 1 : 0);
  }

  /**
   * Throttle renders with requestAnimationFrame so that rapid simulation
   * steps don't cause excessive DOM rebuilds.
   */
  _scheduleRender() {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this.render();
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Rendering                                                          */
  /* ------------------------------------------------------------------ */

  render() {
    // Toggle empty state
    this.emptyMsg.style.display = this.signals.size === 0 ? 'block' : 'none';

    const signalCount = this.signals.size;
    if (signalCount === 0) {
      this.svg.setAttribute('width', '100%');
      this.svg.setAttribute('height', '100%');
      this.svg.innerHTML = '';
      return;
    }

    // Determine the longest history to size the SVG
    let maxLen = 0;
    let hasAnyData = false;
    for (const sig of this.signals.values()) {
      if (sig.history.length > maxLen) maxLen = sig.history.length;
      if (sig.history.length > 0) hasAnyData = true;
    }

    if (!hasAnyData) {
      this.svg.setAttribute('width', '100%');
      this.svg.setAttribute('height', '100%');
      this.svg.innerHTML = '';
      return;
    }

    const headerHeight = 20;          // space for time axis labels
    const totalWidth = this.labelWidth + Math.max(maxLen, 1) * this.stepWidth + 20;
    const totalHeight = headerHeight + signalCount * this.rowHeight + 4;

    this.svg.setAttribute('width', totalWidth);
    this.svg.setAttribute('height', totalHeight);
    this.svg.innerHTML = '';

    // Background
    const bg = this._svgEl('rect', {
      x: 0, y: 0, width: totalWidth, height: totalHeight,
      fill: 'var(--color-bg)'
    });
    this.svg.appendChild(bg);

    // Time axis (step numbers along the top)
    this._drawTimeAxis(maxLen, headerHeight, totalHeight);

    // Draw each signal row
    let rowIdx = 0;
    for (const [nodeId, sig] of this.signals) {
      const yTop = headerHeight + rowIdx * this.rowHeight;
      this._drawSignalRow(nodeId, sig, yTop, maxLen, rowIdx);
      rowIdx++;
    }

    // Auto-scroll to the right edge
    if (this.autoScroll) {
      this.svgContainer.scrollLeft = this.svgContainer.scrollWidth;
    }
  }

  _drawTimeAxis(maxLen, headerHeight, totalHeight) {
    // Determine tick interval based on stepWidth
    let tickInterval = 1;
    if (this.stepWidth < 5) tickInterval = 10;
    else if (this.stepWidth < 10) tickInterval = 5;
    else if (this.stepWidth < 15) tickInterval = 2;

    for (let i = 0; i < maxLen; i += tickInterval) {
      const x = this.labelWidth + i * this.stepWidth;

      // Grid line
      const line = this._svgEl('line', {
        x1: x, y1: headerHeight,
        x2: x, y2: totalHeight,
        stroke: 'var(--color-border)',
        'stroke-width': 0.5,
        'stroke-dasharray': '2,4'
      });
      this.svg.appendChild(line);

      // Label
      const label = this._svgEl('text', {
        x: x + 2,
        y: headerHeight - 4,
        fill: 'var(--color-text-muted)',
        'font-size': 9,
        'font-family': 'var(--font-family)'
      });
      label.textContent = i;
      this.svg.appendChild(label);
    }
  }

  _drawSignalRow(nodeId, sig, yTop, maxLen, rowIdx) {
    const x0 = this.labelWidth;
    const rowH = this.rowHeight;
    const padY = this.paddingY;
    const highY = yTop + padY;                      // top line for HIGH
    const lowY  = yTop + rowH - padY;               // bottom line for LOW
    const midY  = (highY + lowY) / 2;               // label center
    const totalRowWidth = Math.max(maxLen, 1) * this.stepWidth + 20;

    // Row background (alternating)
    if (rowIdx % 2 === 1) {
      const rowBg = this._svgEl('rect', {
        x: 0, y: yTop,
        width: this.labelWidth + totalRowWidth,
        height: rowH,
        fill: 'var(--color-surface-alt)',
        opacity: 0.4
      });
      this.svg.appendChild(rowBg);
    }

    // Separator line
    const sep = this._svgEl('line', {
      x1: 0, y1: yTop + rowH,
      x2: this.labelWidth + totalRowWidth,
      y2: yTop + rowH,
      stroke: 'var(--color-border)',
      'stroke-width': 0.5
    });
    this.svg.appendChild(sep);

    // Label column separator
    const labelSep = this._svgEl('line', {
      x1: this.labelWidth, y1: yTop,
      x2: this.labelWidth, y2: yTop + rowH,
      stroke: 'var(--color-border)',
      'stroke-width': 0.5
    });
    this.svg.appendChild(labelSep);

    // Signal name label
    const label = this._svgEl('text', {
      x: 6,
      y: midY + 4,
      fill: 'var(--color-text)',
      'font-size': 11,
      'font-family': 'var(--font-family)'
    });
    // Truncate long names
    const displayName = sig.name.length > 14 ? sig.name.substring(0, 12) + '…' : sig.name;
    label.textContent = displayName;
    this.svg.appendChild(label);

    // Remove button (×)
    const removeBtn = this._svgEl('text', {
      x: this.labelWidth - 14,
      y: midY + 4,
      fill: 'var(--color-text-muted)',
      'font-size': 13,
      'font-family': 'var(--font-family)',
      cursor: 'pointer'
    });
    removeBtn.textContent = '×';
    removeBtn.style.pointerEvents = 'all';
    removeBtn.addEventListener('click', () => this.removeSignal(nodeId));
    this.svg.appendChild(removeBtn);

    // Draw waveform
    if (sig.history.length === 0) return;

    // Draw HIGH fill areas first (behind waveform lines)
    this._drawHighFill(sig, x0, highY, lowY);

    // Draw waveform lines
    const highColor = 'var(--color-success)';    // green for HIGH
    const lowColor  = 'var(--color-text-muted)'; // gray for LOW

    for (let i = 0; i < sig.history.length; i++) {
      const val = sig.history[i];
      const x1 = x0 + i * this.stepWidth;
      const x2 = x0 + (i + 1) * this.stepWidth;
      const yLevel = val ? highY : lowY;
      const color  = val ? highColor : lowColor;

      // Horizontal line for this step
      const hLine = this._svgEl('line', {
        x1: x1, y1: yLevel,
        x2: x2, y2: yLevel,
        stroke: color,
        'stroke-width': 2
      });
      this.svg.appendChild(hLine);

      // Vertical transition line at the boundary if value changed
      if (i > 0 && sig.history[i] !== sig.history[i - 1]) {
        const prevYLevel = sig.history[i - 1] ? highY : lowY;
        const vLine = this._svgEl('line', {
          x1: x1, y1: prevYLevel,
          x2: x1, y2: yLevel,
          stroke: color,
          'stroke-width': 2
        });
        this.svg.appendChild(vLine);
      }
    }
  }

  /**
   * Draw a subtle filled region under HIGH segments for visual emphasis.
   */
  _drawHighFill(sig, x0, highY, lowY) {
    if (sig.history.length === 0) return;

    let inHigh = false;
    let fillStart = 0;
    const fillY = highY;
    const fillH = lowY - highY;

    for (let i = 0; i <= sig.history.length; i++) {
      const val = i < sig.history.length ? sig.history[i] : 0;

      if (val && !inHigh) {
        fillStart = i;
        inHigh = true;
      } else if (!val && inHigh) {
        // Draw filled rectangle for this HIGH segment
        const xStart = x0 + fillStart * this.stepWidth;
        const width  = (i - fillStart) * this.stepWidth;
        const rect = this._svgEl('rect', {
          x: xStart, y: fillY,
          width: width, height: fillH,
          fill: 'var(--color-success)',
          opacity: 0.07
        });
        this.svg.appendChild(rect);
        inHigh = false;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  SVG Helper                                                         */
  /* ------------------------------------------------------------------ */

  _svgEl(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    return el;
  }
}
