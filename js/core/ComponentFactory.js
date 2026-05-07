import { AndGate } from './gates/AndGate.js';
import { OrGate } from './gates/OrGate.js';
import { NotGate } from './gates/NotGate.js';
import { NandGate } from './gates/NandGate.js';
import { NorGate } from './gates/NorGate.js';
import { XorGate } from './gates/XorGate.js';
import { XnorGate } from './gates/XnorGate.js';
import { HalfAdder } from './chips/HalfAdder.js';
import { FullAdder } from './chips/FullAdder.js';
import { Multiplexer } from './chips/Multiplexer.js';
import { DipSwitch } from './io/DipSwitch.js';
import { DipSwitch8 } from './io/DipSwitch8.js';
import { LightBulb } from './io/LightBulb.js';
import { SevenSegment } from './io/SevenSegment.js';
import { LogicProbe } from './io/LogicProbe.js';
import { Clock } from './io/Clock.js';
import { SRFlipFlop } from './flipflops/SRFlipFlop.js';
import { DFlipFlop } from './flipflops/DFlipFlop.js';
import { JKFlipFlop } from './flipflops/JKFlipFlop.js';
import { TFlipFlop } from './flipflops/TFlipFlop.js';
import { ShiftRegister4 } from './flipflops/ShiftRegister4.js';
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
      'HalfAdder': HalfAdder,
      'FullAdder': FullAdder,
      'Multiplexer': Multiplexer,
      'DipSwitch': DipSwitch,
      'DipSwitch8': DipSwitch8,
      'LightBulb': LightBulb,
      'SevenSegment': SevenSegment,
      'LogicProbe': LogicProbe,
      'Clock': Clock,
      'SR': SRFlipFlop,
      'D': DFlipFlop,
      'JK': JKFlipFlop,
      'T': TFlipFlop,
      'ShiftRegister4': ShiftRegister4
    };
  }

  getAvailableTypes() {
    return Object.keys(this.registry).map(key => ({
      type: key,
      label: this.registry[key].label || key,
      category: ComponentFactory.getCategory(key)
    }));
  }

  createComponent(type, id = null) {
    const Cls = this.registry[type];
    if (!Cls) throw new Error(`Unknown component type: ${type}`);
    return new Cls(id || generateId(type));
  }

  static getCategory(type) {
    const map = {
      'AND':'Gates', 'OR':'Gates', 'NOT':'Gates',
      'NAND':'Gates', 'NOR':'Gates', 'XOR':'Gates', 'XNOR':'Gates',
      'HalfAdder':'Chips', 'FullAdder':'Chips', 'Multiplexer':'Chips',
      'SR':'Flip-Flops', 'D':'Flip-Flops', 'JK':'Flip-Flops', 'T':'Flip-Flops',
      'ShiftRegister4':'Flip-Flops',
      'DipSwitch':'Inputs', 'DipSwitch8':'Inputs', 'Clock':'Inputs',
      'LightBulb':'Outputs', 'SevenSegment':'Outputs', 'LogicProbe':'Outputs'
    };
    return map[type] || 'Other';
  }
}
