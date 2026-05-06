export class TruthTablePanel {
  constructor(container, eventBus, engine) {
    this.container = container;
    this.eventBus = eventBus;
    this.engine = engine;
    this.panel = document.createElement('div');
    this.panel.className = 'truth-table-panel';
    this.panel.style.padding = '10px';
    this.panel.style.color = 'var(--color-text)';
    this.panel.style.fontSize = '12px';
    this.panel.innerHTML = '<h4>Truth Table</h4><div class="tt-content"></div>';
    container.appendChild(this.panel);

    this.content = this.panel.querySelector('.tt-content');
    this.eventBus.on('generate-truth-table', (outputNodeId) => this.generate(outputNodeId));
  }

  generate(outputNodeId) {
    // Gather all DipSwitch / DipSwitch8 components (inputs)
    const inputComponents = [];
    for (const comp of this.engine.components.values()) {
      if (comp.type === 'DipSwitch' || comp.type === 'DipSwitch8') {
        inputComponents.push(comp);
      }
    }
    if (inputComponents.length === 0) {
      this.content.innerHTML = 'No input switches found.';
      return;
    }

    // --- SNAPSHOT original values ---
    const componentSnapshots = new Map(); // compId -> { outputs: [...], inputs: [...] }
    for (const comp of this.engine.components.values()) {
      componentSnapshots.set(comp.id, {
        outputs: comp.outputs.map(o => o.value),
        inputs: comp.inputs.map(i => i.value)
      });
    }

    // Build list of inputs with bits
    const inputs = [];
    let totalBits = 0;
    for (const comp of inputComponents) {
      if (comp.type === 'DipSwitch') {
        inputs.push({ comp, bits: [0] });
        totalBits++;
      } else if (comp.type === 'DipSwitch8') {
        const bits = [0,1,2,3,4,5,6,7];
        inputs.push({ comp, bits });
        totalBits += bits.length;
      }
    }
    const combos = 1 << totalBits;

    let html = '<table class="tt-table">';
    // Header row
    html += '<tr>';
    for (const inp of inputs) {
      if (inp.comp.type === 'DipSwitch8') {
        for (let b = 7; b >= 0; b--) html += `<th>${inp.comp.id}.${b}</th>`;
      } else {
        html += `<th>${inp.comp.id}</th>`;
      }
    }
    html += `<th>OUT</th></tr>`;

    // Simulate each combination
    for (let c = 0; c < combos; c++) {
      let bitIdx = 0;
      for (const inp of inputs) {
        for (const b of inp.bits) {
          const val = (c >> bitIdx) & 1;
          if (inp.comp.type === 'DipSwitch') {
            inp.comp.outputs[0].value = !!val;
            inp.comp._updateAppearance?.();
          } else if (inp.comp.type === 'DipSwitch8') {
            inp.comp.outputs[b].value = !!val;
            inp.comp._updateVisual?.();
          }
          bitIdx++;
        }
      }
      // Propagate
      this.engine.step();
      // Read output
      const outComp = this.engine._findComponentByNode(outputNodeId);
      const outVal = outComp?.outputs.find(o => o.id === outputNodeId)?.value;
      // Build row
      html += '<tr>';
      bitIdx = 0;
      for (const inp of inputs) {
        for (const b of inp.bits) {
          const val = (c >> bitIdx) & 1;
          html += `<td>${val}</td>`;
          bitIdx++;
        }
      }
      html += `<td>${outVal ? '1' : '0'}</td></tr>`;
    }

    // --- RESTORE original state ---
    for (const [compId, snap] of componentSnapshots) {
      const comp = this.engine.components.get(compId);
      if (comp) {
        for (let i = 0; i < snap.outputs.length; i++) {
          comp.outputs[i].value = snap.outputs[i];
        }
        for (let i = 0; i < snap.inputs.length; i++) {
          comp.inputs[i].value = snap.inputs[i];
        }
        // Re-render visual state
        comp._updateAppearance?.();
        comp._updateVisual?.();
        comp._updateDisplay?.();
      }
    }

    // --- FORCE engine to process the restored state ---
    this.engine.step();
    this.engine._processQueue();
    if (this.engine.onUpdate) this.engine.onUpdate();

    this.content.innerHTML = html + '</table>';
  }
}