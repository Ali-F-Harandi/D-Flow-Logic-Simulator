/**
 * WireTooltip.js — Feature 7: Wire Value Tooltip
 *
 * Creates a positioned DOM div tooltip that shows wire signal value
 * and connection info when hovering over a wire.
 *
 * Usage:
 *   const tooltip = new WireTooltip();
 *   tooltip.show(wire, clientX, clientY);
 *   tooltip.hide();
 *
 * The tooltip auto-hides after 5 seconds.
 */

export class WireTooltip {
  constructor() {
    /** @type {HTMLElement|null} */
    this._element = null;
    /** @type {number|null} */
    this._autoHideTimer = null;

    this._createElement();
  }

  /**
   * Create the tooltip DOM element (hidden by default).
   */
  _createElement() {
    const el = document.createElement('div');
    el.className = 'wire-tooltip';
    el.style.display = 'none';
    el.setAttribute('role', 'tooltip');
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    this._element = el;
  }

  /**
   * Show the tooltip for a wire at the given screen coordinates.
   *
   * @param {Wire} wire – The wire object to display info for
   * @param {number} clientX – Mouse X position (viewport coordinates)
   * @param {number} clientY – Mouse Y position (viewport coordinates)
   * @param {Object} [opts] – Additional options
   * @param {Function} [opts.compLookup] – (nodeId) => Component for source/target info
   */
  show(wire, clientX, clientY, opts = {}) {
    if (!this._element) return;

    // Clear any existing auto-hide timer
    if (this._autoHideTimer) {
      clearTimeout(this._autoHideTimer);
      this._autoHideTimer = null;
    }

    // ── Build tooltip content ──
    const signalState = this._getSignalState(wire);
    const sourceInfo = this._getNodeInfo(wire.sourceNode.nodeId, opts.compLookup, 'Source');
    const targetInfo = this._getNodeInfo(wire.targetNode.nodeId, opts.compLookup, 'Target');
    const routingInfo = this._getRoutingInfo(wire);

    this._element.innerHTML = `
      <div class="wire-tooltip-header">
        <span class="wire-tooltip-id">${wire.id}</span>
        <span class="wire-tooltip-signal wire-tooltip-signal-${signalState.class}">${signalState.label}</span>
      </div>
      <div class="wire-tooltip-body">
        <div class="wire-tooltip-row">
          <span class="wire-tooltip-label">Source:</span>
          <span class="wire-tooltip-value">${sourceInfo}</span>
        </div>
        <div class="wire-tooltip-row">
          <span class="wire-tooltip-label">Target:</span>
          <span class="wire-tooltip-value">${targetInfo}</span>
        </div>
        <div class="wire-tooltip-row">
          <span class="wire-tooltip-label">Routing:</span>
          <span class="wire-tooltip-value">${routingInfo}</span>
        </div>
      </div>
    `;

    // ── Position the tooltip ──
    // Offset 12px to the right and 12px below cursor to avoid obscuring the wire
    const offset = 12;
    let left = clientX + offset;
    let top = clientY + offset;

    // Make visible first to measure dimensions
    this._element.style.display = 'block';
    this._element.setAttribute('aria-hidden', 'false');

    const rect = this._element.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    // Adjust if tooltip overflows the viewport
    if (left + rect.width > viewportW - 8) {
      left = clientX - rect.width - offset;
    }
    if (top + rect.height > viewportH - 8) {
      top = clientY - rect.height - offset;
    }
    // Ensure minimum left/top
    left = Math.max(8, left);
    top = Math.max(8, top);

    this._element.style.left = `${left}px`;
    this._element.style.top = `${top}px`;

    // ── Auto-hide after 5 seconds ──
    this._autoHideTimer = setTimeout(() => {
      this.hide();
    }, 5000);
  }

  /**
   * Hide the tooltip.
   */
  hide() {
    if (this._autoHideTimer) {
      clearTimeout(this._autoHideTimer);
      this._autoHideTimer = null;
    }
    if (this._element) {
      this._element.style.display = 'none';
      this._element.setAttribute('aria-hidden', 'true');
    }
  }

  /**
   * Determine the signal state label and CSS class for a wire.
   *
   * @param {Wire} wire
   * @returns {{label: string, class: string}}
   */
  _getSignalState(wire) {
    // Check the source output value
    if (wire._lastSourceValue === true) {
      return { label: 'HIGH', class: 'high' };
    }
    if (wire._lastSourceValue === false) {
      return { label: 'LOW', class: 'low' };
    }

    // Try to determine from the wire's visual state
    if (wire.element) {
      const visualPath = wire.element.querySelector('.wire-visual');
      if (visualPath) {
        const stroke = visualPath.getAttribute('stroke');
        if (stroke) {
          const style = getComputedStyle(document.documentElement);
          const highColor = style.getPropertyValue('--wire-high-color').trim();
          if (stroke === highColor || stroke.includes('0, 204, 102') || stroke.includes('#00cc66')) {
            return { label: 'HIGH', class: 'high' };
          }
        }
      }
    }

    return { label: 'Unknown', class: 'unknown' };
  }

  /**
   * Get a human-readable description of a node (source or target).
   *
   * @param {string} nodeId
   * @param {Function} [compLookup]
   * @param {string} [defaultLabel]
   * @returns {string}
   */
  _getNodeInfo(nodeId, compLookup, defaultLabel = '') {
    if (!nodeId) return defaultLabel;

    // Parse the node ID: "compId.input.index" or "compId.output.index"
    const parts = nodeId.split('.');
    if (parts.length >= 3) {
      const compId = parts[0];
      const type = parts[1]; // 'input' or 'output'
      const index = parts[2];

      // Try to get component type from compLookup
      let compType = '';
      if (compLookup) {
        const comp = compLookup(nodeId);
        if (comp) {
          compType = ` (${comp.type})`;
        }
      }

      const pinLabel = type === 'output' ? 'Out' : 'In';
      return `${compId}${compType} ${pinLabel}[${index}]`;
    }

    return nodeId;
  }

  /**
   * Get routing info string for a wire.
   *
   * @param {Wire} wire
   * @returns {string}
   */
  _getRoutingInfo(wire) {
    const wpCount = wire.waypoints ? wire.waypoints.length : 0;
    if (wpCount > 0) {
      return `Bézier (${wpCount} waypoint${wpCount > 1 ? 's' : ''})`;
    }
    return 'Bézier (auto)';
  }

  /**
   * Destroy the tooltip and clean up.
   */
  destroy() {
    this.hide();
    if (this._element && this._element.parentNode) {
      this._element.parentNode.removeChild(this._element);
    }
    this._element = null;
  }
}
