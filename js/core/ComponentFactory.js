import { Component } from './Component.js';
import { AndGate } from './gates/AndGate.js';
import { OrGate } from './gates/OrGate.js';
import { NotGate } from './gates/NotGate.js';
import { NandGate } from './gates/NandGate.js';
import { NorGate } from './gates/NorGate.js';
import { XorGate } from './gates/XorGate.js';
import { XnorGate } from './gates/XnorGate.js';
import { BufferGate } from './gates/BufferGate.js';
import { TriStateBuffer } from './gates/TriStateBuffer.js';
import { HalfAdder } from './chips/HalfAdder.js';
import { FullAdder } from './chips/FullAdder.js';
import { Multiplexer } from './chips/Multiplexer.js';
import { ToggleSwitch } from './io/ToggleSwitch.js';
import { DipSwitch } from './io/DipSwitch.js';
import { LightBulb } from './io/LightBulb.js';
import { SevenSegment } from './io/SevenSegment.js';
import { LogicProbe } from './io/LogicProbe.js';
import { Clock } from './io/Clock.js';
import { HighConstant } from './io/HighConstant.js';
import { LowConstant } from './io/LowConstant.js';
import { LedArray } from './io/LedArray.js';
import { SRFlipFlop } from './flipflops/SRFlipFlop.js';
import { SRLatch } from './flipflops/SRLatch.js';
import { DFlipFlop } from './flipflops/DFlipFlop.js';
import { JKFlipFlop } from './flipflops/JKFlipFlop.js';
import { TFlipFlop } from './flipflops/TFlipFlop.js';
import { ShiftRegister } from './flipflops/ShiftRegister.js';
import { Subcircuit } from './chips/Subcircuit.js';
import { generateId } from '../utils/IdGenerator.js';

export class ComponentFactory {
  constructor() {
    this.registry = {
      'AND': AndGate,
      'OR': OrGate,
      'NOT': NotGate,
      'NAND': NandGate,
      'NOR': NorGate,
      'XOR': XorGate,
      'XNOR': XnorGate,
      'Buffer': BufferGate,
      'TriState': TriStateBuffer,
      'HalfAdder': HalfAdder,
      'FullAdder': FullAdder,
      'Multiplexer': Multiplexer,
      'ToggleSwitch': ToggleSwitch,
      'DipSwitch': DipSwitch,
      'LightBulb': LightBulb,
      'SevenSegment': SevenSegment,
      'LogicProbe': LogicProbe,
      'Clock': Clock,
      'HighConstant': HighConstant,
      'LowConstant': LowConstant,
      'LedArray': LedArray,
      'SR': SRFlipFlop,
      'SRLatch': SRLatch,
      'D': DFlipFlop,
      'JK': JKFlipFlop,
      'T': TFlipFlop,
      'ShiftRegister': ShiftRegister,
      'Subcircuit': Subcircuit,
      // Backward compatibility: old saved projects may use these type names
      'DipSwitch8': DipSwitch,
      'ShiftRegister4': ShiftRegister
    };
  }

  getAvailableTypes() {
    // Hide backward-compat aliases from the sidebar
    const hidden = new Set(['DipSwitch8', 'ShiftRegister4']);
    return Object.keys(this.registry)
      .filter(key => !hidden.has(key))
      .map(key => ({
        type: key,
        label: this.registry[key].label || key,
        category: ComponentFactory.getCategory(key)
      }));
  }

  /**
   * Create a component from a type string.
   * Handles backward compatibility for old type names:
   *   - 'DipSwitch8' → DipSwitch (multi-switch, default 8)
   *   - 'ShiftRegister4' → ShiftRegister (4-bit for old saves)
   *   - Old 'DipSwitch' with 1 output → ToggleSwitch (old single toggle)
   */
  createComponent(type, id = null, componentData = null) {
    // Migration: old 'DipSwitch' type was the single toggle switch (1 output).
    // New 'DipSwitch' is the multi-switch DIP (2-8 outputs).
    // We distinguish by checking componentData.outputs.length from the save file.
    if (type === 'DipSwitch' && componentData) {
      const outputCount = componentData.outputs?.length || 0;
      if (outputCount <= 1) {
        // Old save: 'DipSwitch' = single toggle switch → ToggleSwitch
        type = 'ToggleSwitch';
      }
      // else: new save or already-migrated, 'DipSwitch' = multi DIP
    }

    const Cls = this.registry[type];
    if (!Cls) throw new Error(`Unknown component type: ${type}`);
    try {
      const compId = id || generateId(type);
      // Old ShiftRegister4 defaulted to 4 bits; new ShiftRegister defaults to 8
      if (type === 'ShiftRegister4') {
        return new Cls(compId, 4);
      }
      // Old DipSwitch8 → new DipSwitch, default 8
      if (type === 'DipSwitch8') {
        return new Cls(compId, 8);
      }
      // Subcircuit: restore from saved componentData
      if (type === 'Subcircuit' && componentData) {
        const name = componentData.properties?.name || 'Subcircuit';
        const innerCircuit = componentData.properties?.innerCircuit || null;
        const inputLabels = componentData.properties?.inputLabels || [];
        const outputLabels = componentData.properties?.outputLabels || [];
        const inputCount = componentData.inputs?.length || 1;
        const outputCount = componentData.outputs?.length || 1;
        return new Cls(compId, name, innerCircuit,
          inputLabels.length ? inputLabels : Array.from({length: inputCount}, (_, i) => `I${i}`),
          outputLabels.length ? outputLabels : Array.from({length: outputCount}, (_, i) => `O${i}`)
        );
      }
      return new Cls(compId);
    } catch (err) {
      console.error(`ComponentFactory: Failed to create "${type}"`, err);
      throw new Error(`Could not create component: ${type}`);
    }
  }

  static getCategory(type) {
    const map = {
      'AND':'Gates', 'OR':'Gates', 'NOT':'Gates',
      'NAND':'Gates', 'NOR':'Gates', 'XOR':'Gates', 'XNOR':'Gates', 'Buffer':'Gates',
      'TriState':'Gates',
      'HalfAdder':'Chips', 'FullAdder':'Chips', 'Multiplexer':'Chips',
      'SR':'Flip-Flops', 'SRLatch':'Flip-Flops', 'D':'Flip-Flops', 'JK':'Flip-Flops', 'T':'Flip-Flops',
      'ShiftRegister':'Flip-Flops', 'ShiftRegister4':'Flip-Flops', 'Subcircuit':'Chips',
      'ToggleSwitch':'Inputs', 'DipSwitch':'Inputs', 'DipSwitch8':'Inputs', 'Clock':'Inputs',
      'HighConstant':'Inputs', 'LowConstant':'Inputs',
      'LightBulb':'Outputs', 'SevenSegment':'Outputs', 'LogicProbe':'Outputs', 'LedArray':'Outputs'
    };
    return map[type] || 'Other';
  }
}
