export class Footer {
  constructor(container, eventBus) {
    this.container = container;
    this.eventBus = eventBus;
    this.element = this.build();
    container.appendChild(this.element);
    this._statsInterval = null;
    this._simStatus = 'stopped';

    // Bind zoom control buttons
    this.element.querySelector('.footer-zoom-in')?.addEventListener('click', () => {
      this.eventBus.emit('zoom-in');
    });
    this.element.querySelector('.footer-zoom-out')?.addEventListener('click', () => {
      this.eventBus.emit('zoom-out');
    });
    this.element.querySelector('.footer-zoom-fit')?.addEventListener('click', () => {
      this.eventBus.emit('zoom-fit');
    });

    // Simulation status pill click
    this._statusPill = this.element.querySelector('.sim-status-pill');
    this._statusPill?.addEventListener('click', () => {
      if (this._simStatus === 'error') {
        this.eventBus.emit('validate-circuit');
      }
    });

    // Listen for simulation status
    this.eventBus.on('simulation-status', (status) => {
      this._simStatus = status;
      this._updateStatusPill();
    });
  }

  build() {
    const footer = document.createElement('footer');
    footer.id = 'footer';
    footer.innerHTML = `
      <span class="version"></span>
      <div class="sim-status-pill stopped" title="Simulation status — click to debug">
        <span class="sim-status-dot"></span>
        <span class="sim-status-label">Stopped</span>
      </div>
      <span class="footer-stats" id="footer-stats">0 components · 0 wires</span>
      <div class="footer-zoom-controls">
        <button class="footer-zoom-btn footer-zoom-out" title="Zoom out" aria-label="Zoom out">−</button>
        <span class="footer-zoom" id="footer-zoom">100%</span>
        <button class="footer-zoom-btn footer-zoom-in" title="Zoom in" aria-label="Zoom in">+</button>
        <button class="footer-zoom-btn footer-zoom-fit" title="Zoom to fit" aria-label="Zoom to fit">⊡</button>
      </div>
      <span class="footer-step" id="footer-step">Step: 0</span>
      <span class="autosave-indicator" id="autosave-indicator"></span>
      <span>© 2026 D-Flow</span>
    `;
    this.versionSpan = footer.querySelector('.version');
    return footer;
  }

  setVersion(ver) {
    this.versionSpan.textContent = ver;
  }

  _updateStatusPill() {
    if (!this._statusPill) return;
    this._statusPill.className = 'sim-status-pill ' + this._simStatus;
    const label = this._statusPill.querySelector('.sim-status-label');
    if (label) {
      switch (this._simStatus) {
        case 'running': label.textContent = 'Running'; break;
        case 'error': label.textContent = 'Error'; break;
        default: label.textContent = 'Stopped'; break;
      }
    }
  }

  /**
   * Update the footer with current simulation statistics.
   * @param {Object} stats - { componentCount, wireCount, stepCount, isRunning, oscillationDetected }
   * @param {number} zoomLevel - Current zoom scale (0.2 - 4.0)
   */
  updateStats(stats, zoomLevel = 1) {
    const statsEl = this.element.querySelector('#footer-stats');
    const zoomEl = this.element.querySelector('#footer-zoom');
    const stepEl = this.element.querySelector('#footer-step');

    if (statsEl && stats) {
      const parts = [];
      parts.push(`${stats.componentCount || 0} component${stats.componentCount !== 1 ? 's' : ''}`);
      parts.push(`${stats.wireCount || 0} wire${stats.wireCount !== 1 ? 's' : ''}`);
      if (stats.oscillationDetected) {
        parts.push('⚠ Oscillation');
      }
      statsEl.textContent = parts.join(' · ');
    }

    if (zoomEl && zoomLevel !== undefined) {
      zoomEl.textContent = `${Math.round(zoomLevel * 100)}%`;
    }

    if (stepEl && stats) {
      stepEl.textContent = `Step: ${stats.stepCount || 0}`;
    }
  }
}
