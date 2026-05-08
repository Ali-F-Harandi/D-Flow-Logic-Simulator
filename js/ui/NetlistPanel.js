/**
 * Circuit Netlist / Connection List View.
 * Shows all connections in text form for debugging complex circuits.
 * Format: "ComponentType_ID.output.N → ComponentType_ID.input.N"
 */
export class NetlistPanel {
  constructor(container, eventBus, engine) {
    this.container = container;
    this.eventBus = eventBus;
    this.engine = engine;
    this.panel = null;
    this._createDOM();

    // Auto-refresh when circuit changes
    this.eventBus.on('component-created', () => this.refresh());
    this.eventBus.on('component-modified', () => this.refresh());
    this.eventBus.on('component-drop', () => this.refresh());

    // Listen for wire changes
    document.addEventListener('wire-removed', () => this.refresh());
  }

  _createDOM() {
    this.panel = document.createElement('div');
    this.panel.className = 'netlist-panel';
    this.panel.style.cssText = `
      padding: 10px; font-family: monospace; font-size: 12px;
      overflow-y: auto; height: 100%; color: var(--color-text);
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 10px; padding-bottom: 8px;
      border-bottom: 1px solid var(--color-border);
    `;

    const title = document.createElement('h3');
    title.textContent = 'Circuit Netlist';
    title.style.cssText = `
      margin: 0; font-size: 14px; color: var(--color-accent);
    `;

    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = 'Refresh';
    refreshBtn.className = 'toolbar-btn';
    refreshBtn.style.fontSize = '11px';
    refreshBtn.addEventListener('click', () => this.refresh());

    header.appendChild(title);
    header.appendChild(refreshBtn);
    this.panel.appendChild(header);

    this.content = document.createElement('div');
    this.content.className = 'netlist-content';
    this.panel.appendChild(this.content);

    this.container.appendChild(this.panel);
  }

  refresh() {
    if (!this.content) return;

    const components = this.engine.components;
    const wires = this.engine.wires;

    // Build netlist
    let html = '';

    // Components summary
    html += `<div class="netlist-section">`;
    html += `<div class="netlist-section-title">Components (${components.size})</div>`;
    for (const comp of components.values()) {
      const label = comp.constructor.label || comp.type;
      const inCount = comp.inputs.length;
      const outCount = comp.outputs.length;
      const posStr = `@${comp.position.x},${comp.position.y}`;
      html += `<div class="netlist-item">`;
      html += `<span class="netlist-comp-type">${label}</span>`;
      html += `<span class="netlist-comp-id"> ${this._shortId(comp.id)}</span>`;
      html += `<span class="netlist-comp-meta"> ${inCount}in/${outCount}out ${posStr}</span>`;
      html += `</div>`;
    }
    html += `</div>`;

    // Connections
    html += `<div class="netlist-section">`;
    html += `<div class="netlist-section-title">Connections (${wires.length})</div>`;
    if (wires.length === 0) {
      html += `<div class="netlist-empty">No connections</div>`;
    } else {
      for (const wire of wires) {
        const fromComp = components.get(wire.from.componentId);
        const toComp = components.get(wire.to.componentId);
        if (!fromComp || !toComp) continue;

        const fromLabel = fromComp.constructor.label || fromComp.type;
        const toLabel = toComp.constructor.label || toComp.type;
        const fromShortId = this._shortId(fromComp.id);
        const toShortId = this._shortId(toComp.id);

        // Find output index
        const outIdx = fromComp.outputs.findIndex(o => o.id === wire.from.nodeId);
        const inIdx = toComp.inputs.findIndex(i => i.id === wire.to.nodeId);

        // Get signal state
        const outNode = fromComp.outputs[outIdx];
        const signalStr = outNode?.value === true ? 'HIGH' : outNode?.value === null ? 'Z' : 'LOW';
        const signalClass = outNode?.value === true ? 'netlist-high' : outNode?.value === null ? 'netlist-z' : 'netlist-low';

        html += `<div class="netlist-item netlist-connection">`;
        html += `<span class="netlist-from">${fromLabel}_${fromShortId}.O${outIdx}</span>`;
        html += `<span class="netlist-arrow"> &rarr; </span>`;
        html += `<span class="netlist-to">${toLabel}_${toShortId}.I${inIdx}</span>`;
        html += `<span class="netlist-signal ${signalClass}"> ${signalStr}</span>`;
        html += `</div>`;
      }
    }
    html += `</div>`;

    // Unconnected inputs
    html += `<div class="netlist-section">`;
    let unconnectedCount = 0;
    let unconnectedHtml = '';
    for (const comp of components.values()) {
      for (const inp of comp.inputs) {
        if (!inp.connectedTo) {
          const label = comp.constructor.label || comp.type;
          const inIdx = comp.inputs.indexOf(inp);
          unconnectedHtml += `<div class="netlist-item netlist-unconnected">`;
          unconnectedHtml += `<span>${label}_${this._shortId(comp.id)}.I${inIdx}</span>`;
          unconnectedHtml += `<span class="netlist-float"> FLOATING</span>`;
          unconnectedHtml += `</div>`;
          unconnectedCount++;
        }
      }
    }
    html += `<div class="netlist-section-title">Unconnected Inputs (${unconnectedCount})</div>`;
    html += unconnectedCount > 0 ? unconnectedHtml : `<div class="netlist-empty">All inputs connected</div>`;
    html += `</div>`;

    this.content.innerHTML = html;
  }

  _shortId(id) {
    // Show a shorter version of the component ID for readability
    if (!id) return '?';
    const parts = id.split('_');
    // Take first 4 chars of the unique suffix
    if (parts.length >= 2) {
      return parts[parts.length - 1].substring(0, 4);
    }
    return id.substring(0, 6);
  }
}
