/**
 * VerilogExporter — Generates structural Verilog from the circuit model.
 *
 * Converts the current circuit into a synthesizable Verilog module using
 * gate-level structural instantiation. Each D-Flow component maps to its
 * Verilog primitive or equivalent structural description.
 *
 * Supported mappings:
 *   AND/OR/NOT/NAND/NOR/XOR/XNOR → Verilog primitives
 *   Buffer → assign statement (wire passthrough)
 *   TriState → assign with conditional (z)
 *   ToggleSwitch/DipSwitch/HighConstant/LowConstant → input or localparam
 *   LightBulb/LogicProbe/SevenSegment/LedArray → output
 *   D/JK/T/SR Flip-Flops → behavioral always blocks (posedge clk)
 *   SRLatch → behavioral always block (level-sensitive)
 *   ShiftRegister → behavioral shift register
 *   HalfAdder/FullAdder/Multiplexer → structural from primitives
 *   Clock → input wire (external clock source)
 *
 * Limitations:
 *   - Single-bit signals only (no multi-bit bus support yet)
 *   - No propagation delay modeling
 *   - Flip-flops use a single global clock (first Clock component found)
 *   - Tri-state bus resolution not fully modeled
 */

export class VerilogExporter {

  /**
   * Export the engine's circuit as a Verilog module string.
   * @param {Engine} engine - The simulation engine
   * @param {string} [moduleName='dflow_circuit'] - Name for the Verilog module
   * @returns {string} Complete Verilog source code
   */
  static export(engine, moduleName = 'dflow_circuit') {
    const components = [...engine.components.values()];
    const wires = engine.circuit.wires;

    if (components.length === 0) {
      return `// D-Flow Logic Simulator - Empty Circuit\n// No components to export.\nmodule ${moduleName};\nendmodule\n`;
    }

    // Collect inputs, outputs, wires, and internal signals
    const inputs = new Set();
    const outputs = new Set();
    const wireSignals = new Set();
    const internalWires = new Set();
    const assignments = [];
    const instantiations = [];
    const behavioralBlocks = [];

    // Find clock component(s)
    const clockComps = components.filter(c => c.type === 'Clock');
    const hasClock = clockComps.length > 0;

    // Sanitize ID for Verilog identifier
    const sanitize = (id) => {
      return id.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^([0-9])/, '_$1');
    };

    // Generate a unique wire name for a node
    const nodeWireName = (componentId, nodeId) => {
      const comp = engine.components.get(componentId);
      const isOutput = nodeId.includes('.output.');
      const isInput = nodeId.includes('.input.');
      const idx = nodeId.split('.').pop();
      if (isOutput) {
        return sanitize(`${componentId}_out${idx}`);
      } else if (isInput) {
        return sanitize(`${componentId}_in${idx}`);
      }
      return sanitize(nodeId);
    };

    // Map each output node to its Verilog wire name
    const outputWireMap = new Map();
    for (const comp of components) {
      for (let i = 0; i < comp.outputs.length; i++) {
        const nodeId = comp.outputs[i].id;
        const wireName = nodeWireName(comp.id, nodeId);
        outputWireMap.set(nodeId, wireName);
      }
    }

    // Map each input node to the wire that drives it (from wire connections)
    const inputDriverMap = new Map();
    for (const wire of wires) {
      inputDriverMap.set(wire.to.nodeId, outputWireMap.get(wire.from.nodeId) || sanitize(wire.from.nodeId));
    }

