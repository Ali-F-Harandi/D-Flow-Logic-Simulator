import { EventBus } from './utils/EventBus.js';
import { Header } from './ui/Header.js';
import { Sidebar } from './ui/Sidebar.js';
import { Canvas } from './ui/Canvas.js';
import { Toolbar } from './ui/Toolbar.js';
import { Footer } from './ui/Footer.js';
import { PanelManager } from './ui/PanelManager.js';
import { ComponentFactory } from './core/ComponentFactory.js';
import { Engine } from './core/Engine.js';
import { UndoManager, AddComponentCommand } from './utils/UndoManager.js';
import { Serializer } from './utils/Serializer.js';

document.addEventListener('DOMContentLoaded', () => {
  const appContainer = document.getElementById('app');
  const eventBus = new EventBus();
  const factory = new ComponentFactory();
  const engine = new Engine();
  const undoManager = new UndoManager();

  const header = new Header(appContainer, eventBus, engine, null);
  const sidebar = new Sidebar(appContainer, eventBus, factory);
  const canvas = new Canvas(appContainer, eventBus, engine, factory, undoManager);
  header.canvas = canvas;
  header.setFactory(factory);

  const toolbar = new Toolbar(appContainer, eventBus);
  const footer = new Footer(appContainer, eventBus);
  const panelManager = new PanelManager(appContainer, eventBus, engine);

  eventBus.on('component-drop', ({ type, x, y }) => {
    const comp = factory.createComponent(type);
    comp.position.x = x;
    comp.position.y = y;
    const cmd = new AddComponentCommand(engine, canvas, comp);
    undoManager.execute(cmd);
  });

  eventBus.on('speed-change', (speed) => engine.setSpeed(speed));
  eventBus.on('set-testbench-output', (nodeId) => {
    panelManager.testBenchPanel.setOutputNode(nodeId);
  });

  footer.setVersion('Beta-4');

  // Auto‑restore saved project
  const saved = localStorage.getItem('logic-sim-project');
  if (saved) {
    const restore = confirm('A saved project was found. Do you want to restore it?');
    if (restore) {
      try {
        const data = JSON.parse(saved);
        Serializer.importState(data, engine, canvas, factory);
        canvas.showToast('Project restored from auto-save', 'info');
      } catch (err) {
        console.error('Failed to restore project.', err);
        canvas.showToast('Failed to restore project', 'error');
      }
    }
  }
});
