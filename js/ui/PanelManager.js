import { TruthTablePanel } from './TruthTablePanel.js';
import { TestBenchPanel } from './TestBenchPanel.js';

export class PanelManager {
  constructor(container, eventBus, engine) {
    this.container = container;
    this.eventBus = eventBus;
    this.engine = engine;
    this.sidebarWidth = 250;
    this.isResizing = false;
    this.rightPanelOpen = false;
    this.activePanel = null;

    this.createRightPanel();
    this.createSplitter();
    this.setupResize();

    // Initialize sub-panels
    this.truthPanel = new TruthTablePanel(this.rightPanel, eventBus, engine);
    this.testBenchPanel = new TestBenchPanel(this.rightPanel, eventBus, engine);

    this.truthPanel.panel.style.display = 'none';
    this.testBenchPanel.panel.style.display = 'none';

    this.eventBus.on('toggle-right-panel', (width) => {
      this.toggleRightPanel(width);
    });
    this.eventBus.on('show-panel', (type) => {
      this.showPanel(type);
    });
    this.eventBus.on('set-testbench-output', (nodeId) => {
      this.testBenchPanel.setOutputNode(nodeId);
    });

    // Close right panel when clicking outside (overlay behavior)
    document.addEventListener('click', (e) => {
      if (
        this.rightPanelOpen &&
        !this.rightPanel.contains(e.target) &&
        !e.target.closest('#toolbar button') &&
        !e.target.closest('.connector')
      ) {
        this.toggleRightPanel('0px');
      }
    }, true);
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
  }

  showPanel(type) {
    this.truthPanel.panel.style.display = 'none';
    this.testBenchPanel.panel.style.display = 'none';
    if (type === 'truth') {
      this.truthPanel.panel.style.display = 'block';
    } else if (type === 'testbench') {
      this.testBenchPanel.panel.style.display = 'block';
    }
    if (!this.rightPanelOpen) {
      this.toggleRightPanel('300px');
    }
  }
}
