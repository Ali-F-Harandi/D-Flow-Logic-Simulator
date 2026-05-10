export class Footer {
  constructor(container, eventBus) {
    this.container = container;
    this.eventBus = eventBus;
    this.element = this.build();
    container.appendChild(this.element);
    this._statsInterval = null;
  }

  build() {
    const footer = document.createElement('footer');
    footer.id = 'footer';
    footer.innerHTML = `
      <span class="version"></span>
      <span class="footer-stats" id="footer-stats">0 components · 0 wires</span>
      <span class="footer-zoom" id="footer-zoom">100%</span>
      <span class="footer-step" id="footer-step">Step: 0</span>
      <span>© 2026 D-Flow Logic Simulator</span>
    `;
    this.versionSpan = footer.querySelector('.version');
    return footer;
  }

  setVersion(ver) {
    this.versionSpan.textContent = ver;
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
