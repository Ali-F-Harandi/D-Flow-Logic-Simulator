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

  /**
   * Deep-snapshot all component state so we can restore it perfectly after
   * enumeration.  The previous implementation only shallow-copied _state
   * and _prevClk, which could leave sequential components in an incorrect
   * internal state after truth-table generation.
   */
  _snapshotAllComponents() {
    const snapshot = new Map();
    for (const comp of this.engine.components.values()) {
      const internal = {};
      if (comp._prevClk !== undefined) internal._prevClk = comp._prevClk;
      if (comp._state !== undefined) {
        internal._state = Array.isArray(comp._state)
          ? [...comp._state]
          : { ...comp._state };
      }
      if (comp.frequency !== undefined) internal.frequency = comp.frequency;
      if (comp.running !== undefined) internal.running = comp.running;
      snapshot.set(comp.id, {
        outputs: comp.outputs.map(o => ({ value: o.value, connectedTo: comp.outputs.indexOf(o) })),
        outputValues: comp.outputs.map(o => o.value),
        inputValues: comp.inputs.map(i => i.value),
        inputConnectedTo: comp.inputs.map(i => i.connectedTo ? { ...i.connectedTo } : null),
        internal
      });
    }
    return snapshot;
  }

  /**
   * Restore all component state from a snapshot created by _snapshotAllComponents().
   */
  _restoreAllComponents(snapshot) {
    for (const [compId, snap] of snapshot) {
      const comp = this.engine.components.get(compId);
      if (!comp) continue;

      for (let i = 0; i < snap.outputValues.length; i++) {
        comp.outputs[i].value = snap.outputValues[i];
      }
      for (let i = 0; i < snap.inputValues.length; i++) {
        comp.inputs[i].value = snap.inputValues[i];
        comp.inputs[i].connectedTo = snap.inputConnectedTo[i];
      }
      if (snap.internal._prevClk !== undefined) comp._prevClk = snap.internal._prevClk;
      if (snap.internal._state !== undefined) {
        comp._state = Array.isArray(snap.internal._state)
          ? [...snap.internal._state]
          : { ...snap.internal._state };
      }
      if (snap.internal.frequency !== undefined && comp.setFrequency) {
        comp.setFrequency(snap.internal.frequency);
      }
      if (typeof comp._updateAppearance === 'function') comp._updateAppearance();
      if (typeof comp._updateDisplay === 'function') comp._updateDisplay();
      if (typeof comp._updateConnectorStates === 'function') comp._updateConnectorStates();
    }
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
        const n = comp._switchCount || 8;
        const bitIndices = [];
        for (let b = 0; b < n; b++) bitIndices.push(b);
        inputs.push({ comp, bits: bitIndices });
        totalBits += n;
      }
    }

    if (totalBits > 12) {
      this.content.innerHTML = `<div style="color: var(--color-danger); padding: 10px;">
        Too many input bits (${totalBits}). Maximum allowed is 12 to prevent browser freezing.
      </div>`;
      return;
    }

    const combos = 1 << totalBits;

    // FIX (Bug #1 Critical): Deep-snapshot ALL component state before enumeration
    const snapshot = this._snapshotAllComponents();

    // Reset all sequential component state so truth table enumeration
    // starts from a clean slate for each combination.
    for (const comp of this.engine.components.values()) {
      if (comp._prevClk !== undefined) comp._prevClk = false;
      if (comp._state !== undefined) {
        if (Array.isArray(comp._state)) comp._state = comp._state.map(() => false);
        else if (comp._state.Q !== undefined) comp._state = { Q: false, nQ: true };
      }
    }

    let html = '<table class="tt-table">';
    html += '<tr>';
    for (const inp of inputs) {
      if (inp.comp.type === 'DipSwitch8') {
        const n = inp.comp._switchCount || 8;
        for (let b = n - 1; b >= 0; b--) html += `<th>${inp.comp.id}.${b}</th>`;
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
      // Reset sequential state before each evaluation so flip-flops
      // don't accumulate state across truth table rows.
      for (const comp of this.engine.components.values()) {
        if (comp._prevClk !== undefined) comp._prevClk = false;
        if (comp._state !== undefined) {
          if (Array.isArray(comp._state)) comp._state = comp._state.map(() => false);
          else if (comp._state.Q !== undefined) comp._state = { Q: false, nQ: true };
        }
      }

      this.engine._processQueue();
      const outComp = this.engine._findComponentByNode(outputNodeId);
      const outVal = outComp?.outputs.find(o => o.id === outputNodeId)?.value;
      html += '<tr>';
      bitIdx = 0;
      for (const inp of inputs) {
        if (inp.comp.type === 'DipSwitch8') {
          const n = inp.comp._switchCount || 8;
          for (let b = n - 1; b >= 0; b--) {
            const val = (c >> (n - 1 - b)) & 1;
            html += `<td>${val}</td>`;
          }
          bitIdx += n;
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

    // FIX (Bug #1 Critical): Restore ALL component state from the deep snapshot
    this._restoreAllComponents(snapshot);

    this.engine._processQueue();
    if (this.engine.onUpdate) this.engine.onUpdate();

    this.content.innerHTML = html + '</table>';
  }
}
