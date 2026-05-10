/**
 * ExampleCircuits — Pre-built example circuits for learning and demonstration.
 * Each example returns a JSON-serializable circuit state that can be imported.
 */

export class ExampleCircuits {

  /**
   * Get all available example circuits.
   * @returns {Array<{id: string, name: string, description: string, data: Function}>}
   */
  static getAll() {
    return [
      {
        id: 'half-adder',
        name: 'Half Adder',
        description: 'A half adder circuit that adds two single-bit binary numbers. Produces Sum (XOR) and Carry (AND).',
        data: ExampleCircuits.halfAdder
      },
      {
        id: 'full-adder',
        name: 'Full Adder',
        description: 'A full adder circuit that adds three single-bit numbers (A, B, Carry-in). Produces Sum and Carry-out.',
        data: ExampleCircuits.fullAdder
      },
      {
        id: 'sr-latch',
        name: 'SR Latch (NOR)',
        description: 'A Set-Reset latch using NOR gates. The simplest sequential circuit with memory.',
        data: ExampleCircuits.srLatch
      },
      {
        id: 'sr-flipflop',
        name: 'SR Flip-Flop',
        description: 'A clocked SR flip-flop using AND gates and NOR latch. State changes only on clock edge.',
        data: ExampleCircuits.srFlipFlop
      },
      {
        id: 'd-latch',
        name: 'D Latch',
        description: 'A D Latch (transparent latch) that stores data when Enable is HIGH.',
        data: ExampleCircuits.dLatch
      },
      {
        id: 'jk-flipflop',
        name: 'JK Flip-Flop',
        description: 'A JK flip-flop built from NOR gates. J=Set, K=Reset, both HIGH=toggles output.',
        data: ExampleCircuits.jkFlipFlop
      },
      {
        id: '2-to-1-mux',
        name: '2:1 Multiplexer',
        description: 'A 2-to-1 multiplexer that selects between two inputs based on a select line.',
        data: ExampleCircuits.multiplexer
      },
      {
        id: '4-to-1-mux',
        name: '4:1 Multiplexer',
        description: 'A 4-to-1 multiplexer using three 2:1 MUX stages. Selects one of four inputs using 2 select lines.',
        data: ExampleCircuits.fourToOneMux
      },
      {
        id: 'binary-counter',
        name: '2-Bit Counter',
        description: 'A 2-bit binary counter using D flip-flops. Counts up on each clock pulse.',
        data: ExampleCircuits.binaryCounter
      },
      {
        id: '3-bit-counter',
        name: '3-Bit Ripple Counter',
        description: 'A 3-bit ripple counter using T flip-flops. Each stage divides the clock by 2. Counts 0-7.',
        data: ExampleCircuits.threeBitCounter
      },
      {
        id: 'priority-encoder',
        name: '4-bit Priority Encoder',
        description: 'A 4-input priority encoder that outputs the binary index of the highest-priority active input.',
        data: ExampleCircuits.priorityEncoder
      }
    ];
  }

  static _makeComp(type, id, x, y, props = {}) {
    return { id, type, position: { x, y }, properties: props, inputs: [], outputs: [] };
  }

  static _makeWire(id, fromComp, fromNode, toComp, toNode) {
    return {
      id,
      from: { componentId: fromComp, nodeId: `${fromComp}.output.${fromNode}` },
      to: { componentId: toComp, nodeId: `${toComp}.output.${toNode}` }
    };
  }

