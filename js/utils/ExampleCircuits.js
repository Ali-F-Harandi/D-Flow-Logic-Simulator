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
}
