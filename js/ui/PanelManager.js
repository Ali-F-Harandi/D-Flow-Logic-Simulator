import { NetlistPanel } from './NetlistPanel.js';
import { PropertiesPanel } from './PropertiesPanel.js';

export class PanelManager {
  constructor(container, eventBus, engine, canvas, undoManager) {
    this.container = container;
    this.eventBus = eventBus;
    this.engine = engine;
    this.canvas = canvas;
    this.undoManager = undoManager;
    this.sidebarWidth = 250;
    this.isResizing = false;
    this.rightPanelOpen = false;
    this.activePanel = null;

    this.createRightPanel();
    this.createSplitter();
    this.setupResize();

    this.netlistPanel = new NetlistPanel(this.rightPanel, eventBus, engine);
    this.propertiesPanel = new PropertiesPanel(this.rightPanel, eventBus, engine, canvas, undoManager);

    this.netlistPanel.panel.style.display = 'none';

    this.eventBus.on('toggle-right-panel', (width) => {
      this.toggleRightPanel(width);
    });
    this.eventBus.on('show-panel', (type) => {
      this.showPanel(type);
    });

    // Listen for selection changes to show Properties panel
    this.eventBus.on('selection-changed', ({ components, wires }) => {
      // Only show properties panel if exactly one component or one wire is selected
      if (components.length === 1 && wires.length === 0) {
        const comp = this.canvas.compManager.getComponentById(components[0]);
        if (comp) {
          this.propertiesPanel.showComponent(comp);
          this.showPanel('properties');
        }
      } else if (wires.length === 1 && components.length === 0) {
        const wire = this.canvas.wiring.wires.find(w => w.id === wires[0]);
        if (wire) {
          this.propertiesPanel.showWire(wire);
          this.showPanel('properties');
        }
      } else if (components.length === 0 && wires.length === 0) {
        this.propertiesPanel.hide();
      }
    });

    // M-16: Conditional click listener — only active when panel is open
    this._outsideClickHandler = (e) => {
      if (
        this.rightPanelOpen &&
        !this.rightPanel.contains(e.target) &&
        !e.target.closest('#toolbar button') &&
        !e.target.closest('.connector') &&
        !e.target.closest('#canvas-container') &&
        !e.target.closest('#header')
      ) {
        this.toggleRightPanel('0px');
      }
    };
  }

  createRightPanel() {
    this.rightPanel = document.createElement('div');
    this.rightPanel.id = 'right-panel';
    this.container.appendChild(this.rightPanel);
  }

  createSplitter() {
    this.splitter = document.createElement('div');
    this.splitter.id = 'splitter';
    this.container.appendChild(this.splitter);
  }

  setupResize() {
    this.splitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.isResizing = true;
      document.body.style.cursor = 'col-resize';
      this.splitter.classList.add('active');
      this.startX = e.clientX;
      this.startWidth = this.sidebarWidth;

      const onMouseMove = (e) => {
        if (!this.isResizing) return;
        const delta = e.clientX - this.startX;
        let newWidth = this.startWidth + delta;
        newWidth = Math.max(150, Math.min(500, newWidth));
        this.sidebarWidth = newWidth;
        this.container.style.setProperty('--sidebar-width', `${newWidth}px`);
      };

      const onMouseUp = () => {
        this.isResizing = false;
        document.body.style.cursor = '';
        this.splitter.classList.remove('active');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  toggleRightPanel(width) {
    if (width === undefined) {
      this.container.style.setProperty('--right-panel-width',
        this.rightPanelOpen ? '0px' : '300px');
      this.rightPanelOpen = !this.rightPanelOpen;
    } else {
      this.container.style.setProperty('--right-panel-width', width);
      this.rightPanelOpen = width !== '0px';
    }
    if (this.rightPanel) {
      this.rightPanel.classList.toggle('open', this.rightPanelOpen);
    }
    // M-16: Add/remove document click listener based on panel state
    if (this.rightPanelOpen) {
      document.addEventListener('click', this._outsideClickHandler, false);
    } else {
      document.removeEventListener('click', this._outsideClickHandler, false);
    }
  }

  showPanel(type) {
    this.netlistPanel.panel.style.display = 'none';
    this.propertiesPanel.hide();
    if (type === 'netlist') {
      this.netlistPanel.panel.style.display = 'block';
      this.netlistPanel.refresh();
    } else if (type === 'properties') {
      // Properties panel manages its own visibility
    }
    if (!this.rightPanelOpen) {
      this.toggleRightPanel('300px');
    } else {
      // Panel already open — ensure click listener is active
      document.addEventListener('click', this._outsideClickHandler, false);
    }
  }
}
