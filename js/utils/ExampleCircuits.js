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
        name: 'SR Latch',
        description: 'A Set-Reset latch using NOR gates. The simplest sequential circuit with memory.',
        data: ExampleCircuits.srLatch
      },
      {
        id: 'd-latch',
        name: 'D Latch',
        description: 'A D Latch (transparent latch) that stores data when Enable is HIGH.',
        data: ExampleCircuits.dLatch
      },
      {
        id: '2-to-1-mux',
        name: '2:1 Multiplexer',
        description: 'A 2-to-1 multiplexer that selects between two inputs based on a select line.',
        data: ExampleCircuits.multiplexer
      },
      {
        id: 'binary-counter',
        name: '2-Bit Counter',
        description: 'A 2-bit binary counter using D flip-flops. Counts up on each clock pulse.',
        data: ExampleCircuits.binaryCounter
      },
      {
        id: '4-to-1-mux',
        name: '4:1 Multiplexer',
        description: 'A 4-to-1 multiplexer that selects one of four inputs using two select lines. Built from three 2:1 multiplexers.',
        data: ExampleCircuits.fourToOnMultiplexer
      },
      {
        id: 'jk-flip-flop',
        name: 'JK Flip-Flop Circuit',
        description: 'A JK flip-flop built from basic gates. J=K=0 holds state, J=K=1 toggles, J=1/K=0 sets, J=0/K=1 resets.',
        data: ExampleCircuits.jkFlipFlopCircuit
      },
      {
        id: '3-bit-counter',
        name: '3-Bit Ripple Counter',
        description: 'A 3-bit ripple counter using D flip-flops with inverted feedback. Counts 0-7 on clock pulses.',
        data: ExampleCircuits.threeBitCounter
      },
      {
        id: 'priority-encoder',
        name: '4:2 Priority Encoder',
        description: 'A 4-input priority encoder that outputs the binary index of the highest-priority active input.',
        data: ExampleCircuits.priorityEncoder
      },
      {
        id: '2-bit-comparator',
        name: '2-Bit Comparator',
        description: 'Compares two 2-bit numbers A and B. Outputs indicate A>B, A=B, or A<B.',
        data: ExampleCircuits.twoBitComparator
      },
      {
        id: 'sr-flipflop-clock',
        name: 'Clocked SR Flip-Flop',
        description: 'A clocked SR flip-flop using AND gates and a NOR latch. Only changes state when Clock is HIGH.',
        data: ExampleCircuits.clockedSRFlipFlop
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

  /* ================================================================
   *  ADVANCED EXAMPLE CIRCUITS (New)
   * ================================================================ */

  /**
   * 4:1 Multiplexer — selects one of 4 inputs using 2 select lines.
   * Built from three 2:1 MUX stages.
   */
  static fourToOnMultiplexer() {
    const gs = 20;
    return {
      components: [
        // 4 data inputs
        { id: 'sw_d0', type: 'ToggleSwitch', position: { x: 2*gs, y: 2*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_d0.output.0', value: false }] },
        { id: 'sw_d1', type: 'ToggleSwitch', position: { x: 2*gs, y: 5*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_d1.output.0', value: false }] },
        { id: 'sw_d2', type: 'ToggleSwitch', position: { x: 2*gs, y: 10*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_d2.output.0', value: false }] },
        { id: 'sw_d3', type: 'ToggleSwitch', position: { x: 2*gs, y: 13*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_d3.output.0', value: false }] },
        // 2 select lines
        { id: 'sw_s0', type: 'ToggleSwitch', position: { x: 2*gs, y: 18*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_s0.output.0', value: false }] },
        { id: 'sw_s1', type: 'ToggleSwitch', position: { x: 2*gs, y: 21*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_s1.output.0', value: false }] },
        // Stage 1: two 2:1 MUXes (S0 selects between pairs)
        // MUX A: selects D0 or D1 based on S0
        { id: 'not_s0', type: 'NOT', position: { x: 9*gs, y: 18*gs }, properties: {}, inputs: [{ nodeId: 'not_s0.input.0', connectedTo: null }], outputs: [{ nodeId: 'not_s0.output.0', value: false }] },
        { id: 'and_a0', type: 'AND', position: { x: 14*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'and_a0.input.0', connectedTo: null }, { nodeId: 'and_a0.input.1', connectedTo: null }], outputs: [{ nodeId: 'and_a0.output.0', value: false }] },
        { id: 'and_a1', type: 'AND', position: { x: 14*gs, y: 6*gs }, properties: {}, inputs: [{ nodeId: 'and_a1.input.0', connectedTo: null }, { nodeId: 'and_a1.input.1', connectedTo: null }], outputs: [{ nodeId: 'and_a1.output.0', value: false }] },
        { id: 'or_a', type: 'OR', position: { x: 20*gs, y: 3*gs }, properties: {}, inputs: [{ nodeId: 'or_a.input.0', connectedTo: null }, { nodeId: 'or_a.input.1', connectedTo: null }], outputs: [{ nodeId: 'or_a.output.0', value: false }] },
        // MUX B: selects D2 or D3 based on S0
        { id: 'and_b0', type: 'AND', position: { x: 14*gs, y: 10*gs }, properties: {}, inputs: [{ nodeId: 'and_b0.input.0', connectedTo: null }, { nodeId: 'and_b0.input.1', connectedTo: null }], outputs: [{ nodeId: 'and_b0.output.0', value: false }] },
        { id: 'and_b1', type: 'AND', position: { x: 14*gs, y: 14*gs }, properties: {}, inputs: [{ nodeId: 'and_b1.input.0', connectedTo: null }, { nodeId: 'and_b1.input.1', connectedTo: null }], outputs: [{ nodeId: 'and_b1.output.0', value: false }] },
        { id: 'or_b', type: 'OR', position: { x: 20*gs, y: 11*gs }, properties: {}, inputs: [{ nodeId: 'or_b.input.0', connectedTo: null }, { nodeId: 'or_b.input.1', connectedTo: null }], outputs: [{ nodeId: 'or_b.output.0', value: false }] },
        // Stage 2: MUX C selects MUX_A or MUX_B based on S1
        { id: 'not_s1', type: 'NOT', position: { x: 9*gs, y: 22*gs }, properties: {}, inputs: [{ nodeId: 'not_s1.input.0', connectedTo: null }], outputs: [{ nodeId: 'not_s1.output.0', value: false }] },
        { id: 'and_c0', type: 'AND', position: { x: 26*gs, y: 3*gs }, properties: {}, inputs: [{ nodeId: 'and_c0.input.0', connectedTo: null }, { nodeId: 'and_c0.input.1', connectedTo: null }], outputs: [{ nodeId: 'and_c0.output.0', value: false }] },
        { id: 'and_c1', type: 'AND', position: { x: 26*gs, y: 10*gs }, properties: {}, inputs: [{ nodeId: 'and_c1.input.0', connectedTo: null }, { nodeId: 'and_c1.input.1', connectedTo: null }], outputs: [{ nodeId: 'and_c1.output.0', value: false }] },
        { id: 'or_c', type: 'OR', position: { x: 32*gs, y: 6*gs }, properties: {}, inputs: [{ nodeId: 'or_c.input.0', connectedTo: null }, { nodeId: 'or_c.input.1', connectedTo: null }], outputs: [{ nodeId: 'or_c.output.0', value: false }] },
        // Output
        { id: 'led_out', type: 'LightBulb', position: { x: 38*gs, y: 6*gs }, properties: {}, inputs: [{ nodeId: 'led_out.input.0', connectedTo: null }], outputs: [] }
      ],
      wires: [
        // S0, S1 to inverters
        { id: 'w1', from: { componentId: 'sw_s0', nodeId: 'sw_s0.output.0' }, to: { componentId: 'not_s0', nodeId: 'not_s0.input.0' } },
        { id: 'w2', from: { componentId: 'sw_s1', nodeId: 'sw_s1.output.0' }, to: { componentId: 'not_s1', nodeId: 'not_s1.input.0' } },
        // MUX A: D0 AND NOT(S0), D1 AND S0
        { id: 'w3', from: { componentId: 'sw_d0', nodeId: 'sw_d0.output.0' }, to: { componentId: 'and_a0', nodeId: 'and_a0.input.0' } },
        { id: 'w4', from: { componentId: 'not_s0', nodeId: 'not_s0.output.0' }, to: { componentId: 'and_a0', nodeId: 'and_a0.input.1' } },
        { id: 'w5', from: { componentId: 'sw_d1', nodeId: 'sw_d1.output.0' }, to: { componentId: 'and_a1', nodeId: 'and_a1.input.0' } },
        { id: 'w6', from: { componentId: 'sw_s0', nodeId: 'sw_s0.output.0' }, to: { componentId: 'and_a1', nodeId: 'and_a1.input.1' } },
        { id: 'w7', from: { componentId: 'and_a0', nodeId: 'and_a0.output.0' }, to: { componentId: 'or_a', nodeId: 'or_a.input.0' } },
        { id: 'w8', from: { componentId: 'and_a1', nodeId: 'and_a1.output.0' }, to: { componentId: 'or_a', nodeId: 'or_a.input.1' } },
        // MUX B: D2 AND NOT(S0), D3 AND S0
        { id: 'w9', from: { componentId: 'sw_d2', nodeId: 'sw_d2.output.0' }, to: { componentId: 'and_b0', nodeId: 'and_b0.input.0' } },
        { id: 'w10', from: { componentId: 'not_s0', nodeId: 'not_s0.output.0' }, to: { componentId: 'and_b0', nodeId: 'and_b0.input.1' } },
        { id: 'w11', from: { componentId: 'sw_d3', nodeId: 'sw_d3.output.0' }, to: { componentId: 'and_b1', nodeId: 'and_b1.input.0' } },
        { id: 'w12', from: { componentId: 'sw_s0', nodeId: 'sw_s0.output.0' }, to: { componentId: 'and_b1', nodeId: 'and_b1.input.1' } },
        { id: 'w13', from: { componentId: 'and_b0', nodeId: 'and_b0.output.0' }, to: { componentId: 'or_b', nodeId: 'or_b.input.0' } },
        { id: 'w14', from: { componentId: 'and_b1', nodeId: 'and_b1.output.0' }, to: { componentId: 'or_b', nodeId: 'or_b.input.1' } },
        // MUX C: MUX_A AND NOT(S1), MUX_B AND S1
        { id: 'w15', from: { componentId: 'or_a', nodeId: 'or_a.output.0' }, to: { componentId: 'and_c0', nodeId: 'and_c0.input.0' } },
        { id: 'w16', from: { componentId: 'not_s1', nodeId: 'not_s1.output.0' }, to: { componentId: 'and_c0', nodeId: 'and_c0.input.1' } },
        { id: 'w17', from: { componentId: 'or_b', nodeId: 'or_b.output.0' }, to: { componentId: 'and_c1', nodeId: 'and_c1.input.0' } },
        { id: 'w18', from: { componentId: 'sw_s1', nodeId: 'sw_s1.output.0' }, to: { componentId: 'and_c1', nodeId: 'and_c1.input.1' } },
        { id: 'w19', from: { componentId: 'and_c0', nodeId: 'and_c0.output.0' }, to: { componentId: 'or_c', nodeId: 'or_c.input.0' } },
        { id: 'w20', from: { componentId: 'and_c1', nodeId: 'and_c1.output.0' }, to: { componentId: 'or_c', nodeId: 'or_c.input.1' } },
        // Output
        { id: 'w21', from: { componentId: 'or_c', nodeId: 'or_c.output.0' }, to: { componentId: 'led_out', nodeId: 'led_out.input.0' } }
      ]
    };
  }

  /**
   * JK Flip-Flop built from basic gates.
   * J=K=0: hold, J=K=1: toggle, J=1/K=0: set, J=0/K=1: reset.
   */
  static jkFlipFlopCircuit() {
    const gs = 20;
    return {
      components: [
        { id: 'sw_j', type: 'ToggleSwitch', position: { x: 2*gs, y: 2*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_j.output.0', value: false }] },
        { id: 'sw_clk', type: 'ToggleSwitch', position: { x: 2*gs, y: 8*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_clk.output.0', value: false }] },
        { id: 'sw_k', type: 'ToggleSwitch', position: { x: 2*gs, y: 14*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_k.output.0', value: false }] },
        // AND gates: J AND CLK, K AND CLK
        { id: 'and_j', type: 'AND', position: { x: 10*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'and_j.input.0', connectedTo: null }, { nodeId: 'and_j.input.1', connectedTo: null }], outputs: [{ nodeId: 'and_j.output.0', value: false }] },
        { id: 'and_k', type: 'AND', position: { x: 10*gs, y: 14*gs }, properties: {}, inputs: [{ nodeId: 'and_k.input.0', connectedTo: null }, { nodeId: 'and_k.input.1', connectedTo: null }], outputs: [{ nodeId: 'and_k.output.0', value: false }] },
        // NOR latch
        { id: 'nor1', type: 'NOR', position: { x: 20*gs, y: 3*gs }, properties: {}, inputs: [{ nodeId: 'nor1.input.0', connectedTo: null }, { nodeId: 'nor1.input.1', connectedTo: null }], outputs: [{ nodeId: 'nor1.output.0', value: false }] },
        { id: 'nor2', type: 'NOR', position: { x: 20*gs, y: 12*gs }, properties: {}, inputs: [{ nodeId: 'nor2.input.0', connectedTo: null }, { nodeId: 'nor2.input.1', connectedTo: null }], outputs: [{ nodeId: 'nor2.output.0', value: false }] },
        // Outputs
        { id: 'led_q', type: 'LightBulb', position: { x: 28*gs, y: 3*gs }, properties: {}, inputs: [{ nodeId: 'led_q.input.0', connectedTo: null }], outputs: [] },
        { id: 'led_nq', type: 'LightBulb', position: { x: 28*gs, y: 12*gs }, properties: {}, inputs: [{ nodeId: 'led_nq.input.0', connectedTo: null }], outputs: [] }
      ],
      wires: [
        // J AND CLK
        { id: 'w1', from: { componentId: 'sw_j', nodeId: 'sw_j.output.0' }, to: { componentId: 'and_j', nodeId: 'and_j.input.0' } },
        { id: 'w2', from: { componentId: 'sw_clk', nodeId: 'sw_clk.output.0' }, to: { componentId: 'and_j', nodeId: 'and_j.input.1' } },
        // K AND CLK
        { id: 'w3', from: { componentId: 'sw_k', nodeId: 'sw_k.output.0' }, to: { componentId: 'and_k', nodeId: 'and_k.input.0' } },
        { id: 'w4', from: { componentId: 'sw_clk', nodeId: 'sw_clk.output.0' }, to: { componentId: 'and_k', nodeId: 'and_k.input.1' } },
        // Cross-coupled NOR latch
        { id: 'w5', from: { componentId: 'and_j', nodeId: 'and_j.output.0' }, to: { componentId: 'nor1', nodeId: 'nor1.input.0' } },
        { id: 'w6', from: { componentId: 'and_k', nodeId: 'and_k.output.0' }, to: { componentId: 'nor2', nodeId: 'nor2.input.1' } },
        { id: 'w7', from: { componentId: 'nor1', nodeId: 'nor1.output.0' }, to: { componentId: 'nor2', nodeId: 'nor2.input.0' } },
        { id: 'w8', from: { componentId: 'nor2', nodeId: 'nor2.output.0' }, to: { componentId: 'nor1', nodeId: 'nor1.input.1' } },
        // Outputs
        { id: 'w9', from: { componentId: 'nor1', nodeId: 'nor1.output.0' }, to: { componentId: 'led_q', nodeId: 'led_q.input.0' } },
        { id: 'w10', from: { componentId: 'nor2', nodeId: 'nor2.output.0' }, to: { componentId: 'led_nq', nodeId: 'led_nq.input.0' } }
      ]
    };
  }

  /**
   * 3-Bit Ripple Counter — counts from 0 to 7 using D flip-flops.
   */
  static threeBitCounter() {
    const gs = 20;
    return {
      components: [
        { id: 'clk1', type: 'Clock', position: { x: 2*gs, y: 3*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'clk1.output.0', value: false }] },
        // Bit 0
        { id: 'dff0', type: 'D', position: { x: 10*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'dff0.input.0', connectedTo: null }, { nodeId: 'dff0.input.1', connectedTo: null }], outputs: [{ nodeId: 'dff0.output.0', value: false }, { nodeId: 'dff0.output.1', value: true }], internalState: { _state: { Q: false, nQ: true }, _prevClk: false } },
        { id: 'led_q0', type: 'LightBulb', position: { x: 10*gs, y: 9*gs }, properties: {}, inputs: [{ nodeId: 'led_q0.input.0', connectedTo: null }], outputs: [] },
        // Bit 1
        { id: 'dff1', type: 'D', position: { x: 20*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'dff1.input.0', connectedTo: null }, { nodeId: 'dff1.input.1', connectedTo: null }], outputs: [{ nodeId: 'dff1.output.0', value: false }, { nodeId: 'dff1.output.1', value: true }], internalState: { _state: { Q: false, nQ: true }, _prevClk: false } },
        { id: 'led_q1', type: 'LightBulb', position: { x: 20*gs, y: 9*gs }, properties: {}, inputs: [{ nodeId: 'led_q1.input.0', connectedTo: null }], outputs: [] },
        // Bit 2
        { id: 'dff2', type: 'D', position: { x: 30*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'dff2.input.0', connectedTo: null }, { nodeId: 'dff2.input.1', connectedTo: null }], outputs: [{ nodeId: 'dff2.output.0', value: false }, { nodeId: 'dff2.output.1', value: true }], internalState: { _state: { Q: false, nQ: true }, _prevClk: false } },
        { id: 'led_q2', type: 'LightBulb', position: { x: 30*gs, y: 9*gs }, properties: {}, inputs: [{ nodeId: 'led_q2.input.0', connectedTo: null }], outputs: [] }
      ],
      wires: [
        // Clock to bit 0 CLK input
        { id: 'w1', from: { componentId: 'clk1', nodeId: 'clk1.output.0' }, to: { componentId: 'dff0', nodeId: 'dff0.input.1' } },
        // Bit 0: Q-bar fed back to D input (toggle mode)
        { id: 'w2', from: { componentId: 'dff0', nodeId: 'dff0.output.1' }, to: { componentId: 'dff0', nodeId: 'dff0.input.0' } },
        // Bit 0 output
        { id: 'w3', from: { componentId: 'dff0', nodeId: 'dff0.output.0' }, to: { componentId: 'led_q0', nodeId: 'led_q0.input.0' } },
        // Bit 0 Q-bar clocks bit 1
        { id: 'w4', from: { componentId: 'dff0', nodeId: 'dff0.output.1' }, to: { componentId: 'dff1', nodeId: 'dff1.input.1' } },
        // Bit 1: Q-bar fed back to D input
        { id: 'w5', from: { componentId: 'dff1', nodeId: 'dff1.output.1' }, to: { componentId: 'dff1', nodeId: 'dff1.input.0' } },
        // Bit 1 output
        { id: 'w6', from: { componentId: 'dff1', nodeId: 'dff1.output.0' }, to: { componentId: 'led_q1', nodeId: 'led_q1.input.0' } },
        // Bit 1 Q-bar clocks bit 2
        { id: 'w7', from: { componentId: 'dff1', nodeId: 'dff1.output.1' }, to: { componentId: 'dff2', nodeId: 'dff2.input.1' } },
        // Bit 2: Q-bar fed back to D input
        { id: 'w8', from: { componentId: 'dff2', nodeId: 'dff2.output.1' }, to: { componentId: 'dff2', nodeId: 'dff2.input.0' } },
        // Bit 2 output
        { id: 'w9', from: { componentId: 'dff2', nodeId: 'dff2.output.0' }, to: { componentId: 'led_q2', nodeId: 'led_q2.input.0' } }
      ]
    };
  }

  /**
   * 4:2 Priority Encoder — outputs the binary index of the
   * highest-priority active input. I3 has highest priority.
   */
  static priorityEncoder() {
    const gs = 20;
    return {
      components: [
        // 4 inputs (I0=lowest, I3=highest priority)
        { id: 'sw_i0', type: 'ToggleSwitch', position: { x: 2*gs, y: 2*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_i0.output.0', value: false }] },
        { id: 'sw_i1', type: 'ToggleSwitch', position: { x: 2*gs, y: 5*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_i1.output.0', value: false }] },
        { id: 'sw_i2', type: 'ToggleSwitch', position: { x: 2*gs, y: 9*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_i2.output.0', value: false }] },
        { id: 'sw_i3', type: 'ToggleSwitch', position: { x: 2*gs, y: 13*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_i3.output.0', value: false }] },
        // Y1 = I3 OR (I2 AND NOT I3)
        // Simplified: Y1 = I3 OR I2 (since I3 overrides)
        // Actually: Y1 = I3 OR (I2 AND NOT I3)
        { id: 'not_i3_a', type: 'NOT', position: { x: 8*gs, y: 16*gs }, properties: {}, inputs: [{ nodeId: 'not_i3_a.input.0', connectedTo: null }], outputs: [{ nodeId: 'not_i3_a.output.0', value: false }] },
        { id: 'and_y1_2', type: 'AND', position: { x: 14*gs, y: 9*gs }, properties: {}, inputs: [{ nodeId: 'and_y1_2.input.0', connectedTo: null }, { nodeId: 'and_y1_2.input.1', connectedTo: null }], outputs: [{ nodeId: 'and_y1_2.output.0', value: false }] },
        { id: 'or_y1', type: 'OR', position: { x: 20*gs, y: 10*gs }, properties: {}, inputs: [{ nodeId: 'or_y1.input.0', connectedTo: null }, { nodeId: 'or_y1.input.1', connectedTo: null }], outputs: [{ nodeId: 'or_y1.output.0', value: false }] },
        // Y0 = I3 OR (I1 AND NOT I2 AND NOT I3)
        { id: 'not_i2', type: 'NOT', position: { x: 8*gs, y: 19*gs }, properties: {}, inputs: [{ nodeId: 'not_i2.input.0', connectedTo: null }], outputs: [{ nodeId: 'not_i2.output.0', value: false }] },
        { id: 'not_i3_b', type: 'NOT', position: { x: 8*gs, y: 22*gs }, properties: {}, inputs: [{ nodeId: 'not_i3_b.input.0', connectedTo: null }], outputs: [{ nodeId: 'not_i3_b.output.0', value: false }] },
        { id: 'and_y0_1', type: 'AND', position: { x: 14*gs, y: 3*gs }, properties: {}, inputs: [{ nodeId: 'and_y0_1.input.0', connectedTo: null }, { nodeId: 'and_y0_1.input.1', connectedTo: null }, { nodeId: 'and_y0_1.input.2', connectedTo: null }], outputs: [{ nodeId: 'and_y0_1.output.0', value: false }] },
        { id: 'or_y0', type: 'OR', position: { x: 20*gs, y: 4*gs }, properties: {}, inputs: [{ nodeId: 'or_y0.input.0', connectedTo: null }, { nodeId: 'or_y0.input.1', connectedTo: null }], outputs: [{ nodeId: 'or_y0.output.0', value: false }] },
        // Valid output V = I0 OR I1 OR I2 OR I3
        { id: 'or_v1', type: 'OR', position: { x: 10*gs, y: 24*gs }, properties: {}, inputs: [{ nodeId: 'or_v1.input.0', connectedTo: null }, { nodeId: 'or_v1.input.1', connectedTo: null }], outputs: [{ nodeId: 'or_v1.output.0', value: false }] },
        { id: 'or_v2', type: 'OR', position: { x: 16*gs, y: 24*gs }, properties: {}, inputs: [{ nodeId: 'or_v2.input.0', connectedTo: null }, { nodeId: 'or_v2.input.1', connectedTo: null }], outputs: [{ nodeId: 'or_v2.output.0', value: false }] },
        // Output LEDs
        { id: 'led_y0', type: 'LightBulb', position: { x: 27*gs, y: 4*gs }, properties: {}, inputs: [{ nodeId: 'led_y0.input.0', connectedTo: null }], outputs: [] },
        { id: 'led_y1', type: 'LightBulb', position: { x: 27*gs, y: 10*gs }, properties: {}, inputs: [{ nodeId: 'led_y1.input.0', connectedTo: null }], outputs: [] },
        { id: 'led_v', type: 'LightBulb', position: { x: 27*gs, y: 24*gs }, properties: {}, inputs: [{ nodeId: 'led_v.input.0', connectedTo: null }], outputs: [] }
      ],
      wires: [
        // Y1 logic: I3 OR (I2 AND NOT I3)
        { id: 'w1', from: { componentId: 'sw_i3', nodeId: 'sw_i3.output.0' }, to: { componentId: 'not_i3_a', nodeId: 'not_i3_a.input.0' } },
        { id: 'w2', from: { componentId: 'sw_i2', nodeId: 'sw_i2.output.0' }, to: { componentId: 'and_y1_2', nodeId: 'and_y1_2.input.0' } },
        { id: 'w3', from: { componentId: 'not_i3_a', nodeId: 'not_i3_a.output.0' }, to: { componentId: 'and_y1_2', nodeId: 'and_y1_2.input.1' } },
        { id: 'w4', from: { componentId: 'sw_i3', nodeId: 'sw_i3.output.0' }, to: { componentId: 'or_y1', nodeId: 'or_y1.input.0' } },
        { id: 'w5', from: { componentId: 'and_y1_2', nodeId: 'and_y1_2.output.0' }, to: { componentId: 'or_y1', nodeId: 'or_y1.input.1' } },
        // Y0 logic: I3 OR (I1 AND NOT I2 AND NOT I3)
        { id: 'w6', from: { componentId: 'sw_i2', nodeId: 'sw_i2.output.0' }, to: { componentId: 'not_i2', nodeId: 'not_i2.input.0' } },
        { id: 'w7', from: { componentId: 'sw_i3', nodeId: 'sw_i3.output.0' }, to: { componentId: 'not_i3_b', nodeId: 'not_i3_b.input.0' } },
        { id: 'w8', from: { componentId: 'sw_i1', nodeId: 'sw_i1.output.0' }, to: { componentId: 'and_y0_1', nodeId: 'and_y0_1.input.0' } },
        { id: 'w9', from: { componentId: 'not_i2', nodeId: 'not_i2.output.0' }, to: { componentId: 'and_y0_1', nodeId: 'and_y0_1.input.1' } },
        { id: 'w10', from: { componentId: 'not_i3_b', nodeId: 'not_i3_b.output.0' }, to: { componentId: 'and_y0_1', nodeId: 'and_y0_1.input.2' } },
        { id: 'w11', from: { componentId: 'sw_i3', nodeId: 'sw_i3.output.0' }, to: { componentId: 'or_y0', nodeId: 'or_y0.input.0' } },
        { id: 'w12', from: { componentId: 'and_y0_1', nodeId: 'and_y0_1.output.0' }, to: { componentId: 'or_y0', nodeId: 'or_y0.input.1' } },
        // Valid output
        { id: 'w13', from: { componentId: 'sw_i0', nodeId: 'sw_i0.output.0' }, to: { componentId: 'or_v1', nodeId: 'or_v1.input.0' } },
        { id: 'w14', from: { componentId: 'sw_i1', nodeId: 'sw_i1.output.0' }, to: { componentId: 'or_v1', nodeId: 'or_v1.input.1' } },
        { id: 'w15', from: { componentId: 'sw_i2', nodeId: 'sw_i2.output.0' }, to: { componentId: 'or_v2', nodeId: 'or_v2.input.0' } },
        { id: 'w16', from: { componentId: 'sw_i3', nodeId: 'sw_i3.output.0' }, to: { componentId: 'or_v2', nodeId: 'or_v2.input.1' } },
        // Output LEDs
        { id: 'w17', from: { componentId: 'or_y0', nodeId: 'or_y0.output.0' }, to: { componentId: 'led_y0', nodeId: 'led_y0.input.0' } },
        { id: 'w18', from: { componentId: 'or_y1', nodeId: 'or_y1.output.0' }, to: { componentId: 'led_y1', nodeId: 'led_y1.input.0' } },
        { id: 'w19', from: { componentId: 'or_v2', nodeId: 'or_v2.output.0' }, to: { componentId: 'led_v', nodeId: 'led_v.input.0' } }
      ]
    };
  }

  /**
   * 2-Bit Comparator — compares two 2-bit numbers A[1:0] and B[1:0].
   * Outputs: A_gt_B, A_eq_B, A_lt_B.
   */
  static twoBitComparator() {
    const gs = 20;
    return {
      components: [
        // A inputs
        { id: 'sw_a0', type: 'ToggleSwitch', position: { x: 2*gs, y: 2*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_a0.output.0', value: false }] },
        { id: 'sw_a1', type: 'ToggleSwitch', position: { x: 2*gs, y: 5*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_a1.output.0', value: false }] },
        // B inputs
        { id: 'sw_b0', type: 'ToggleSwitch', position: { x: 2*gs, y: 10*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_b0.output.0', value: false }] },
        { id: 'sw_b1', type: 'ToggleSwitch', position: { x: 2*gs, y: 13*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_b1.output.0', value: false }] },
        // XNOR for bit equality
        { id: 'xnor0', type: 'XNOR', position: { x: 10*gs, y: 5*gs }, properties: {}, inputs: [{ nodeId: 'xnor0.input.0', connectedTo: null }, { nodeId: 'xnor0.input.1', connectedTo: null }], outputs: [{ nodeId: 'xnor0.output.0', value: false }] },
        { id: 'xnor1', type: 'XNOR', position: { x: 10*gs, y: 10*gs }, properties: {}, inputs: [{ nodeId: 'xnor1.input.0', connectedTo: null }, { nodeId: 'xnor1.input.1', connectedTo: null }], outputs: [{ nodeId: 'xnor1.output.0', value: false }] },
        // A_eq_B = XNOR0 AND XNOR1
        { id: 'and_eq', type: 'AND', position: { x: 18*gs, y: 7*gs }, properties: {}, inputs: [{ nodeId: 'and_eq.input.0', connectedTo: null }, { nodeId: 'and_eq.input.1', connectedTo: null }], outputs: [{ nodeId: 'and_eq.output.0', value: false }] },
        // A_gt_B logic: A1>B1 OR (A1==B1 AND A0>B0)
        { id: 'and_gt0', type: 'AND', position: { x: 14*gs, y: 17*gs }, properties: {}, inputs: [{ nodeId: 'and_gt0.input.0', connectedTo: null }, { nodeId: 'and_gt0.input.1', connectedTo: null }], outputs: [{ nodeId: 'and_gt0.output.0', value: false }] },
        { id: 'and_gt1', type: 'AND', position: { x: 18*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'and_gt1.input.0', connectedTo: null }, { nodeId: 'and_gt1.input.1', connectedTo: null }], outputs: [{ nodeId: 'and_gt1.output.0', value: false }] },
        { id: 'or_gt', type: 'OR', position: { x: 24*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'or_gt.input.0', connectedTo: null }, { nodeId: 'or_gt.input.1', connectedTo: null }], outputs: [{ nodeId: 'or_gt.output.0', value: false }] },
        // A_lt_B logic: B1>A1 OR (A1==B1 AND B0>A0)
        { id: 'and_lt0', type: 'AND', position: { x: 14*gs, y: 20*gs }, properties: {}, inputs: [{ nodeId: 'and_lt0.input.0', connectedTo: null }, { nodeId: 'and_lt0.input.1', connectedTo: null }], outputs: [{ nodeId: 'and_lt0.output.0', value: false }] },
        { id: 'and_lt1', type: 'AND', position: { x: 18*gs, y: 13*gs }, properties: {}, inputs: [{ nodeId: 'and_lt1.input.0', connectedTo: null }, { nodeId: 'and_lt1.input.1', connectedTo: null }], outputs: [{ nodeId: 'and_lt1.output.0', value: false }] },
        { id: 'or_lt', type: 'OR', position: { x: 24*gs, y: 13*gs }, properties: {}, inputs: [{ nodeId: 'or_lt.input.0', connectedTo: null }, { nodeId: 'or_lt.input.1', connectedTo: null }], outputs: [{ nodeId: 'or_lt.output.0', value: false }] },
        // Output LEDs
        { id: 'led_gt', type: 'LightBulb', position: { x: 30*gs, y: 2*gs }, properties: {}, inputs: [{ nodeId: 'led_gt.input.0', connectedTo: null }], outputs: [] },
        { id: 'led_eq', type: 'LightBulb', position: { x: 30*gs, y: 7*gs }, properties: {}, inputs: [{ nodeId: 'led_eq.input.0', connectedTo: null }], outputs: [] },
        { id: 'led_lt', type: 'LightBulb', position: { x: 30*gs, y: 13*gs }, properties: {}, inputs: [{ nodeId: 'led_lt.input.0', connectedTo: null }], outputs: [] }
      ],
      wires: [
        // XNOR for bit equality
        { id: 'w1', from: { componentId: 'sw_a0', nodeId: 'sw_a0.output.0' }, to: { componentId: 'xnor0', nodeId: 'xnor0.input.0' } },
        { id: 'w2', from: { componentId: 'sw_b0', nodeId: 'sw_b0.output.0' }, to: { componentId: 'xnor0', nodeId: 'xnor0.input.1' } },
        { id: 'w3', from: { componentId: 'sw_a1', nodeId: 'sw_a1.output.0' }, to: { componentId: 'xnor1', nodeId: 'xnor1.input.0' } },
        { id: 'w4', from: { componentId: 'sw_b1', nodeId: 'sw_b1.output.0' }, to: { componentId: 'xnor1', nodeId: 'xnor1.input.1' } },
        // A_eq_B
        { id: 'w5', from: { componentId: 'xnor0', nodeId: 'xnor0.output.0' }, to: { componentId: 'and_eq', nodeId: 'and_eq.input.0' } },
        { id: 'w6', from: { componentId: 'xnor1', nodeId: 'xnor1.output.0' }, to: { componentId: 'and_eq', nodeId: 'and_eq.input.1' } },
        // A_gt_B: A1 AND NOT B1
        { id: 'w7', from: { componentId: 'sw_a1', nodeId: 'sw_a1.output.0' }, to: { componentId: 'and_gt0', nodeId: 'and_gt0.input.0' } },
        { id: 'w8', from: { componentId: 'sw_b1', nodeId: 'sw_b1.output.0' }, to: { componentId: 'and_gt0', nodeId: 'and_gt0.input.1' } },
        // (A1==B1) AND (A0 AND NOT B0)
        { id: 'w9', from: { componentId: 'xnor1', nodeId: 'xnor1.output.0' }, to: { componentId: 'and_gt1', nodeId: 'and_gt1.input.0' } },
        { id: 'w10', from: { componentId: 'sw_a0', nodeId: 'sw_a0.output.0' }, to: { componentId: 'and_gt1', nodeId: 'and_gt1.input.1' } },
        { id: 'w11', from: { componentId: 'and_gt0', nodeId: 'and_gt0.output.0' }, to: { componentId: 'or_gt', nodeId: 'or_gt.input.0' } },
        { id: 'w12', from: { componentId: 'and_gt1', nodeId: 'and_gt1.output.0' }, to: { componentId: 'or_gt', nodeId: 'or_gt.input.1' } },
        // A_lt_B: B1 AND NOT A1
        { id: 'w13', from: { componentId: 'sw_b1', nodeId: 'sw_b1.output.0' }, to: { componentId: 'and_lt0', nodeId: 'and_lt0.input.0' } },
        { id: 'w14', from: { componentId: 'sw_a1', nodeId: 'sw_a1.output.0' }, to: { componentId: 'and_lt0', nodeId: 'and_lt0.input.1' } },
        // (A1==B1) AND (B0 AND NOT A0)
        { id: 'w15', from: { componentId: 'xnor1', nodeId: 'xnor1.output.0' }, to: { componentId: 'and_lt1', nodeId: 'and_lt1.input.0' } },
        { id: 'w16', from: { componentId: 'sw_b0', nodeId: 'sw_b0.output.0' }, to: { componentId: 'and_lt1', nodeId: 'and_lt1.input.1' } },
        { id: 'w17', from: { componentId: 'and_lt0', nodeId: 'and_lt0.output.0' }, to: { componentId: 'or_lt', nodeId: 'or_lt.input.0' } },
        { id: 'w18', from: { componentId: 'and_lt1', nodeId: 'and_lt1.output.0' }, to: { componentId: 'or_lt', nodeId: 'or_lt.input.1' } },
        // Output LEDs
        { id: 'w19', from: { componentId: 'or_gt', nodeId: 'or_gt.output.0' }, to: { componentId: 'led_gt', nodeId: 'led_gt.input.0' } },
        { id: 'w20', from: { componentId: 'and_eq', nodeId: 'and_eq.output.0' }, to: { componentId: 'led_eq', nodeId: 'led_eq.input.0' } },
        { id: 'w21', from: { componentId: 'or_lt', nodeId: 'or_lt.output.0' }, to: { componentId: 'led_lt', nodeId: 'led_lt.input.0' } }
      ]
    };
  }

  /**
   * Clocked SR Flip-Flop — SR latch with clock gating.
   * Only changes state when Clock is HIGH.
   */
  static clockedSRFlipFlop() {
    const gs = 20;
    return {
      components: [
        { id: 'sw_s', type: 'ToggleSwitch', position: { x: 2*gs, y: 2*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_s.output.0', value: false }] },
        { id: 'sw_clk', type: 'ToggleSwitch', position: { x: 2*gs, y: 6*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_clk.output.0', value: false }] },
        { id: 'sw_r', type: 'ToggleSwitch', position: { x: 2*gs, y: 14*gs }, properties: {}, inputs: [], outputs: [{ nodeId: 'sw_r.output.0', value: false }] },
        // AND gates for clock gating
        { id: 'and_s', type: 'AND', position: { x: 10*gs, y: 3*gs }, properties: {}, inputs: [{ nodeId: 'and_s.input.0', connectedTo: null }, { nodeId: 'and_s.input.1', connectedTo: null }], outputs: [{ nodeId: 'and_s.output.0', value: false }] },
        { id: 'and_r', type: 'AND', position: { x: 10*gs, y: 12*gs }, properties: {}, inputs: [{ nodeId: 'and_r.input.0', connectedTo: null }, { nodeId: 'and_r.input.1', connectedTo: null }], outputs: [{ nodeId: 'and_r.output.0', value: false }] },
        // NOR latch
        { id: 'nor1', type: 'NOR', position: { x: 18*gs, y: 3*gs }, properties: {}, inputs: [{ nodeId: 'nor1.input.0', connectedTo: null }, { nodeId: 'nor1.input.1', connectedTo: null }], outputs: [{ nodeId: 'nor1.output.0', value: false }] },
        { id: 'nor2', type: 'NOR', position: { x: 18*gs, y: 11*gs }, properties: {}, inputs: [{ nodeId: 'nor2.input.0', connectedTo: null }, { nodeId: 'nor2.input.1', connectedTo: null }], outputs: [{ nodeId: 'nor2.output.0', value: false }] },
        // Outputs
        { id: 'led_q', type: 'LightBulb', position: { x: 26*gs, y: 3*gs }, properties: {}, inputs: [{ nodeId: 'led_q.input.0', connectedTo: null }], outputs: [] },
        { id: 'led_nq', type: 'LightBulb', position: { x: 26*gs, y: 11*gs }, properties: {}, inputs: [{ nodeId: 'led_nq.input.0', connectedTo: null }], outputs: [] }
      ],
      wires: [
        // S AND CLK
        { id: 'w1', from: { componentId: 'sw_s', nodeId: 'sw_s.output.0' }, to: { componentId: 'and_s', nodeId: 'and_s.input.0' } },
        { id: 'w2', from: { componentId: 'sw_clk', nodeId: 'sw_clk.output.0' }, to: { componentId: 'and_s', nodeId: 'and_s.input.1' } },
        // R AND CLK
        { id: 'w3', from: { componentId: 'sw_r', nodeId: 'sw_r.output.0' }, to: { componentId: 'and_r', nodeId: 'and_r.input.0' } },
        { id: 'w4', from: { componentId: 'sw_clk', nodeId: 'sw_clk.output.0' }, to: { componentId: 'and_r', nodeId: 'and_r.input.1' } },
        // Cross-coupled NOR latch
        { id: 'w5', from: { componentId: 'and_s', nodeId: 'and_s.output.0' }, to: { componentId: 'nor1', nodeId: 'nor1.input.0' } },
        { id: 'w6', from: { componentId: 'and_r', nodeId: 'and_r.output.0' }, to: { componentId: 'nor2', nodeId: 'nor2.input.1' } },
        { id: 'w7', from: { componentId: 'nor1', nodeId: 'nor1.output.0' }, to: { componentId: 'nor2', nodeId: 'nor2.input.0' } },
        { id: 'w8', from: { componentId: 'nor2', nodeId: 'nor2.output.0' }, to: { componentId: 'nor1', nodeId: 'nor1.input.1' } },
        // Outputs
        { id: 'w9', from: { componentId: 'nor1', nodeId: 'nor1.output.0' }, to: { componentId: 'led_q', nodeId: 'led_q.input.0' } },
        { id: 'w10', from: { componentId: 'nor2', nodeId: 'nor2.output.0' }, to: { componentId: 'led_nq', nodeId: 'led_nq.input.0' } }
      ]
    };
  }
}
