export class Footer {
  constructor(container, eventBus) {
    this.container = container;
    this.eventBus = eventBus;
    this.element = this.build();
    container.appendChild(this.element);
  }

  build() {
    const footer = document.createElement('footer');
    footer.id = 'footer';
    footer.innerHTML = `<span class="version"></span><span>© 2025 Logic Simulator</span>`;
    this.versionSpan = footer.querySelector('.version');
    return footer;
  }

  setVersion(ver) {
    this.versionSpan.textContent = ver;
  }
}