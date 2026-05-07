export class ContextMenu {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.menu = null;
    this._createDOM();
    this._bindGlobal();
  }

  _createDOM() {
    this.menu = document.createElement('div');
    this.menu.id = 'context-menu';
    this.menu.style.position = 'fixed';
    this.menu.style.background = 'var(--color-surface)';
    this.menu.style.border = '1px solid var(--color-border)';
    this.menu.style.borderRadius = '4px';
    this.menu.style.boxShadow = 'var(--shadow-md)';
    this.menu.style.zIndex = 'var(--z-context-menu)';   // <-- changed
    this.menu.style.display = 'none';
    document.body.appendChild(this.menu);
  }

  _bindGlobal() {
    document.addEventListener('click', () => this.hide());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
    });
  }

  show(x, y, items) {
    this.menu.innerHTML = '';
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'context-menu-item';
      div.textContent = item.label;
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        item.action();
        this.hide();
      });
      this.menu.appendChild(div);
    });
    this.menu.style.left = `${x}px`;
    this.menu.style.top = `${y}px`;
    this.menu.style.display = 'block';
  }

  hide() {
    if (this.menu) this.menu.style.display = 'none';
  }
}