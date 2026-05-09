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
import { HelpOverlay } from './ui/HelpOverlay.js';

// --------------------------------------------------
// GLOBAL ERROR HANDLER – shows any import/parse error
// --------------------------------------------------
window.addEventListener('error', (event) => {
  console.error('Global error caught:', event.error);
  const div = document.createElement('div');
  div.style.position = 'fixed'; div.style.top = '0'; div.style.left = '0';
  div.style.right = '0';
  div.style.background = 'red'; div.style.color = 'white';
  div.style.padding = '10px'; div.style.zIndex = '99999';
  div.textContent = 'Error: ' + (event.error ? event.error.message : event.message);
  document.body.appendChild(div);
});

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
  const panelManager = new PanelManager(appContainer, eventBus, engine, canvas, undoManager);

  // Initialize keyboard shortcut help overlay
  new HelpOverlay();

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

  footer.setVersion('v0.9-pre');

  // FIX (Bug #8 Medium): Stop engine and clear clock intervals
  // on page unload to prevent issues with auto-save and pending timers.
  window.addEventListener('beforeunload', () => {
    engine.stop();
  });

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
