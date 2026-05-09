# Logic Gate Simulator

A high-performance, interactive digital logic circuit simulator built with vanilla ES6+ JavaScript. Designed for students, educators, and hobbyists to design, simulate, and analyze combinational and sequential logic circuits directly in the browser with no dependencies.

**Status: Pre-Release (v0.9)**

---

## Features

### Simulation Engine
- Event-driven signal propagation with prioritized queue processing
- Infinite loop and oscillation detection with real-time UI feedback
- Clock management with global Run/Stop/Step control
- Configurable simulation speed via toolbar slider

### Component Library
- **Logic Gates**: AND, OR, NOT, NAND, NOR, XOR, XNOR, Buffer, Tri-State Buffer (2-8 configurable inputs)
- **Flip-Flops**: SR, D, JK, T (positive edge-triggered), SR Latch
- **Shift Register**: 4-bit shift register with serial/parallel I/O
- **Chips**: Half Adder, Full Adder, Multiplexer (2:1)
- **Inputs**: Toggle Switch, 8-bit DIP Switch, Clock Generator, High Constant, Low Constant
- **Outputs**: Light Bulb (LED with glow), 7-Segment Display (hex decoder), Logic Probe (0/1/Z), LED Array

### Wire Routing
- Manhattan routing with intelligent channel allocation (fan-out avoidance)
- Direct and Manual routing modes with editable control points
- Wire crossing detection with ANSI-style bridge/hop arcs or IEC junction dots
- Junction dots at T-connections and multi-fanout output nodes
- Signal color coding: green (HIGH), gray (LOW), orange (High-Z)
- Propagation animation on signal transitions

### UX & Interaction
- Drag-and-drop component placement from sidebar
- Click-to-wire: click output connector then input connector
- Component dragging with live wire stretching and auto-reroute on drop
- Multi-selection: Shift+click or rectangle selection
- Undo/Redo system (Ctrl+Z / Ctrl+Y) for all operations
- Right-click context menu for delete, properties, truth table
- Snap-to-grid alignment with visual indicator lines
- Infinite canvas with pan (middle-mouse/Ctrl+drag) and zoom (scroll/pinch)
- Keyboard shortcuts for all major operations (? to see help overlay)
- Floating input detection with pulsing amber indicator

### Analysis Tools
- Truth Table Generator: right-click any output node to generate a complete truth table
- Test Bench: manual step-by-step evaluation with output history logging
- Netlist Panel: inspect all component connections and signal states
- Properties Panel: edit gate input count, clock frequency, component labels

### Data & Persistence
- JSON export/import for full circuit state
- Save/Load to localStorage (auto-restore on reload)
- Serializer handles components, wires, positions, and properties

### Responsive Design
- Desktop: full sidebar + canvas + right panel layout with resizable splitter
- Tablet (1024px): sidebar and right panel become overlay drawers
- Phone (767px): compact header, touch-optimized toolbar, floating delete button
- Touch-friendly connector dots with invisible 24px hit area (visual stays 8px)
- Three themes: Dark, Light, High Contrast

---

## Quick Start

1. Open `index.html` in a modern browser (Chrome, Firefox, Edge, Safari)
2. Drag a component from the left sidebar onto the canvas
3. Click an output connector (right side of component), then click an input connector (left side) to wire
4. Click Toggle Switches or DIP Switches to change input states
5. Press **Run** for continuous simulation or **Step** for manual evaluation
6. Right-click an output connector and select "Generate Truth Table"

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Delete / Backspace | Delete selected components |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+A | Select all |
| Escape | Clear selection / cancel wiring |
| ? | Show help overlay |

---

## Project Structure

