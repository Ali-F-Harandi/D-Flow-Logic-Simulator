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

    const inputs = [];
    let totalBits = 0;
    for (const comp of inputComponents) {
      if (comp.type === 'DipSwitch') {
        inputs.push({ comp, bits: [0] });
        totalBits++;
      } else if (comp.type === 'DipSwitch8') {
        inputs.push({ comp, bits: [0,1,2,3,4,5,6,7] });
        totalBits += 8;
      }
    }

    if (totalBits > 12) {
      this.content.innerHTML = `<div style="color: var(--color-danger); padding: 10px;">
        Too many input bits (${totalBits}). Maximum allowed is 12 to prevent browser freezing.
      </div>`;
      return;
    }

    const combos = 1 << totalBits;

    const componentSnapshots = new Map();
    for (const comp of this.engine.components.values()) {
      const internal = {};
      if (comp._prevClk !== undefined) internal._prevClk = comp._prevClk;
      if (comp._state !== undefined) {
        internal._state = Array.isArray(comp._state) ? [...comp._state] : { ...comp._state };
      }
      componentSnapshots.set(comp.id, {
        outputs: comp.outputs.map(o => o.value),
        inputs: comp.inputs.map(i => i.value),
        internal
      });
    }

    let html = '<table class="tt-table">';
    html += '<tr>';
    for (const inp of inputs) {
      if (inp.comp.type === 'DipSwitch8') {
        for (let b = 7; b >= 0; b--) html += `<th>${inp.comp.id}.${b}</th>`;
      } else {
        html += `<th>${inp.comp.id}</th>`;
      }
    }
    html += `<th>OUT</th></tr>`;

    for (let c = 0; c < combos; c++) {
      let bitIdx = 0;
      for (const inp of inputs) {
        for (const b of inp.bits) {
          const val = (c >> bitIdx) & 1;
          inp.comp.outputs[b !== undefined ? b : 0].value = !!val;
          if (typeof inp.comp._updateAppearance === 'function') inp.comp._updateAppearance();
          if (typeof inp.comp._updateConnectorStates === 'function') inp.comp._updateConnectorStates();
          bitIdx++;
        }
      }
      this.engine._processQueue();
      const outComp = this.engine._findComponentByNode(outputNodeId);
      const outVal = outComp?.outputs.find(o => o.id === outputNodeId)?.value;
      html += '<tr>';
      bitIdx = 0;
      for (const inp of inputs) {
        // FIX (critical): For DipSwitch8, display values in MSB→LSB order
        if (inp.comp.type === 'DipSwitch8') {
          for (let b = 7; b >= 0; b--) {
            const val = (c >> b) & 1;
            html += `<td>${val}</td>`;
          }
          bitIdx += 8;
        } else {
          for (const b of inp.bits) {
            const val = (c >> bitIdx) & 1;
            html += `<td>${val}</td>`;
            bitIdx++;
          }
        }
      }
      html += `<td>${outVal ? '1' : '0'}</td></tr>`;
    }

    for (const [compId, snap] of componentSnapshots) {
      const comp = this.engine.components.get(compId);
      if (comp) {
        for (let i = 0; i < snap.outputs.length; i++) {
          comp.outputs[i].value = snap.outputs[i];
        }
        for (let i = 0; i < snap.inputs.length; i++) {
          comp.inputs[i].value = snap.inputs[i];
        }
        if (snap.internal._prevClk !== undefined) comp._prevClk = snap.internal._prevClk;
        if (snap.internal._state !== undefined) {
          if (Array.isArray(snap.internal._state)) {
            comp._state = [...snap.internal._state];
          } else {
            comp._state = { ...snap.internal._state };
          }
        }
        if (typeof comp._updateAppearance === 'function') comp._updateAppearance();
        if (typeof comp._updateDisplay === 'function') comp._updateDisplay();
        if (typeof comp._updateConnectorStates === 'function') comp._updateConnectorStates();
      }
    }

    this.engine._processQueue();
    if (this.engine.onUpdate) this.engine.onUpdate();

    this.content.innerHTML = html + '</table>';
  }
}
