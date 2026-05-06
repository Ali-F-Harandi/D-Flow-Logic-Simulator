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

    // Toggle on event
    this.eventBus.on('toggle-sidebar', () => this.toggle());

    // Close sidebar when clicking outside (mobile overlay)
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
      if (q === '') {
        this.filteredTypes = [...this.allTypes];
      } else {
        this.filteredTypes = this.allTypes.filter(t =>
          t.label.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
        );
      }
      this._renderComponentList();
    });
  }

  _renderComponentList() {
    const list = this.element.querySelector('.component-list');
    list.innerHTML = '';

    const categories = ['Gates', 'Flip-Flops', 'Inputs', 'Outputs', 'Other'];
    const grouped = {};
    categories.forEach(cat => grouped[cat] = []);

    this.filteredTypes.forEach(t => {
      const cat = t.category || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(t);
    });

    for (const cat in grouped) {
      if (grouped[cat].length === 0) delete grouped[cat];
    }

    Object.entries(grouped).forEach(([category, items]) => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'component-group';

      const header = document.createElement('div');
      header.className = 'group-header';
      header.textContent = category;
      groupDiv.appendChild(header);

      const itemsDiv = document.createElement('div');
      itemsDiv.className = 'group-items';

      items.forEach(({ type, label }) => {
        const item = document.createElement('div');
        item.className = 'component-item';
        item.textContent = label;
        item.draggable = true;
        item.dataset.type = type;
        item.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', type);
          e.dataTransfer.effectAllowed = 'move';
        });
        itemsDiv.appendChild(item);
      });

      groupDiv.appendChild(itemsDiv);
      list.appendChild(groupDiv);
    });

    if (list.children.length === 0) {
      list.innerHTML = '<div class="no-results">No components found</div>';
    }
  }

  toggle() {
    this.element.classList.toggle('open');
  }

  close() {
    this.element.classList.remove('open');
  }
}