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

document.addEventListener('DOMContentLoaded', () => {
  const appContainer = document.getElementById('app');
  const eventBus = new EventBus();
  const factory = new ComponentFactory();
  const engine = new Engine();
  const undoManager = new UndoManager();

  const header = new Header(appContainer, eventBus, engine);
  const sidebar = new Sidebar(appContainer, eventBus, factory);
  const canvas = new Canvas(appContainer, eventBus, engine, factory, undoManager);
  const toolbar = new Toolbar(appContainer, eventBus);
  const footer = new Footer(appContainer, eventBus);
  const panelManager = new PanelManager(appContainer, eventBus, engine);

  eventBus.on('component-drop', ({ type, x, y }) => {
    const comp = factory.createComponent(type);
    comp.position.x = x - 40;
    comp.position.y = y - 20;
    const cmd = new AddComponentCommand(engine, canvas, comp);
    undoManager.execute(cmd);
  });

  eventBus.on('speed-change', (speed) => engine.setSpeed(speed));
  eventBus.on('set-testbench-output', (nodeId) => {
    panelManager.testBenchPanel.setOutputNode(nodeId);
  });

  footer.setVersion('Beta-2');
});
