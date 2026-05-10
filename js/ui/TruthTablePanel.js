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
    this.panel.innerHTML = `
      <h4 style="margin:0 0 8px 0;color:var(--color-accent)">Truth Table</h4>
      <div class="tt-instructions" style="margin-bottom:10px;padding:8px;background:var(--color-surface-alt);border:1px solid var(--color-border);border-radius:4px;font-size:11px;color:var(--color-text-muted);display:none;">
        <div style="margin-bottom:4px;font-weight:600;color:var(--color-accent);">How to use:</div>
        <div>1. Add Toggle Switches as inputs</div>
        <div>2. Add Light Bulbs or Logic Probes as outputs</div>
        <div>3. The truth table will auto-generate when opened</div>
        <div style="margin-top:4px;">Tip: You can also right-click an output pin and select "Generate Truth Table" for a specific output.</div>
      </div>
      <div class="tt-content"></div>
    `;
    container.appendChild(this.panel);

    this.content = this.panel.querySelector('.tt-content');
    this.instructions = this.panel.querySelector('.tt-instructions');
    this.eventBus.on('generate-truth-table', (outputNodeId) => this.generate(outputNodeId));

    // Auto-generate when panel is shown
    this.eventBus.on('show-panel', (type) => {
      if (type === 'truth') {
        this.autoGenerate();
      }
    });
  }

  /**
   * Auto-generate truth table for all outputs in the circuit.
   * Called when the truth table panel is opened.
   */
  autoGenerate() {
    // Check if there are any components
    if (this.engine.components.size === 0) {
      this.content.innerHTML = '<div style="color:var(--color-text-muted);padding:8px;">No components in the circuit. Add some gates and switches first.</div>';
      this.instructions.style.display = 'block';
      return;
    }

    // Find all input switches
    const inputComponents = [];
    for (const comp of this.engine.components.values()) {
      if (comp.type === 'ToggleSwitch' || comp.type === 'DipSwitch') {
        inputComponents.push(comp);
      }
    }

    if (inputComponents.length === 0) {
      this.content.innerHTML = '<div style="color:var(--color-text-muted);padding:8px;">No input switches found. Add Toggle Switches or DIP Switches to provide inputs.</div>';
      this.instructions.style.display = 'block';
      return;
    }

    // Find all output components (LightBulb, LogicProbe, SevenSegment, LedArray)
    const outputComponents = [];
    for (const comp of this.engine.components.values()) {
      if (comp.type === 'LightBulb' || comp.type === 'LogicProbe' ||
          comp.type === 'SevenSegment' || comp.type === 'LedArray') {
        outputComponents.push(comp);
      }
    }

    if (outputComponents.length === 0) {
      this.content.innerHTML = '<div style="color:var(--color-text-muted);padding:8px;">No output components found. Add Light Bulbs or Logic Probes to see outputs.</div>';
      this.instructions.style.display = 'block';
      return;
    }

    this.instructions.style.display = 'none';

    // Generate for all outputs
    this.generate(null);
  }

  /**
   * Deep-snapshot all component state so we can restore it perfectly after
   * enumeration.
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

  /**
   * Generate the truth table.
   *
   * @param {string|null} outputNodeId - If provided, generate for a single output.
   *   If null, auto-detect all output components and generate a multi-output table.
   */
  generate(outputNodeId) {
    const inputComponents = [];
    for (const comp of this.engine.components.values()) {
      if (comp.type === 'ToggleSwitch' || comp.type === 'DipSwitch') {
        inputComponents.push(comp);
      }
    }
    if (inputComponents.length === 0) {
      this.content.innerHTML = '<div style="color:var(--color-text-muted);padding:8px;">No input switches found. Add Toggle Switches or DIP Switches.</div>';
      this.instructions.style.display = 'block';
      return;
    }

    const inputs = [];
    let totalBits = 0;
    for (const comp of inputComponents) {
      if (comp.type === 'ToggleSwitch') {
        inputs.push({ comp, bits: [0] });
        totalBits++;
      } else if (comp.type === 'DipSwitch') {
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

    // Determine outputs
    let outputNodes = [];

    if (outputNodeId) {
      // Single output mode (from right-click)
      const outComp = this.engine._findComponentByNode(outputNodeId);
      if (outComp) {
        const outNode = outComp.outputs.find(o => o.id === outputNodeId);
        if (outNode) {
          outputNodes.push({ comp: outComp, nodeId: outputNodeId, label: outComp.id });
        }
      }
    }

    // If no specific output or no outputs found, auto-detect all output components
    if (outputNodes.length === 0) {
      for (const comp of this.engine.components.values()) {
        if (comp.type === 'LightBulb' || comp.type === 'LogicProbe') {
          // For single-output components, use the input value (it reflects the connected signal)
          if (comp.inputs.length > 0) {
            outputNodes.push({
              comp,
              nodeId: comp.inputs[0].id,
              label: comp.id,
              isInputBased: true
            });
          }
        } else if (comp.type === 'SevenSegment' || comp.type === 'LedArray') {
          // Multi-input output components - show each input
          for (let i = 0; i < comp.inputs.length; i++) {
            outputNodes.push({
              comp,
              nodeId: comp.inputs[i].id,
              label: `${comp.id}.${i}`,
              isInputBased: true
            });
          }
        } else if (comp.outputs.length > 0 && comp.inputs.length > 0) {
          // Generic component with both inputs and outputs - show outputs
          for (const out of comp.outputs) {
            outputNodes.push({
              comp,
              nodeId: out.id,
              label: `${comp.id}`,
              isInputBased: false
            });
          }
        }
      }
    }

    if (outputNodes.length === 0) {
      this.content.innerHTML = '<div style="color:var(--color-text-muted);padding:8px;">No output components found. Add Light Bulbs or Logic Probes to see outputs.</div>';
      this.instructions.style.display = 'block';
      return;
    }

    this.instructions.style.display = 'none';

    const combos = 1 << totalBits;

    // Deep-snapshot ALL component state before enumeration
    const snapshot = this._snapshotAllComponents();

    // Reset all sequential component state
    for (const comp of this.engine.components.values()) {
      if (comp._prevClk !== undefined) comp._prevClk = false;
      if (comp._state !== undefined) {
        if (Array.isArray(comp._state)) comp._state = comp._state.map(() => false);
        else if (comp._state.Q !== undefined) comp._state = { Q: false, nQ: true };
      }
    }

    let html = '<table class="tt-table"><thead><tr>';
    // Input column headers
    for (const inp of inputs) {
      if (inp.comp.type === 'DipSwitch') {
        const n = inp.comp._switchCount || 8;
        for (let b = n - 1; b >= 0; b--) html += `<th>${inp.comp.id}.${b}</th>`;
      } else {
        html += `<th>${inp.comp.id}</th>`;
      }
    }
    // Output column headers
    for (const out of outputNodes) {
      html += `<th style="color:var(--color-success)">${out.label}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (let c = 0; c < combos; c++) {
      let bitIdx = 0;
      // Set input values
      for (const inp of inputs) {
        for (const b of inp.bits) {
          const val = (c >> bitIdx) & 1;
          inp.comp.outputs[b !== undefined ? b : 0].value = !!val;
          if (typeof inp.comp._updateAppearance === 'function') inp.comp._updateAppearance();
          if (typeof inp.comp._updateConnectorStates === 'function') inp.comp._updateConnectorStates();
          bitIdx++;
        }
      }

      // Reset sequential state before each evaluation
      for (const comp of this.engine.components.values()) {
        if (comp._prevClk !== undefined) comp._prevClk = false;
        if (comp._state !== undefined) {
          if (Array.isArray(comp._state)) comp._state = comp._state.map(() => false);
          else if (comp._state.Q !== undefined) comp._state = { Q: false, nQ: true };
        }
      }

      // Evaluate the circuit
      this.engine._processQueue();

      // Build the row
      html += '<tr>';
      bitIdx = 0;

      // Input values
      for (const inp of inputs) {
        if (inp.comp.type === 'DipSwitch') {
          const n = inp.comp._switchCount || 8;
          for (let b = n - 1; b >= 0; b--) {
            const val = (c >> bitIdx) & 1;
            html += `<td>${val}</td>`;
            bitIdx++;
          }
        } else {
          for (const b of inp.bits) {
            const val = (c >> bitIdx) & 1;
            html += `<td>${val}</td>`;
            bitIdx++;
          }
        }
      }

      // Output values
      for (const out of outputNodes) {
        let outVal;
        if (out.isInputBased) {
          // For output components (LightBulb, LogicProbe), read the input value
          const inputNode = out.comp.inputs.find(i => i.id === out.nodeId);
          outVal = inputNode ? inputNode.value : false;
        } else {
          // For generic components, read the output value
          const outNode = out.comp.outputs.find(o => o.id === out.nodeId);
          outVal = outNode ? outNode.value : false;
        }
        const valStr = outVal === null ? 'Z' : (outVal ? '1' : '0');
        const valColor = outVal === true ? 'var(--color-success)' :
                         outVal === null ? '#ff9800' : 'var(--color-text-muted)';
        html += `<td style="color:${valColor};font-weight:600">${valStr}</td>`;
      }

      html += '</tr>';
    }

    html += '</tbody></table>';

    // Restore ALL component state from the deep snapshot
    this._restoreAllComponents(snapshot);

    this.engine._processQueue();
    if (this.engine.onUpdate) this.engine.onUpdate();

    this.content.innerHTML = html;
  }
}