    // Process each component
    for (const comp of components) {
      const compName = sanitize(comp.id);

      // Helper: get driver wire for input index
      const inputWire = (idx) => {
        if (idx < comp.inputs.length) {
          const driver = inputDriverMap.get(comp.inputs[idx].id);
          if (driver) return driver;
        }
        return "1'b0"; // Unconnected inputs default to 0
      };

      // Helper: output wire name for output index
      const outputWire = (idx) => {
        if (idx < comp.outputs.length) {
          return outputWireMap.get(comp.outputs[idx].id) || sanitize(`${comp.id}_out${idx}`);
        }
        return sanitize(`${comp.id}_out${idx}`);
      };

      // Register all output wires
      for (let i = 0; i < comp.outputs.length; i++) {
        const ow = outputWire(i);
        // Check if this output goes to any top-level output component
        const drivesOutput = wires.some(w =>
          w.from.nodeId === comp.outputs[i].id &&
          engine.components.get(w.to.componentId)?.type &&
          ['LightBulb', 'LogicProbe', 'SevenSegment', 'LedArray'].includes(engine.components.get(w.to.componentId).type)
        );
        if (!drivesOutput) {
          internalWires.add(ow);
        }
      }

      switch (comp.type) {
        // ── Input Components ──
        case 'ToggleSwitch':
        case 'Clock': {
          const wire = outputWire(0);
          inputs.add(wire);
          internalWires.delete(wire);
          break;
        }
        case 'HighConstant': {
          const wire = outputWire(0);
          assignments.push(`    assign ${wire} = 1'b1;`);
          internalWires.add(wire);
          break;
        }
        case 'LowConstant': {
          const wire = outputWire(0);
          assignments.push(`    assign ${wire} = 1'b0;`);
          internalWires.add(wire);
          break;
        }
        case 'DipSwitch': {
          // Each output of the DIP switch is a separate input
          for (let i = 0; i < comp.outputs.length; i++) {
            const wire = outputWire(i);
            inputs.add(wire);
            internalWires.delete(wire);
          }
          break;
        }

        // ── Output Components ──
        case 'LightBulb':
        case 'LogicProbe': {
          const wire = inputWire(0);
          outputs.add(wire);
          break;
        }
        case 'SevenSegment': {
          // 7-segment has 4 inputs (hex decoder)
          for (let i = 0; i < comp.inputs.length; i++) {
            const wire = inputWire(i);
            outputs.add(wire);
          }
          break;
        }
        case 'LedArray': {
          for (let i = 0; i < comp.inputs.length; i++) {
            const wire = inputWire(i);
            outputs.add(wire);
          }
          break;
        }

        // ── Basic Gates ──
        case 'AND': {
          const inputList = comp.inputs.map((_, i) => inputWire(i)).join(', ');
          instantiations.push(`    and ${compName}_gate (${outputWire(0)}, ${inputList});`);
          break;
        }
        case 'OR': {
          const inputList = comp.inputs.map((_, i) => inputWire(i)).join(', ');
          instantiations.push(`    or ${compName}_gate (${outputWire(0)}, ${inputList});`);
          break;
        }
        case 'NOT': {
          instantiations.push(`    not ${compName}_gate (${outputWire(0)}, ${inputWire(0)});`);
          break;
        }
        case 'NAND': {
          const inputList = comp.inputs.map((_, i) => inputWire(i)).join(', ');
          instantiations.push(`    nand ${compName}_gate (${outputWire(0)}, ${inputList});`);
          break;
        }
        case 'NOR': {
          const inputList = comp.inputs.map((_, i) => inputWire(i)).join(', ');
          instantiations.push(`    nor ${compName}_gate (${outputWire(0)}, ${inputList});`);
          break;
        }
        case 'XOR': {
          const inputList = comp.inputs.map((_, i) => inputWire(i)).join(', ');
          instantiations.push(`    xor ${compName}_gate (${outputWire(0)}, ${inputList});`);
          break;
        }
        case 'XNOR': {
          const inputList = comp.inputs.map((_, i) => inputWire(i)).join(', ');
          instantiations.push(`    xnor ${compName}_gate (${outputWire(0)}, ${inputList});`);
          break;
        }
        case 'Buffer': {
          assignments.push(`    assign ${outputWire(0)} = ${inputWire(0)};`);
          break;
        }
        case 'TriState': {
          // Tri-state: inputWire(0) = data, inputWire(1) = enable
          assignments.push(`    assign ${outputWire(0)} = ${inputWire(1)} ? ${inputWire(0)} : 1'bz;`);
          break;
        }

        // ── Flip-Flops (behavioral) ──
        case 'D': {
          const d_in = inputWire(0); // D
          const clk_in = hasClock ? inputWire(1) : 'clk';
          const q_out = outputWire(0);
          behavioralBlocks.push(`    always @(posedge ${clk_in}) begin
        ${q_out} <= ${d_in};
    end`);
          break;
        }
        case 'JK': {
          const j_in = inputWire(0);
          const k_in = inputWire(1);
          const clk_in = hasClock ? inputWire(2) : 'clk';
          const q_out = outputWire(0);
          behavioralBlocks.push(`    always @(posedge ${clk_in}) begin
        case ({${j_in}, ${k_in}})
            2'b00: ${q_out} <= ${q_out};
            2'b01: ${q_out} <= 1'b0;
            2'b10: ${q_out} <= 1'b1;
            2'b11: ${q_out} <= ~${q_out};
        endcase
    end`);
          break;
        }
        case 'T': {
          const t_in = inputWire(0);
          const clk_in = hasClock ? inputWire(1) : 'clk';
          const q_out = outputWire(0);
          behavioralBlocks.push(`    always @(posedge ${clk_in}) begin
        if (${t_in}) ${q_out} <= ~${q_out};
    end`);
          break;
        }
        case 'SR': {
          const s_in = inputWire(0);
          const r_in = inputWire(1);
          const clk_in = hasClock ? inputWire(2) : 'clk';
          const q_out = outputWire(0);
          behavioralBlocks.push(`    always @(posedge ${clk_in}) begin
        case ({${s_in}, ${r_in}})
            2'b00: ${q_out} <= ${q_out};
            2'b01: ${q_out} <= 1'b0;
            2'b10: ${q_out} <= 1'b1;
            2'b11: ${q_out} <= 1'bx; // Invalid state
        endcase
    end`);
          break;
        }
        case 'SRLatch': {
          const s_in = inputWire(0);
          const r_in = inputWire(1);
          const q_out = outputWire(0);
          behavioralBlocks.push(`    always @(*) begin
        if (${s_in} && !${r_in}) ${q_out} = 1'b1;
        else if (!${s_in} && ${r_in}) ${q_out} = 1'b0;
        else if (${s_in} && ${r_in}) ${q_out} = 1'bx; // Invalid
    end`);
          break;
        }

        // ── Shift Register (behavioral) ──
        case 'ShiftRegister': {
          const ser_in = inputWire(0);
          const clk_in = hasClock ? inputWire(1) : 'clk';
          const bitCount = comp.outputs.length;
          // Build shift register outputs
          const shiftWires = [];
          for (let i = 0; i < bitCount; i++) {
            shiftWires.push(outputWire(i));
          }
          const regList = shiftWires.join(', ');
          behavioralBlocks.push(`    // ${bitCount}-bit Shift Register
    always @(posedge ${clk_in}) begin
        {${regList}} <= {${regList.slice(1).join(', ')}, ${ser_in}};
    end`);
          break;
        }

        // ── Composite Chips ──
        case 'HalfAdder': {
          const a = inputWire(0);
          const b = inputWire(1);
          const sum_out = outputWire(0);
          const carry_out = outputWire(1);
          assignments.push(`    assign ${sum_out} = ${a} ^ ${b};`);
          assignments.push(`    assign ${carry_out} = ${a} & ${b};`);
          break;
        }
        case 'FullAdder': {
          const a = inputWire(0);
          const b = inputWire(1);
          const cin = inputWire(2);
          const sum_out = outputWire(0);
          const carry_out = outputWire(1);
          assignments.push(`    assign ${sum_out} = ${a} ^ ${b} ^ ${cin};`);
          assignments.push(`    assign ${carry_out} = (${a} & ${b}) | (${cin} & (${a} ^ ${b}));`);
          break;
        }
        case 'Multiplexer': {
          const in0 = inputWire(0);
          const in1 = inputWire(1);
          const sel = inputWire(2);
          assignments.push(`    assign ${outputWire(0)} = ${sel} ? ${in1} : ${in0};`);
          break;
        }

        default:
          instantiations.push(`    // Unknown component type: ${comp.type} (${comp.id})`);
      }
    }