  static halfAdder() {
    const gs = 20;
    return {
      components: [
        { id: 'sw_a', type: 'ToggleSwitch', position: { x: 5*gs, y: 3*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_a.output.0', value: false }] },
        { id: 'sw_b', type: 'ToggleSwitch', position: { x: 5*gs, y: 7*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_b.output.0', value: false }] },
        { id: 'xor1', type: 'XOR', position: { x: 12*gs, y: 3*gs }, properties: {}, inputs: [{ nodeId: 'xor1.input.0', connectedTo: null }, { nodeId: 'xor1.input.1', connectedTo: null }], outputs: [{ nodeId: 'xor1.output.0', value: false }] },
        { id: 'and1', type: 'AND', position: { x: 12*gs, y: 8*gs }, properties: {}, inputs: [{ nodeId: 'and1.input.0', connectedTo: null }, { nodeId: 'and1.input.1', connectedTo: null }], outputs: [{ nodeId: 'and1.output.0', value: false }] },
        { id: 'led_sum', type: 'LightBulb', position: { x: 19*gs, y: 3*gs }, properties: {}, inputs: [{ nodeId: 'led_sum.input.0', connectedTo: null }], outputs: [] },
        { id: 'led_carry', type: 'LightBulb', position: { x: 19*gs, y: 8*gs }, properties: {}, inputs: [{ nodeId: 'led_carry.input.0', connectedTo: null }], outputs: [] }
      ],
      wires: [
        { id: 'w1', from: { componentId: 'sw_a', nodeId: 'sw_a.output.0' }, to: { componentId: 'xor1', nodeId: 'xor1.input.0' } },
        { id: 'w2', from: { componentId: 'sw_b', nodeId: 'sw_b.output.0' }, to: { componentId: 'xor1', nodeId: 'xor1.input.1' } },
        { id: 'w3', from: { componentId: 'sw_a', nodeId: 'sw_a.output.0' }, to: { componentId: 'and1', nodeId: 'and1.input.0' } },
        { id: 'w4', from: { componentId: 'sw_b', nodeId: 'sw_b.output.0' }, to: { componentId: 'and1', nodeId: 'and1.input.1' } },
        { id: 'w5', from: { componentId: 'xor1', nodeId: 'xor1.output.0' }, to: { componentId: 'led_sum', nodeId: 'led_sum.input.0' } },
        { id: 'w6', from: { componentId: 'and1', nodeId: 'and1.output.0' }, to: { componentId: 'led_carry', nodeId: 'led_carry.input.0' } }
      ]
    };
  }

  static fullAdder() {
    const gs = 20;
    return {
      components: [
        { id: 'sw_a', type: 'ToggleSwitch', position: { x: 3*gs, y: 2*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_a.output.0', value: false }] },
        { id: 'sw_b', type: 'ToggleSwitch', position: { x: 3*gs, y: 6*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_b.output.0', value: false }] },
        { id: 'sw_cin', type: 'ToggleSwitch', position: { x: 3*gs, y: 14*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_cin.output.0', value: false }] },
        { id: 'xor1', type: 'XOR', position: { x: 10*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'xor1.input.0', connectedTo: null }, { nodeId: 'xor1.input.1', connectedTo: null }], outputs: [{ nodeId: 'xor1.output.0', value: false }] },
        { id: 'xor2', type: 'XOR', position: { x: 17*gs, y: 3*gs }, properties: {}, inputs: [{ nodeId: 'xor2.input.0', connectedTo: null }, { nodeId: 'xor2.input.1', connectedTo: null }], outputs: [{ nodeId: 'xor2.output.0', value: false }] },
        { id: 'and1', type: 'AND', position: { x: 10*gs, y: 7*gs }, properties: {}, inputs: [{ nodeId: 'and1.input.0', connectedTo: null }, { nodeId: 'and1.input.1', connectedTo: null }], outputs: [{ nodeId: 'and1.output.0', value: false }] },
        { id: 'and2', type: 'AND', position: { x: 17*gs, y: 8*gs }, properties: {}, inputs: [{ nodeId: 'and2.input.0', connectedTo: null }, { nodeId: 'and2.input.1', connectedTo: null }], outputs: [{ nodeId: 'and2.output.0', value: false }] },
        { id: 'or1', type: 'OR', position: { x: 24*gs, y: 9*gs }, properties: {}, inputs: [{ nodeId: 'or1.input.0', connectedTo: null }, { nodeId: 'or1.input.1', connectedTo: null }], outputs: [{ nodeId: 'or1.output.0', value: false }] },
        { id: 'led_sum', type: 'LightBulb', position: { x: 24*gs, y: 3*gs }, properties: {}, inputs: [{ nodeId: 'led_sum.input.0', connectedTo: null }], outputs: [] },
        { id: 'led_cout', type: 'LightBulb', position: { x: 31*gs, y: 9*gs }, properties: {}, inputs: [{ nodeId: 'led_cout.input.0', connectedTo: null }], outputs: [] }
      ],
      wires: [
        { id: 'w1', from: { componentId: 'sw_a', nodeId: 'sw_a.output.0' }, to: { componentId: 'xor1', nodeId: 'xor1.input.0' } },
        { id: 'w2', from: { componentId: 'sw_b', nodeId: 'sw_b.output.0' }, to: { componentId: 'xor1', nodeId: 'xor1.input.1' } },
        { id: 'w3', from: { componentId: 'xor1', nodeId: 'xor1.output.0' }, to: { componentId: 'xor2', nodeId: 'xor2.input.0' } },
        { id: 'w4', from: { componentId: 'sw_cin', nodeId: 'sw_cin.output.0' }, to: { componentId: 'xor2', nodeId: 'xor2.input.1' } },
        { id: 'w5', from: { componentId: 'xor2', nodeId: 'xor2.output.0' }, to: { componentId: 'led_sum', nodeId: 'led_sum.input.0' } },
        { id: 'w6', from: { componentId: 'sw_a', nodeId: 'sw_a.output.0' }, to: { componentId: 'and1', nodeId: 'and1.input.0' } },
        { id: 'w7', from: { componentId: 'sw_b', nodeId: 'sw_b.output.0' }, to: { componentId: 'and1', nodeId: 'and1.input.1' } },
        { id: 'w8', from: { componentId: 'xor1', nodeId: 'xor1.output.0' }, to: { componentId: 'and2', nodeId: 'and2.input.0' } },
        { id: 'w9', from: { componentId: 'sw_cin', nodeId: 'sw_cin.output.0' }, to: { componentId: 'and2', nodeId: 'and2.input.1' } },
        { id: 'w10', from: { componentId: 'and1', nodeId: 'and1.output.0' }, to: { componentId: 'or1', nodeId: 'or1.input.0' } },
        { id: 'w11', from: { componentId: 'and2', nodeId: 'and2.output.0' }, to: { componentId: 'or1', nodeId: 'or1.input.1' } },
        { id: 'w12', from: { componentId: 'or1', nodeId: 'or1.output.0' }, to: { componentId: 'led_cout', nodeId: 'led_cout.input.0' } }
      ]
    };
  }

  static srLatch() {
    const gs = 20;
    return {
      components: [
        { id: 'sw_s', type: 'ToggleSwitch', position: { x: 3*gs, y: 3*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_s.output.0', value: false }] },
        { id: 'sw_r', type: 'ToggleSwitch', position: { x: 3*gs, y: 10*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_r.output.0', value: false }] },
        { id: 'nor1', type: 'NOR', position: { x: 12*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'nor1.input.0', connectedTo: null }, { nodeId: 'nor1.input.1', connectedTo: null }], outputs: [{ nodeId: 'nor1.output.0', value: false }] },
        { id: 'nor2', type: 'NOR', position: { x: 12*gs, y: 9*gs }, properties: {}, inputs: [{ nodeId: 'nor2.input.0', connectedTo: null }, { nodeId: 'nor2.input.1', connectedTo: null }], outputs: [{ nodeId: 'nor2.output.0', value: false }] },
        { id: 'led_q', type: 'LightBulb', position: { x: 20*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'led_q.input.0', connectedTo: null }], outputs: [] },
        { id: 'led_nq', type: 'LightBulb', position: { x: 20*gs, y: 9*gs }, properties: {}, inputs: [{ nodeId: 'led_nq.input.0', connectedTo: null }], outputs: [] }
      ],
      wires: [
        { id: 'w1', from: { componentId: 'sw_s', nodeId: 'sw_s.output.0' }, to: { componentId: 'nor1', nodeId: 'nor1.input.0' } },
        { id: 'w2', from: { componentId: 'sw_r', nodeId: 'sw_r.output.0' }, to: { componentId: 'nor2', nodeId: 'nor2.input.1' } },
        { id: 'w3', from: { componentId: 'nor1', nodeId: 'nor1.output.0' }, to: { componentId: 'nor2', nodeId: 'nor2.input.0' } },
        { id: 'w4', from: { componentId: 'nor2', nodeId: 'nor2.output.0' }, to: { componentId: 'nor1', nodeId: 'nor1.input.1' } },
        { id: 'w5', from: { componentId: 'nor1', nodeId: 'nor1.output.0' }, to: { componentId: 'led_q', nodeId: 'led_q.input.0' } },
        { id: 'w6', from: { componentId: 'nor2', nodeId: 'nor2.output.0' }, to: { componentId: 'led_nq', nodeId: 'led_nq.input.0' } }
      ]
    };
  }

  static dLatch() {
    const gs = 20;
    return {
      components: [
        { id: 'sw_d', type: 'ToggleSwitch', position: { x: 3*gs, y: 3*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_d.output.0', value: false }] },
        { id: 'sw_en', type: 'ToggleSwitch', position: { x: 3*gs, y: 10*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_en.output.0', value: false }] },
        { id: 'and1', type: 'AND', position: { x: 10*gs, y: 3*gs }, properties: {}, inputs: [{ nodeId: 'and1.input.0', connectedTo: null }, { nodeId: 'and1.input.1', connectedTo: null }], outputs: [{ nodeId: 'and1.output.0', value: false }] },
        { id: 'not1', type: 'NOT', position: { x: 10*gs, y: 8*gs }, properties: {}, inputs: [{ nodeId: 'not1.input.0', connectedTo: null }], outputs: [{ nodeId: 'not1.output.0', value: false }] },
        { id: 'and2', type: 'AND', position: { x: 10*gs, y: 12*gs }, properties: {}, inputs: [{ nodeId: 'and2.input.0', connectedTo: null }, { nodeId: 'and2.input.1', connectedTo: null }], outputs: [{ nodeId: 'and2.output.0', value: false }] },
        { id: 'nor1', type: 'NOR', position: { x: 18*gs, y: 4*gs }, properties: {}, inputs: [{ nodeId: 'nor1.input.0', connectedTo: null }, { nodeId: 'nor1.input.1', connectedTo: null }], outputs: [{ nodeId: 'nor1.output.0', value: false }] },
        { id: 'nor2', type: 'NOR', position: { x: 18*gs, y: 11*gs }, properties: {}, inputs: [{ nodeId: 'nor2.input.0', connectedTo: null }, { nodeId: 'nor2.input.1', connectedTo: null }], outputs: [{ nodeId: 'nor2.output.0', value: false }] },
        { id: 'led_q', type: 'LightBulb', position: { x: 26*gs, y: 4*gs }, properties: {}, inputs: [{ nodeId: 'led_q.input.0', connectedTo: null }], outputs: [] },
        { id: 'led_nq', type: 'LightBulb', position: { x: 26*gs, y: 11*gs }, properties: {}, inputs: [{ nodeId: 'led_nq.input.0', connectedTo: null }], outputs: [] }
      ],
      wires: [
        { id: 'w1', from: { componentId: 'sw_d', nodeId: 'sw_d.output.0' }, to: { componentId: 'and1', nodeId: 'and1.input.0' } },
        { id: 'w2', from: { componentId: 'sw_en', nodeId: 'sw_en.output.0' }, to: { componentId: 'and1', nodeId: 'and1.input.1' } },
        { id: 'w3', from: { componentId: 'sw_d', nodeId: 'sw_d.output.0' }, to: { componentId: 'not1', nodeId: 'not1.input.0' } },
        { id: 'w4', from: { componentId: 'not1', nodeId: 'not1.output.0' }, to: { componentId: 'and2', nodeId: 'and2.input.0' } },
        { id: 'w5', from: { componentId: 'sw_en', nodeId: 'sw_en.output.0' }, to: { componentId: 'and2', nodeId: 'and2.input.1' } },
        { id: 'w6', from: { componentId: 'and1', nodeId: 'and1.output.0' }, to: { componentId: 'nor1', nodeId: 'nor1.input.0' } },
        { id: 'w7', from: { componentId: 'and2', nodeId: 'and2.output.0' }, to: { componentId: 'nor2', nodeId: 'nor2.input.1' } },
        { id: 'w8', from: { componentId: 'nor1', nodeId: 'nor1.output.0' }, to: { componentId: 'nor2', nodeId: 'nor2.input.0' } },
        { id: 'w9', from: { componentId: 'nor2', nodeId: 'nor2.output.0' }, to: { componentId: 'nor1', nodeId: 'nor1.input.1' } },
        { id: 'w10', from: { componentId: 'nor1', nodeId: 'nor1.output.0' }, to: { componentId: 'led_q', nodeId: 'led_q.input.0' } },
        { id: 'w11', from: { componentId: 'nor2', nodeId: 'nor2.output.0' }, to: { componentId: 'led_nq', nodeId: 'led_nq.input.0' } }
      ]
    };
  }

  static multiplexer() {
    const gs = 20;
    return {
      components: [
        { id: 'sw_a', type: 'ToggleSwitch', position: { x: 3*gs, y: 3*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_a.output.0', value: false }] },
        { id: 'sw_b', type: 'ToggleSwitch', position: { x: 3*gs, y: 8*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_b.output.0', value: false }] },
        { id: 'sw_sel', type: 'ToggleSwitch', position: { x: 3*gs, y: 14*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_sel.output.0', value: false }] },
        { id: 'not1', type: 'NOT', position: { x: 10*gs, y: 14*gs }, properties: {}, inputs: [{ nodeId: 'not1.input.0', connectedTo: null }], outputs: [{ nodeId: 'not1.output.0', value: false }] },
        { id: 'and1', type: 'AND', position: { x: 17*gs, y: 3*gs }, properties: {}, inputs: [{ nodeId: 'and1.input.0', connectedTo: null }, { nodeId: 'and1.input.1', connectedTo: null }], outputs: [{ nodeId: 'and1.output.0', value: false }] },
        { id: 'and2', type: 'AND', position: { x: 17*gs, y: 8*gs }, properties: {}, inputs: [{ nodeId: 'and2.input.0', connectedTo: null }, { nodeId: 'and2.input.1', connectedTo: null }], outputs: [{ nodeId: 'and2.output.0', value: false }] },
        { id: 'or1', type: 'OR', position: { x: 24*gs, y: 5*gs }, properties: {}, inputs: [{ nodeId: 'or1.input.0', connectedTo: null }, { nodeId: 'or1.input.1', connectedTo: null }], outputs: [{ nodeId: 'or1.output.0', value: false }] },
        { id: 'led_out', type: 'LightBulb', position: { x: 31*gs, y: 5*gs }, properties: {}, inputs: [{ nodeId: 'led_out.input.0', connectedTo: null }], outputs: [] }
      ],
      wires: [
        { id: 'w1', from: { componentId: 'sw_a', nodeId: 'sw_a.output.0' }, to: { componentId: 'and1', nodeId: 'and1.input.0' } },
        { id: 'w2', from: { componentId: 'not1', nodeId: 'not1.output.0' }, to: { componentId: 'and1', nodeId: 'and1.input.1' } },
        { id: 'w3', from: { componentId: 'sw_b', nodeId: 'sw_b.output.0' }, to: { componentId: 'and2', nodeId: 'and2.input.0' } },
        { id: 'w4', from: { componentId: 'sw_sel', nodeId: 'sw_sel.output.0' }, to: { componentId: 'and2', nodeId: 'and2.input.1' } },
        { id: 'w5', from: { componentId: 'sw_sel', nodeId: 'sw_sel.output.0' }, to: { componentId: 'not1', nodeId: 'not1.input.0' } },
        { id: 'w6', from: { componentId: 'and1', nodeId: 'and1.output.0' }, to: { componentId: 'or1', nodeId: 'or1.input.0' } },
        { id: 'w7', from: { componentId: 'and2', nodeId: 'and2.output.0' }, to: { componentId: 'or1', nodeId: 'or1.input.1' } },
        { id: 'w8', from: { componentId: 'or1', nodeId: 'or1.output.0' }, to: { componentId: 'led_out', nodeId: 'led_out.input.0' } }
      ]
    };
  }

  static binaryCounter() {
    const gs = 20;
    return {
      components: [
        { id: 'clk1', type: 'Clock', position: { x: 3*gs, y: 3*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'clk1.output.0', value: false }] },
        { id: 'high1', type: 'HighConstant', position: { x: 3*gs, y: 8*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'high1.output.0', value: true }] },
        { id: 'dff0', type: 'D', position: { x: 12*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'dff0.input.0', connectedTo: null }, { nodeId: 'dff0.input.1', connectedTo: null }], outputs: [{ nodeId: 'dff0.output.0', value: false }, { nodeId: 'dff0.output.1', value: true }], internalState: { _state: { Q: false, nQ: true }, _prevClk: false } },
        { id: 'not1', type: 'NOT', position: { x: 20*gs, y: 8*gs }, properties: {}, inputs: [{ nodeId: 'not1.input.0', connectedTo: null }], outputs: [{ nodeId: 'not1.output.0', value: false }] },
        { id: 'dff1', type: 'D', position: { x: 26*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'dff1.input.0', connectedTo: null }, { nodeId: 'dff1.input.1', connectedTo: null }], outputs: [{ nodeId: 'dff1.output.0', value: false }, { nodeId: 'dff1.output.1', value: true }], internalState: { _state: { Q: false, nQ: true }, _prevClk: false } },
        { id: 'led_q0', type: 'LightBulb', position: { x: 18*gs, y: 15*gs }, properties: {}, inputs: [{ nodeId: 'led_q0.input.0', connectedTo: null }], outputs: [] },
        { id: 'led_q1', type: 'LightBulb', position: { x: 32*gs, y: 15*gs }, properties: {}, inputs: [{ nodeId: 'led_q1.input.0', connectedTo: null }], outputs: [] }
      ],
      wires: [
        { id: 'w1', from: { componentId: 'clk1', nodeId: 'clk1.output.0' }, to: { componentId: 'dff0', nodeId: 'dff0.input.1' } },
        { id: 'w2', from: { componentId: 'high1', nodeId: 'high1.output.0' }, to: { componentId: 'dff0', nodeId: 'dff0.input.0' } },
        { id: 'w3', from: { componentId: 'dff0', nodeId: 'dff0.output.1' }, to: { componentId: 'not1', nodeId: 'not1.input.0' } },
        { id: 'w4', from: { componentId: 'clk1', nodeId: 'clk1.output.0' }, to: { componentId: 'dff1', nodeId: 'dff1.input.1' } },
        { id: 'w5', from: { componentId: 'not1', nodeId: 'not1.output.0' }, to: { componentId: 'dff1', nodeId: 'dff1.input.0' } },
        { id: 'w6', from: { componentId: 'dff0', nodeId: 'dff0.output.0' }, to: { componentId: 'led_q0', nodeId: 'led_q0.input.0' } },
        { id: 'w7', from: { componentId: 'dff1', nodeId: 'dff1.output.0' }, to: { componentId: 'led_q1', nodeId: 'led_q1.input.0' } }
      ]
    };
  }

  /* ───────── Advanced Examples ───────── */

  static srFlipFlop() {
    const gs = 20;
    return {
      components: [
        { id: 'sw_s', type: 'ToggleSwitch', position: { x: 2*gs, y: 3*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_s.output.0', value: false }] },
        { id: 'sw_clk', type: 'Clock', position: { x: 2*gs, y: 7*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_clk.output.0', value: false }] },
        { id: 'sw_r', type: 'ToggleSwitch', position: { x: 2*gs, y: 11*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_r.output.0', value: false }] },
        { id: 'and1', type: 'AND', position: { x: 9*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'and1.input.0', connectedTo: null }, { nodeId: 'and1.input.1', connectedTo: null }], outputs: [{ nodeId: 'and1.output.0', value: false }] },
        { id: 'and2', type: 'AND', position: { x: 9*gs, y: 10*gs }, properties: {}, inputs: [{ nodeId: 'and2.input.0', connectedTo: null }, { nodeId: 'and2.input.1', connectedTo: null }], outputs: [{ nodeId: 'and2.output.0', value: false }] },
        { id: 'nor1', type: 'NOR', position: { x: 16*gs, y: 3*gs }, properties: {}, inputs: [{ nodeId: 'nor1.input.0', connectedTo: null }, { nodeId: 'nor1.input.1', connectedTo: null }], outputs: [{ nodeId: 'nor1.output.0', value: false }] },
        { id: 'nor2', type: 'NOR', position: { x: 16*gs, y: 9*gs }, properties: {}, inputs: [{ nodeId: 'nor2.input.0', connectedTo: null }, { nodeId: 'nor2.input.1', connectedTo: null }], outputs: [{ nodeId: 'nor2.output.0', value: false }] },
        { id: 'led_q', type: 'LightBulb', position: { x: 24*gs, y: 3*gs }, properties: {}, inputs: [{ nodeId: 'led_q.input.0', connectedTo: null }], outputs: [] },
        { id: 'led_nq', type: 'LightBulb', position: { x: 24*gs, y: 9*gs }, properties: {}, inputs: [{ nodeId: 'led_nq.input.0', connectedTo: null }], outputs: [] }
      ],
      wires: [
        { id: 'w1', from: { componentId: 'sw_s', nodeId: 'sw_s.output.0' }, to: { componentId: 'and1', nodeId: 'and1.input.0' } },
        { id: 'w2', from: { componentId: 'sw_clk', nodeId: 'sw_clk.output.0' }, to: { componentId: 'and1', nodeId: 'and1.input.1' } },
        { id: 'w3', from: { componentId: 'sw_r', nodeId: 'sw_r.output.0' }, to: { componentId: 'and2', nodeId: 'and2.input.1' } },
        { id: 'w4', from: { componentId: 'sw_clk', nodeId: 'sw_clk.output.0' }, to: { componentId: 'and2', nodeId: 'and2.input.0' } },
        { id: 'w5', from: { componentId: 'and1', nodeId: 'and1.output.0' }, to: { componentId: 'nor1', nodeId: 'nor1.input.0' } },
        { id: 'w6', from: { componentId: 'and2', nodeId: 'and2.output.0' }, to: { componentId: 'nor2', nodeId: 'nor2.input.1' } },
        { id: 'w7', from: { componentId: 'nor1', nodeId: 'nor1.output.0' }, to: { componentId: 'nor2', nodeId: 'nor2.input.0' } },
        { id: 'w8', from: { componentId: 'nor2', nodeId: 'nor2.output.0' }, to: { componentId: 'nor1', nodeId: 'nor1.input.1' } },
        { id: 'w9', from: { componentId: 'nor1', nodeId: 'nor1.output.0' }, to: { componentId: 'led_q', nodeId: 'led_q.input.0' } },
        { id: 'w10', from: { componentId: 'nor2', nodeId: 'nor2.output.0' }, to: { componentId: 'led_nq', nodeId: 'led_nq.input.0' } }
      ]
    };
  }

  static jkFlipFlop() {
    const gs = 20;
    return {
      components: [
        { id: 'sw_j', type: 'ToggleSwitch', position: { x: 2*gs, y: 2*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_j.output.0', value: false }] },
        { id: 'sw_clk', type: 'Clock', position: { x: 2*gs, y: 7*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_clk.output.0', value: false }] },
        { id: 'sw_k', type: 'ToggleSwitch', position: { x: 2*gs, y: 13*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_k.output.0', value: false }] },
        { id: 'and1', type: 'AND', position: { x: 10*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'and1.input.0', connectedTo: null }, { nodeId: 'and1.input.1', connectedTo: null }], outputs: [{ nodeId: 'and1.output.0', value: false }] },
        { id: 'and2', type: 'AND', position: { x: 10*gs, y: 12*gs }, properties: {}, inputs: [{ nodeId: 'and2.input.0', connectedTo: null }, { nodeId: 'and2.input.1', connectedTo: null }], outputs: [{ nodeId: 'and2.output.0', value: false }] },
        { id: 'nor1', type: 'NOR', position: { x: 18*gs, y: 3*gs }, properties: {}, inputs: [{ nodeId: 'nor1.input.0', connectedTo: null }, { nodeId: 'nor1.input.1', connectedTo: null }], outputs: [{ nodeId: 'nor1.output.0', value: false }] },
        { id: 'nor2', type: 'NOR', position: { x: 18*gs, y: 11*gs }, properties: {}, inputs: [{ nodeId: 'nor2.input.0', connectedTo: null }, { nodeId: 'nor2.input.1', connectedTo: null }], outputs: [{ nodeId: 'nor2.output.0', value: false }] },
        { id: 'led_q', type: 'LightBulb', position: { x: 26*gs, y: 3*gs }, properties: {}, inputs: [{ nodeId: 'led_q.input.0', connectedTo: null }], outputs: [] },
        { id: 'led_nq', type: 'LightBulb', position: { x: 26*gs, y: 11*gs }, properties: {}, inputs: [{ nodeId: 'led_nq.input.0', connectedTo: null }], outputs: [] }
      ],
      wires: [
        { id: 'w1', from: { componentId: 'sw_j', nodeId: 'sw_j.output.0' }, to: { componentId: 'and1', nodeId: 'and1.input.0' } },
        { id: 'w2', from: { componentId: 'sw_clk', nodeId: 'sw_clk.output.0' }, to: { componentId: 'and1', nodeId: 'and1.input.1' } },
        { id: 'w3', from: { componentId: 'sw_k', nodeId: 'sw_k.output.0' }, to: { componentId: 'and2', nodeId: 'and2.input.1' } },
        { id: 'w4', from: { componentId: 'sw_clk', nodeId: 'sw_clk.output.0' }, to: { componentId: 'and2', nodeId: 'and2.input.0' } },
        { id: 'w5', from: { componentId: 'and1', nodeId: 'and1.output.0' }, to: { componentId: 'nor1', nodeId: 'nor1.input.0' } },
        { id: 'w6', from: { componentId: 'and2', nodeId: 'and2.output.0' }, to: { componentId: 'nor2', nodeId: 'nor2.input.1' } },
        { id: 'w7', from: { componentId: 'nor1', nodeId: 'nor1.output.0' }, to: { componentId: 'nor2', nodeId: 'nor2.input.0' } },
        { id: 'w8', from: { componentId: 'nor2', nodeId: 'nor2.output.0' }, to: { componentId: 'nor1', nodeId: 'nor1.input.1' } },
        // Feedback: Q feeds back to AND2, nQ feeds back to AND1 (JK characteristic)
        { id: 'w9', from: { componentId: 'nor1', nodeId: 'nor1.output.0' }, to: { componentId: 'and2', nodeId: 'and2.input.0' } },
        { id: 'w10', from: { componentId: 'nor2', nodeId: 'nor2.output.0' }, to: { componentId: 'and1', nodeId: 'and1.input.1' } },
        { id: 'w11', from: { componentId: 'nor1', nodeId: 'nor1.output.0' }, to: { componentId: 'led_q', nodeId: 'led_q.input.0' } },
        { id: 'w12', from: { componentId: 'nor2', nodeId: 'nor2.output.0' }, to: { componentId: 'led_nq', nodeId: 'led_nq.input.0' } }
      ]
    };
  }

  static fourToOneMux() {
    const gs = 20;
    return {
      components: [
        { id: 'sw_a', type: 'ToggleSwitch', position: { x: 2*gs, y: 2*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_a.output.0', value: false }] },
        { id: 'sw_b', type: 'ToggleSwitch', position: { x: 2*gs, y: 6*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_b.output.0', value: false }] },
        { id: 'sw_c', type: 'ToggleSwitch', position: { x: 2*gs, y: 10*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_c.output.0', value: false }] },
        { id: 'sw_d', type: 'ToggleSwitch', position: { x: 2*gs, y: 14*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_d.output.0', value: false }] },
        { id: 'sw_s0', type: 'ToggleSwitch', position: { x: 2*gs, y: 19*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_s0.output.0', value: false }] },
        { id: 'sw_s1', type: 'ToggleSwitch', position: { x: 2*gs, y: 23*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_s1.output.0', value: false }] },
        { id: 'not_s0', type: 'NOT', position: { x: 9*gs, y: 19*gs }, properties: {}, inputs: [{ nodeId: 'not_s0.input.0', connectedTo: null }], outputs: [{ nodeId: 'not_s0.output.0', value: true }] },
        { id: 'not_s1', type: 'NOT', position: { x: 9*gs, y: 23*gs }, properties: {}, inputs: [{ nodeId: 'not_s1.input.0', connectedTo: null }], outputs: [{ nodeId: 'not_s1.output.0', value: true }] },
        // Stage 1: Four AND gates
        { id: 'and0', type: 'AND', position: { x: 16*gs, y: 1*gs }, properties: {}, inputs: [{ nodeId: 'and0.input.0', connectedTo: null }, { nodeId: 'and0.input.1', connectedTo: null }], outputs: [{ nodeId: 'and0.output.0', value: false }] },
        { id: 'and1', type: 'AND', position: { x: 16*gs, y: 5*gs }, properties: {}, inputs: [{ nodeId: 'and1.input.0', connectedTo: null }, { nodeId: 'and1.input.1', connectedTo: null }], outputs: [{ nodeId: 'and1.output.0', value: false }] },
        { id: 'and2', type: 'AND', position: { x: 16*gs, y: 9*gs }, properties: {}, inputs: [{ nodeId: 'and2.input.0', connectedTo: null }, { nodeId: 'and2.input.1', connectedTo: null }], outputs: [{ nodeId: 'and2.output.0', value: false }] },
        { id: 'and3', type: 'AND', position: { x: 16*gs, y: 13*gs }, properties: {}, inputs: [{ nodeId: 'and3.input.0', connectedTo: null }, { nodeId: 'and3.input.1', connectedTo: null }], outputs: [{ nodeId: 'and3.output.0', value: false }] },
        // Stage 2: OR gate combines all
        { id: 'or1', type: 'OR', position: { x: 24*gs, y: 7*gs }, properties: {}, inputs: [{ nodeId: 'or1.input.0', connectedTo: null }, { nodeId: 'or1.input.1', connectedTo: null }], outputs: [{ nodeId: 'or1.output.0', value: false }] },
        { id: 'led_out', type: 'LightBulb', position: { x: 31*gs, y: 7*gs }, properties: {}, inputs: [{ nodeId: 'led_out.input.0', connectedTo: null }], outputs: [] }
      ],
      wires: [
        // Select lines
        { id: 'w_s0n', from: { componentId: 'sw_s0', nodeId: 'sw_s0.output.0' }, to: { componentId: 'not_s0', nodeId: 'not_s0.input.0' } },
        { id: 'w_s1n', from: { componentId: 'sw_s1', nodeId: 'sw_s1.output.0' }, to: { componentId: 'not_s1', nodeId: 'not_s1.input.0' } },
        // AND0: A AND NOT_S0 AND NOT_S1
        { id: 'w_a0', from: { componentId: 'sw_a', nodeId: 'sw_a.output.0' }, to: { componentId: 'and0', nodeId: 'and0.input.0' } },
        { id: 'w_ns0_0', from: { componentId: 'not_s0', nodeId: 'not_s0.output.0' }, to: { componentId: 'and0', nodeId: 'and0.input.1' } },
        // AND1: B AND S0 AND NOT_S1
        { id: 'w_b1', from: { componentId: 'sw_b', nodeId: 'sw_b.output.0' }, to: { componentId: 'and1', nodeId: 'and1.input.0' } },
        { id: 'w_s0_1', from: { componentId: 'sw_s0', nodeId: 'sw_s0.output.0' }, to: { componentId: 'and1', nodeId: 'and1.input.1' } },
        // AND2: C AND NOT_S0 AND S1
        { id: 'w_c2', from: { componentId: 'sw_c', nodeId: 'sw_c.output.0' }, to: { componentId: 'and2', nodeId: 'and2.input.0' } },
        { id: 'w_ns0_2', from: { componentId: 'not_s0', nodeId: 'not_s0.output.0' }, to: { componentId: 'and2', nodeId: 'and2.input.1' } },
        // AND3: D AND S0 AND S1
        { id: 'w_d3', from: { componentId: 'sw_d', nodeId: 'sw_d.output.0' }, to: { componentId: 'and3', nodeId: 'and3.input.0' } },
        { id: 'w_s0_3', from: { componentId: 'sw_s0', nodeId: 'sw_s0.output.0' }, to: { componentId: 'and3', nodeId: 'and3.input.1' } },
        // Combine with OR
        { id: 'w_or0', from: { componentId: 'and0', nodeId: 'and0.output.0' }, to: { componentId: 'or1', nodeId: 'or1.input.0' } },
        { id: 'w_or1', from: { componentId: 'and3', nodeId: 'and3.output.0' }, to: { componentId: 'or1', nodeId: 'or1.input.1' } },
        { id: 'w_out', from: { componentId: 'or1', nodeId: 'or1.output.0' }, to: { componentId: 'led_out', nodeId: 'led_out.input.0' } }
      ]
    };
  }

  static threeBitCounter() {
    const gs = 20;
    return {
      components: [
        { id: 'clk1', type: 'Clock', position: { x: 2*gs, y: 3*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'clk1.output.0', value: false }] },
        { id: 'dff0', type: 'T', position: { x: 12*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'dff0.input.0', connectedTo: null }, { nodeId: 'dff0.input.1', connectedTo: null }], outputs: [{ nodeId: 'dff0.output.0', value: false }, { nodeId: 'dff0.output.1', value: true }], internalState: { _state: { Q: false, nQ: true }, _prevClk: false } },
        { id: 'dff1', type: 'T', position: { x: 22*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'dff1.input.0', connectedTo: null }, { nodeId: 'dff1.input.1', connectedTo: null }], outputs: [{ nodeId: 'dff1.output.0', value: false }, { nodeId: 'dff1.output.1', value: true }], internalState: { _state: { Q: false, nQ: true }, _prevClk: false } },
        { id: 'dff2', type: 'T', position: { x: 32*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'dff2.input.0', connectedTo: null }, { nodeId: 'dff2.input.1', connectedTo: null }], outputs: [{ nodeId: 'dff2.output.0', value: false }, { nodeId: 'dff2.output.1', value: true }], internalState: { _state: { Q: false, nQ: true }, _prevClk: false } },
        { id: 'high1', type: 'HighConstant', position: { x: 2*gs, y: 8*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'high1.output.0', value: true }] },
        { id: 'led_q0', type: 'LightBulb', position: { x: 12*gs, y: 14*gs }, properties: {}, inputs: [{ nodeId: 'led_q0.input.0', connectedTo: null }], outputs: [] },
        { id: 'led_q1', type: 'LightBulb', position: { x: 22*gs, y: 14*gs }, properties: {}, inputs: [{ nodeId: 'led_q1.input.0', connectedTo: null }], outputs: [] },
        { id: 'led_q2', type: 'LightBulb', position: { x: 32*gs, y: 14*gs }, properties: {}, inputs: [{ nodeId: 'led_q2.input.0', connectedTo: null }], outputs: [] }
      ],
      wires: [
        // Clock to all T flip-flops
        { id: 'w_clk0', from: { componentId: 'clk1', nodeId: 'clk1.output.0' }, to: { componentId: 'dff0', nodeId: 'dff0.input.1' } },
        // T inputs tied HIGH (always toggle on clock)
        { id: 'w_t0', from: { componentId: 'high1', nodeId: 'high1.output.0' }, to: { componentId: 'dff0', nodeId: 'dff0.input.0' } },
        { id: 'w_t1', from: { componentId: 'high1', nodeId: 'high1.output.0' }, to: { componentId: 'dff1', nodeId: 'dff1.input.0' } },
        { id: 'w_t2', from: { componentId: 'high1', nodeId: 'high1.output.0' }, to: { componentId: 'dff2', nodeId: 'dff2.input.0' } },
        // Ripple clock: each Q-bar clocks the next stage
        { id: 'w_ripple1', from: { componentId: 'dff0', nodeId: 'dff0.output.1' }, to: { componentId: 'dff1', nodeId: 'dff1.input.1' } },
        { id: 'w_ripple2', from: { componentId: 'dff1', nodeId: 'dff1.output.1' }, to: { componentId: 'dff2', nodeId: 'dff2.input.1' } },
        // LEDs for output
        { id: 'w_q0', from: { componentId: 'dff0', nodeId: 'dff0.output.0' }, to: { componentId: 'led_q0', nodeId: 'led_q0.input.0' } },
        { id: 'w_q1', from: { componentId: 'dff1', nodeId: 'dff1.output.0' }, to: { componentId: 'led_q1', nodeId: 'led_q1.input.0' } },
        { id: 'w_q2', from: { componentId: 'dff2', nodeId: 'dff2.output.0' }, to: { componentId: 'led_q2', nodeId: 'led_q2.input.0' } }
      ]
    };
  }

  static priorityEncoder() {
    const gs = 20;
    return {
      components: [
        { id: 'sw_d0', type: 'ToggleSwitch', position: { x: 2*gs, y: 2*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_d0.output.0', value: false }] },
        { id: 'sw_d1', type: 'ToggleSwitch', position: { x: 2*gs, y: 6*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_d1.output.0', value: false }] },
        { id: 'sw_d2', type: 'ToggleSwitch', position: { x: 2*gs, y: 10*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_d2.output.0', value: false }] },
        { id: 'sw_d3', type: 'ToggleSwitch', position: { x: 2*gs, y: 14*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_d3.output.0', value: false }] },
        { id: 'not1', type: 'NOT', position: { x: 9*gs, y: 6*gs }, properties: {}, inputs: [{ nodeId: 'not1.input.0', connectedTo: null }], outputs: [{ nodeId: 'not1.output.0', value: true }] },
        { id: 'not2', type: 'NOT', position: { x: 9*gs, y: 10*gs }, properties: {}, inputs: [{ nodeId: 'not2.input.0', connectedTo: null }], outputs: [{ nodeId: 'not2.output.0', value: true }] },
        // A1 = D3 OR (D2 AND NOT D3)
        { id: 'and_a1', type: 'AND', position: { x: 16*gs, y: 10*gs }, properties: {}, inputs: [{ nodeId: 'and_a1.input.0', connectedTo: null }, { nodeId: 'and_a1.input.1', connectedTo: null }], outputs: [{ nodeId: 'and_a1.output.0', value: false }] },
        { id: 'or_a1', type: 'OR', position: { x: 23*gs, y: 8*gs }, properties: {}, inputs: [{ nodeId: 'or_a1.input.0', connectedTo: null }, { nodeId: 'or_a1.input.1', connectedTo: null }], outputs: [{ nodeId: 'or_a1.output.0', value: false }] },
        // A0 = D3 OR (D1 AND NOT D2 AND NOT D3)
        { id: 'and_a0_1', type: 'AND', position: { x: 16*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'and_a0_1.input.0', connectedTo: null }, { nodeId: 'and_a0_1.input.1', connectedTo: null }], outputs: [{ nodeId: 'and_a0_1.output.0', value: false }] },
        { id: 'and_a0_2', type: 'AND', position: { x: 23*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'and_a0_2.input.0', connectedTo: null }, { nodeId: 'and_a0_2.input.1', connectedTo: null }], outputs: [{ nodeId: 'and_a0_2.output.0', value: false }] },
        { id: 'or_a0', type: 'OR', position: { x: 30*gs, y: 4*gs }, properties: {}, inputs: [{ nodeId: 'or_a0.input.0', connectedTo: null }, { nodeId: 'or_a0.input.1', connectedTo: null }], outputs: [{ nodeId: 'or_a0.output.0', value: false }] },
        // V = D0 OR D1 OR D2 OR D3
        { id: 'or_v1', type: 'OR', position: { x: 16*gs, y: 16*gs }, properties: {}, inputs: [{ nodeId: 'or_v1.input.0', connectedTo: null }, { nodeId: 'or_v1.input.1', connectedTo: null }], outputs: [{ nodeId: 'or_v1.output.0', value: false }] },
        { id: 'or_v2', type: 'OR', position: { x: 23*gs, y: 16*gs }, properties: {}, inputs: [{ nodeId: 'or_v2.input.0', connectedTo: null }, { nodeId: 'or_v2.input.1', connectedTo: null }], outputs: [{ nodeId: 'or_v2.output.0', value: false }] },
        { id: 'led_a0', type: 'LightBulb', position: { x: 37*gs, y: 4*gs }, properties: {}, inputs: [{ nodeId: 'led_a0.input.0', connectedTo: null }], outputs: [] },
        { id: 'led_a1', type: 'LightBulb', position: { x: 37*gs, y: 8*gs }, properties: {}, inputs: [{ nodeId: 'led_a1.input.0', connectedTo: null }], outputs: [] },
        { id: 'led_v', type: 'LightBulb', position: { x: 30*gs, y: 16*gs }, properties: {}, inputs: [{ nodeId: 'led_v.input.0', connectedTo: null }], outputs: [] }
      ],
      wires: [
        // NOT gates for D2, D3
        { id: 'w_not2', from: { componentId: 'sw_d2', nodeId: 'sw_d2.output.0' }, to: { componentId: 'not2', nodeId: 'not2.input.0' } },
        // A1 logic: D3 OR (D2 AND NOT_D3)
        { id: 'w_a1_and1', from: { componentId: 'sw_d2', nodeId: 'sw_d2.output.0' }, to: { componentId: 'and_a1', nodeId: 'and_a1.input.0' } },
        { id: 'w_a1_or', from: { componentId: 'and_a1', nodeId: 'and_a1.output.0' }, to: { componentId: 'or_a1', nodeId: 'or_a1.input.1' } },
        { id: 'w_a1_d3', from: { componentId: 'sw_d3', nodeId: 'sw_d3.output.0' }, to: { componentId: 'or_a1', nodeId: 'or_a1.input.0' } },
        // A0 logic: D3 OR (D1 AND NOT_D2)
        { id: 'w_a0_and1', from: { componentId: 'sw_d1', nodeId: 'sw_d1.output.0' }, to: { componentId: 'and_a0_1', nodeId: 'and_a0_1.input.0' } },
        { id: 'w_a0_and2', from: { componentId: 'not2', nodeId: 'not2.output.0' }, to: { componentId: 'and_a0_1', nodeId: 'and_a0_1.input.1' } },
        { id: 'w_a0_and2_in', from: { componentId: 'and_a0_1', nodeId: 'and_a0_1.output.0' }, to: { componentId: 'and_a0_2', nodeId: 'and_a0_2.input.0' } },
        { id: 'w_a0_or', from: { componentId: 'and_a0_2', nodeId: 'and_a0_2.output.0' }, to: { componentId: 'or_a0', nodeId: 'or_a0.input.1' } },
        { id: 'w_a0_d3', from: { componentId: 'sw_d3', nodeId: 'sw_d3.output.0' }, to: { componentId: 'or_a0', nodeId: 'or_a0.input.0' } },
        // Valid output
        { id: 'w_v1', from: { componentId: 'sw_d0', nodeId: 'sw_d0.output.0' }, to: { componentId: 'or_v1', nodeId: 'or_v1.input.0' } },
        { id: 'w_v2', from: { componentId: 'sw_d1', nodeId: 'sw_d1.output.0' }, to: { componentId: 'or_v1', nodeId: 'or_v1.input.1' } },
        { id: 'w_v3', from: { componentId: 'or_v1', nodeId: 'or_v1.output.0' }, to: { componentId: 'or_v2', nodeId: 'or_v2.input.0' } },
        { id: 'w_v4', from: { componentId: 'sw_d3', nodeId: 'sw_d3.output.0' }, to: { componentId: 'or_v2', nodeId: 'or_v2.input.1' } },
        // LEDs
        { id: 'w_led_a0', from: { componentId: 'or_a0', nodeId: 'or_a0.output.0' }, to: { componentId: 'led_a0', nodeId: 'led_a0.input.0' } },
        { id: 'w_led_a1', from: { componentId: 'or_a1', nodeId: 'or_a1.output.0' }, to: { componentId: 'led_a1', nodeId: 'led_a1.input.0' } },
        { id: 'w_led_v', from: { componentId: 'or_v2', nodeId: 'or_v2.output.0' }, to: { componentId: 'led_v', nodeId: 'led_v.input.0' } }
      ]
    };
  }
}
