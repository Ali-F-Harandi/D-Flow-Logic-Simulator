export class TestBenchPanel {
  constructor(container, eventBus, engine) {
    this.container = container;
    this.eventBus = eventBus;
    this.engine = engine;
    this.panel = document.createElement('div');
    this.panel.className = 'test-bench-panel';
    this.panel.style.padding = '10px';
    this.panel.style.color = 'var(--color-text)';
    this.panel.style.fontSize = '12px';
    this.panel.innerHTML = `
      <h4>Test Bench</h4>
      <div class="tb-controls">
        <button id="tb-step">Step</button>
        <button id="tb-reset">Reset</button>
        <span class="tb-output-node" id="tb-node-label">No output selected</span>
      </div>
      <div class="tb-output"></div>
    `;
    container.appendChild(this.panel);

    this.outputDiv = this.panel.querySelector('.tb-output');
    this.nodeLabel = this.panel.querySelector('#tb-node-label');
    this.panel.querySelector('#tb-step').addEventListener('click', () => this.step());
    this.panel.querySelector('#tb-reset').addEventListener('click', () => this.reset());

    this.stepCount = 0;
    this.history = [];
    this.selectedOutput = null;
    this.eventBus.on('set-testbench-output', (nodeId) => this.setOutputNode(nodeId));
  }

  step() {
    this.engine.step();
    this.stepCount++;
    if (this.selectedOutput) {
      const comp = this.engine._findComponentByNode(this.selectedOutput);
      const val = comp?.outputs.find(o => o.id === this.selectedOutput)?.value ? '1' : '0';
      this.history.push(`Step ${this.stepCount}: ${val}`);
      this.outputDiv.innerHTML = this.history.join('<br>');
    }
  }

  reset() {
    this.engine.reset();
    this.stepCount = 0;
    this.history = [];
    this.outputDiv.innerHTML = '';
  }

  setOutputNode(nodeId) {
    this.selectedOutput = nodeId;
    this.nodeLabel.textContent = `Output: ${nodeId}`;
    this.reset();
  }
}