    // Build the Verilog module
    const lines = [];
    lines.push(`// D-Flow Logic Simulator - Verilog Export`);
    lines.push(`// Generated: ${new Date().toISOString()}`);
    lines.push(`// Components: ${components.length}, Wires: ${wires.length}`);
    lines.push('');

    // Module declaration
    const portList = [];
    if (inputs.size > 0) portList.push(...inputs);
    if (outputs.size > 0) portList.push(...outputs);
    // Add global clock if there are flip-flops but no clock component
    const hasFlipFlops = components.some(c =>
      ['D', 'JK', 'T', 'SR', 'ShiftRegister'].includes(c.type)
    );
    if (hasFlipFlops && !hasClock) {
      portList.push('clk');
    }

    lines.push(`module ${moduleName} (${portList.join(', ')});`);
    lines.push('');

    // Input declarations
    if (inputs.size > 0) {
      for (const inp of inputs) {
        lines.push(`    input ${inp};`);
      }
      lines.push('');
    }

    // Global clock declaration (if no clock component)
    if (hasFlipFlops && !hasClock) {
      lines.push(`    input clk;  // Global clock`);
      lines.push('');
    }

    // Output declarations
    if (outputs.size > 0) {
      for (const out of outputs) {
        lines.push(`    output ${out};`);
      }
      lines.push('');
    }

    // Wire declarations
    if (internalWires.size > 0) {
      for (const wire of internalWires) {
        lines.push(`    wire ${wire};`);
      }
      lines.push('');
    }

    // Reg declarations for flip-flop outputs
    const ffOutputs = [];
    for (const comp of components) {
      if (['D', 'JK', 'T', 'SR', 'ShiftRegister'].includes(comp.type)) {
        for (let i = 0; i < comp.outputs.length; i++) {
          ffOutputs.push(outputWireMap.get(comp.outputs[i].id));
        }
      }
    }
    if (ffOutputs.length > 0) {
      for (const ff of ffOutputs) {
        lines.push(`    reg ${ff};`);
      }
      lines.push('');
    }

    // Assignments
    if (assignments.length > 0) {
      lines.push('    // Continuous assignments');
      for (const a of assignments) {
        lines.push(a);
      }
      lines.push('');
    }

    // Gate instantiations
    if (instantiations.length > 0) {
      lines.push('    // Gate instantiations');
      for (const inst of instantiations) {
        lines.push(inst);
      }
      lines.push('');
    }

    // Behavioral blocks
    if (behavioralBlocks.length > 0) {
      lines.push('    // Behavioral descriptions (sequential logic)');
      for (const block of behavioralBlocks) {
        lines.push(block);
      }
      lines.push('');
    }

    lines.push('endmodule');

    return lines.join('\n');
  }

  /**
   * Export and download as a .v file.
   * @param {Engine} engine
   * @param {string} [moduleName]
   */
  static download(engine, moduleName = 'dflow_circuit') {
    const verilog = VerilogExporter.export(engine, moduleName);
    const blob = new Blob([verilog], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${moduleName}.v`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
