# Logic Gate Simulator

A high-performance, interactive, and professional-grade digital logic circuit simulator built with modern ES6+ JavaScript. Designed for students, educators, and hobbyists to design, test, and analyze complex logic circuits directly in the browser.

---

## 🚀 Features

### **1. Core Simulation Engine**
- **Event-Driven Propagation:** Uses a prioritized queue system to simulate signals efficiently across the circuit.
- **Infinite Loop Protection:** Detects unstable circuits or oscillation loops and provides real-time UI feedback to prevent browser freezing.
- **Clock Management:** Global synchronization of clock generators with the simulation state (Run/Stop).

### **2. Comprehensive Component Library**
- **Logic Gates:** Configurable AND, OR, NOT, NAND, NOR, XOR, and XNOR (2 to 8 inputs).
- **Flip-Flops:** Edge-triggered SR, D, JK, and T flip-flops for sequential logic design.
- **I/O Devices:** - 8-bit DIP Switches for parallel input.
    - Hexadecimal 7-Segment displays with internal decoding.
    - SVG-rendered LEDs with realistic glow effects.
    - Logic Probes indicating 0, 1, or High-Impedance (Z).

### **3. Professional UX & Tooling**
- **Manhattan Routing:** Intelligent wire placement that snaps to a 20px grid for clean, professional schematics.
- **Undo/Redo System:** Full command-pattern implementation for tracking component placement, deletions, and connections (Ctrl+Z / Ctrl+Y).
- **Truth Table Generator:** Automatically analyze any circuit output and generate a complete truth table based on current input switches.
- **Interactive Test Bench:** Manually step through evaluations and log output history for precise debugging.
- **Responsive Interface:** Adaptive layout with a collapsible sidebar, resizable panels, and touch support for mobile/tablet usage.

---

## 🛠️ Technical Stack

- **Frontend:** HTML5, CSS3 (Custom Properties & Grid), ES6+ Modules.
- **Graphics:** SVG for high-fidelity wire rendering and component visuals.
- **State Management:** Custom EventBus for decoupled communication between UI and Logic.
- **Architecture:** - **Engine.js:** The logical heart managing propagation.
    - **Canvas.js:** Handles complex SVG coordinate mapping and user interactions.
    - **UndoManager.js:** Manages a stack of executable commands for state persistence.

---

## 📖 How to Use

1. **Add Components:** Drag any gate or input from the left sidebar onto the canvas.
2. **Wiring:** Click on an **Output Node** (right side) and drag to an **Input Node** (left side).
3. **Interact:** Click a Toggle Switch or DIP Switch to change its state.
4. **Simulate:** Use the **Run** button in the header for real-time evaluation or **Step** for manual debugging.
5. **Analyze:** Right-click an output node and select "Generate Truth Table" to see the logic mapped out in the right panel.
6. **Customize:** Right-click a gate to change the number of inputs via the Properties menu.

---

## 📂 Project Structure

```text
├── css/
│   ├── main.css        # Entry point for styles
│   ├── theme.css       # Design tokens (Dark/Light modes)
│   └── components.css  # Component-specific visuals
├── js/
│   ├── core/           # Simulation logic & engine
│   ├── ui/             # UI Components (Canvas, Sidebar, Panels)
│   └── utils/          # Helpers (Undo, EventBus, ID Generator)
└── index.html          # Application entry
```
## 📅 Roadmap

- [x] **Alpha:** Core layout and theme implementation.
- [x] **Beta 1:** Engine logic, wiring, and basic gates.
- [x] **Beta 2:** Sequential logic (Flip-flops), Truth Tables, and Undo/Redo.
- [ ] **Beta 3:** JSON Export/Import and Command Line Interface (CLI).
- [ ] **Release 1.0:** Performance optimization and keyboard shortcut mapping.

## 📄 License

© 2025 Logic Simulator Project. Developed as a feature-complete tool for digital electronics education.
