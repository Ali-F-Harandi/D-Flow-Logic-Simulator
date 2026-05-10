export class Sidebar {
  constructor(container, eventBus, factory) {
    this.container = container;
    this.eventBus = eventBus;
    this.factory = factory;
    this.allTypes = [];
    this.filteredTypes = [];
    this.element = this.build();
    container.appendChild(this.element);
    this._populateAllTypes();
    this._renderComponentList();
    this._bindSearch();
    this._dragData = null;
    this._dragGhost = null;

    this.eventBus.on('toggle-sidebar', () => this.toggle());

    window.addEventListener('click', (e) => {
      if (
        this.element.classList.contains('open') &&
        !this.element.contains(e.target) &&
        !e.target.closest('.hamburger-btn')
      ) {
        this.close();
      }
    });
  }

  build() {
    const sidebar = document.createElement('aside');
    sidebar.id = 'sidebar';
    sidebar.innerHTML = `
      <div class="sidebar-header">Components</div>
      <div class="search-bar">
        <input type="text" id="sidebar-search" placeholder="Search components..." autocomplete="off">
      </div>
      <div class="component-list"></div>
    `;
    return sidebar;
  }

  _populateAllTypes() {
    this.allTypes = this.factory.getAvailableTypes();
    this.filteredTypes = [...this.allTypes];
  }

  _bindSearch() {
    const input = this.element.querySelector('#sidebar-search');
    input.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      this.filteredTypes = q === ''
        ? [...this.allTypes]
        : this.allTypes.filter(t => t.label.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
      this._renderComponentList();
    });
  }

  _renderComponentList() {
    const list = this.element.querySelector('.component-list');
    list.innerHTML = '';

    const categories = ['Gates', 'Flip-Flops', 'Chips', 'Inputs', 'Outputs', 'Other'];
    // Lucide icon names for each category
    const categoryIcons = {
      'Gates': 'zap',
      'Flip-Flops': 'refresh-cw',
      'Chips': 'cpu',
      'Inputs': 'toggle-left',
      'Outputs': 'lightbulb',
      'Other': 'wrench'
    };
    const grouped = {};
    categories.forEach(cat => (grouped[cat] = []));

    this.filteredTypes.forEach(t => {
      const cat = t.category || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(t);
    });

    Object.entries(grouped).forEach(([category, items]) => {
      if (items.length === 0) return;
      const groupDiv = document.createElement('div');
      groupDiv.className = 'component-group';

      const header = document.createElement('div');
      header.className = 'group-header';
      const iconName = categoryIcons[category] || 'box';
      header.innerHTML = `<i data-lucide="${iconName}" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px"></i>${category}`;
      header.style.cursor = 'pointer';
      
      // Collapsible groups
      const itemsDiv = document.createElement('div');
      itemsDiv.className = 'group-items';
      let collapsed = false;
      header.addEventListener('click', () => {
        collapsed = !collapsed;
        itemsDiv.style.display = collapsed ? 'none' : '';
        header.classList.toggle('collapsed', collapsed);
      });

      items.forEach(({ type, label }) => {
        const item = document.createElement('div');
        item.className = 'component-item';
        item.textContent = label;
        item.draggable = true;
        item.dataset.type = type;
        item.title = `Drag to canvas to add ${label}`;

        item.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', type);
          e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('touchstart', (e) => this._onTouchStart(e, type, label));
        item.addEventListener('touchmove', (e) => this._onTouchMove(e));
        item.addEventListener('touchend', (e) => this._onTouchEnd(e));

        itemsDiv.appendChild(item);
      });

      groupDiv.appendChild(header);
      groupDiv.appendChild(itemsDiv);
      list.appendChild(groupDiv);
    });

    // Initialize Lucide icons in the sidebar
    if (window.lucide) {
      try { window.lucide.createIcons(); } catch(e) { /* fallback */ }
    }

    if (list.children.length === 0) {
      list.innerHTML = '<div class="no-results">No components found</div>';
    }
  }

  /* ========== Touch Drag Handlers ========== */
  _onTouchStart(e, type, label) {
    if (e.touches.length > 1) return;
    const touch = e.touches[0];
    this._dragData = { type };
    this._dragGhost = document.createElement('div');
    this._dragGhost.className = 'component-item sidebar-drag-ghost';
    this._dragGhost.textContent = label;
    this._dragGhost.style.position = 'fixed';
    this._dragGhost.style.left = (touch.clientX - 50) + 'px';
    this._dragGhost.style.top = (touch.clientY - 15) + 'px';
    this._dragGhost.style.zIndex = '9999';
    this._dragGhost.style.pointerEvents = 'none';
    this._dragGhost.style.boxShadow = '0 4px 10px rgba(0,0,0,0.5)';
    document.body.appendChild(this._dragGhost);
  }

  _onTouchMove(e) {
    if (!this._dragData) return;
    e.preventDefault();
    const touch = e.touches[0];
    if (this._dragGhost) {
      this._dragGhost.style.left = (touch.clientX - 50) + 'px';
      this._dragGhost.style.top = (touch.clientY - 15) + 'px';
    }
  }

  _onTouchEnd(e) {
    if (!this._dragData) return;
    const touch = e.changedTouches[0];
    const canvas = document.getElementById('canvas-container');
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      if (
        touch.clientX >= rect.left &&
        touch.clientX <= rect.right &&
        touch.clientY >= rect.top &&
        touch.clientY <= rect.bottom
      ) {
        this.eventBus.emit('canvas-touch-drop', {
          type: this._dragData.type,
          clientX: touch.clientX,
          clientY: touch.clientY
        });
      }
    }

    if (this._dragGhost) {
      this._dragGhost.remove();
      this._dragGhost = null;
    }
    this._dragData = null;
  }

  toggle() {
    this.element.classList.toggle('open');
  }

  close() {
    this.element.classList.remove('open');
  }
}