```
Logic-Gate-Simulator/
├── index.html                  # Application entry point
├── css/
│   ├── main.css                # Grid layout, responsive breakpoints
│   ├── theme.css               # Design tokens (Dark/Light/High-Contrast)
│   ├── header.css              # Header bar styles
│   ├── sidebar.css             # Component palette styles
│   ├── canvas.css              # Canvas container styles
│   ├── toolbar.css             # Bottom toolbar styles
│   ├── footer.css              # Status footer styles
│   ├── components.css          # Component, connector, panel, wire styles
│   └── toast.css               # Toast notification styles
├── js/
│   ├── main.js                 # App initialization, event wiring
│   ├── config.js               # Centralized constants (grid, wire, z-index)
│   ├── core/
│   │   ├── Engine.js           # Simulation engine (queue, propagate, step)
│   │   ├── Component.js        # Base class for all circuit components
│   │   ├── ComponentFactory.js # Component registry and factory
│   │   ├── ComponentRenderer.js# Template methods for DOM rendering
│   │   ├── ComponentLayoutPolicy.js # Grid-based dimension/connector placement
│   │   ├── GateBase.js         # Base class for logic gates
│   │   ├── Wire.js             # Wire data model (routing modes, SVG rendering)
│   │   ├── WireCrossingDetector.js # Crossing detection & bridge arc generation
│   │   ├── Circuit.js          # Circuit abstraction layer
│   │   ├── gates/              # AND, OR, NOT, NAND, NOR, XOR, XNOR, Buffer, TriState
│   │   ├── flipflops/          # SR, D, JK, T, SR Latch, Shift Register
│   │   ├── chips/              # Half Adder, Full Adder, Multiplexer
│   │   ├── io/                 # Toggle, DIP, Clock, LED, 7-Seg, Probe, Constants
│   │   └── mixins/             # GateRendererMixin
│   ├── routing/
│   │   └── Router.js           # Manhattan/Direct/Manual routing engine
│   ├── ui/
│   │   ├── Canvas.js           # Main canvas orchestrator
│   │   ├── Header.js           # Top bar (Run/Stop/Step, Save/Load, themes)
│   │   ├── Sidebar.js          # Component palette with search & categories
│   │   ├── Toolbar.js          # Bottom toolbar (status, speed, reroute)
│   │   ├── Footer.js           # Version info
│   │   ├── ContextMenu.js      # Right-click context menu
│   │   ├── PropertyEditor.js   # Modal dialog for component properties
│   │   ├── PanelManager.js     # Right panel (truth table, test bench, netlist)
│   │   ├── TruthTablePanel.js  # Truth table viewer
│   │   ├── TestBenchPanel.js   # Step-by-step test bench
│   │   ├── NetlistPanel.js     # Connection netlist viewer
│   │   ├── PropertiesPanel.js  # Inline property editor
│   │   ├── HelpOverlay.js      # Keyboard shortcut reference
│   │   └── canvas/             # Canvas subsystem modules
│   │       ├── CanvasCore.js       # SVG scene, transform, coordinate mapping
│   │       ├── CanvasPanZoom.js    # Pan and zoom handlers
│   │       ├── CanvasDrag.js       # Component drag with alignment indicators
│   │       ├── CanvasEvents.js     # Mouse/keyboard event dispatch
│   │       ├── CanvasTouch.js      # Touch event handling
│   │       ├── CanvasWiring.js     # Wire lifecycle (create, delete, reroute)
│   │       ├── CanvasSelection.js  # Multi-selection and delete
│   │       ├── CanvasComponentManager.js # Component add/remove/modify
│   │       ├── CanvasToast.js      # Toast notification renderer
│   │       └── WireEditHandler.js  # Manual wire control point editing
│   └── utils/
│       ├── EventBus.js         # Publish/subscribe event system
│       ├── UndoManager.js      # Command pattern undo/redo stack
│       ├── Serializer.js       # JSON export/import for circuit state
│       ├── IdGenerator.js      # Unique ID generation
│       ├── NodePositionCache.js# Cached connector position lookups
│       └── ConnectorRenderer.js# Static helper for connector DOM creation
├── README.md
├── worklog.txt
└── roadmap.txt
```

---

## Technical Stack

- **Runtime**: Browser-only (no server, no build step)
- **Frontend**: HTML5, CSS3 Custom Properties, CSS Grid, ES6+ Modules
- **Graphics**: SVG for wires, crossings, junctions, and grid
- **Architecture**: EventBus for decoupled UI/logic communication
- **State**: Command-pattern UndoManager for reversible operations

---

## Browser Support

Tested on Chrome 90+, Firefox 90+, Edge 90+, Safari 15+.

---

## License

MIT License - Free for educational and personal use.
