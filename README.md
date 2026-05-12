# D-Flow Logic Simulator

**Version 1.0.0**

A high-performance, interactive digital logic circuit simulator built with vanilla ES6+ JavaScript. Designed for students, educators, and hobbyists to design, simulate, and analyze combinational and sequential logic circuits directly in the browser — no dependencies, no build step, no server required.

---

## Features

### Simulation Engine
- Event-driven signal propagation with prioritized queue processing (Logisim-Evolution inspired architecture)
- Infinite loop and oscillation detection with real-time UI feedback
- Clock management with global Run/Stop/Step control
- Configurable simulation speed via toolbar slider
- Single-step mode for delta-cycle debugging

### Component Library
- **Logic Gates**: AND, OR, NOT, NAND, NOR, XOR, XNOR, Buffer, Tri-State Buffer (2-8 configurable inputs)
- **Flip-Flops**: SR, D, JK, T (positive edge-triggered), SR Latch
- **Shift Register**: 4-bit shift register with serial/parallel I/O
- **Chips**: Half Adder, Full Adder, Multiplexer (2:1)
- **Inputs**: Toggle Switch, 8-bit DIP Switch, Clock Generator, High Constant, Low Constant
- **Outputs**: Light Bulb (LED with glow), 7-Segment Display (hex decoder), Logic Probe (0/1/Z), LED Array
- **Bus Components**: Bus Splitter, Bus Merger, Bus MUX, Bus Constant, Bus Probe, Register, Sign Extend, Zero Extend

### Bus Data Wire Support
- Multi-bit wires (up to 32-bit) with single-connection bus routing
- Automatic bus width validation on wire connections
- Visual bus indicators: thicker wires, width labels, and bus-specific color coding
- Hex/Decimal/Binary value display on bus wires via hover tooltips
- Bus-aware Tri-State buffers and gate components

### Wire Routing
- Segment-by-segment Bézier curve rendering with smooth corners
- Click-to-wire: click output connector then input connector to connect
- Add, drag, and delete wire control points (waypoints)
- Wire crossing detection with ANSI-style bridge/hop arcs
- Junction dots at T-connections and multi-fanout output nodes
- Signal color coding: green (HIGH), gray (LOW), orange (High-Z), blue (Bus)
- Propagation animation on signal transitions

### UX & Interaction
- Drag-and-drop component placement from sidebar
- Component dragging with live wire stretching and auto-reroute on drop
- Multi-selection: Shift+click or rectangle selection
- Undo/Redo system (Ctrl+Z / Ctrl+Y) for all operations
- Right-click context menu for delete, properties, and wire editing
- Snap-to-grid alignment with visual indicator lines
- Gate rotation (4 facing directions) and mirroring
- Input inversion bubbles on gate inputs
- Infinite canvas with pan (middle-mouse/Ctrl+drag) and zoom (scroll/pinch)
- Keyboard shortcuts for all major operations (? to see help overlay)
- Ctrl+S to save project
- Double-click component to open properties
- Floating input detection with pulsing amber indicator

### Analysis Tools
- Netlist Panel: inspect all component connections and signal states
- Properties Panel: edit gate input count, clock frequency, bit width, component labels
- Circuit validation with error and warning reports

### Data & Persistence
- JSON export/import for full circuit state (including bus wire values)
- Save/Load to localStorage with auto-restore on reload
- Autosave indicator showing last save time or unsaved changes
- Subcircuit Manager: save and load reusable circuit fragments

### Responsive Design
- Desktop: full sidebar + canvas + right panel layout with resizable splitter
- Tablet (1024px): sidebar and right panel become overlay drawers
- Phone (767px): compact header, condensed footer, touch-optimized toolbar
- Touch-friendly connector dots with invisible 24px hit area (visual stays 8px)
- Dark theme optimized for long design sessions

---

## Quick Start

1. Open `index.html` in a modern browser (Chrome, Firefox, Edge, Safari)
2. Drag a component from the left sidebar onto the canvas
3. Click an output connector (right side of component), then click an input connector (left side) to wire
4. Click Toggle Switches or DIP Switches to change input states
5. Press **Run** for continuous simulation or **Step** for manual evaluation
6. Double-click or right-click a component to open its properties
7. Press **?** to see all keyboard shortcuts

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Delete / Backspace | Delete selected components/wires |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+S | Save project |
| Ctrl+A | Select all |
| R | Rotate selected component 90° |
| M | Mirror selected component |
| Escape | Clear selection / cancel wiring |
| ? | Show help overlay |

---

## Project Structure

```
D-Flow/
├── index.html                  # Application entry point
├── favicon.svg                 # SVG favicon (modern browsers)
├── favicon.ico                 # ICO favicon (legacy browsers)
├── css/
│   ├── main.css                # Grid layout, responsive breakpoints
│   ├── theme.css               # Design tokens (dark theme)
│   ├── header.css              # Header bar styles
│   ├── sidebar.css             # Component palette styles
│   ├── canvas.css              # Canvas container styles
│   ├── toolbar.css             # Bottom toolbar styles
│   ├── footer.css              # Status footer styles
│   ├── components.css          # Component, connector, panel, wire styles
│   └── toast.css               # Toast notification and confirm dialog styles
├── js/
│   ├── main.js                 # App initialization, event wiring
│   ├── config.js               # Centralized constants (grid, wire, z-index, bus)
│   ├── core/
│   │   ├── Engine.js           # Simulation engine orchestrator
│   │   ├── Component.js        # Base class for all circuit components
│   │   ├── ComponentFactory.js # Component registry and factory
│   │   ├── ComponentRenderer.js# Template methods for DOM rendering
│   │   ├── ComponentLayoutPolicy.js # Grid-based dimension/connector placement
│   │   ├── GateBase.js         # Base class for logic gates
│   │   ├── Wire.js             # Wire data model (Bézier rendering, waypoints)
│   │   ├── WireCrossingDetector.js # Crossing detection & bridge arc generation
│   │   ├── Circuit.js          # Circuit data model with indexed wire lookups
│   │   ├── gates/              # AND, OR, NOT, NAND, NOR, XOR, XNOR, Buffer, TriState
│   │   ├── flipflops/          # SR, D, JK, T, SR Latch, Shift Register
│   │   ├── chips/              # Half Adder, Full Adder, Multiplexer
│   │   ├── io/                 # Toggle, DIP, Clock, LED, 7-Seg, Probe, Constants
│   │   ├── bus/                # BusSplitter, BusMerger, BusMUX, BusConstant, BusProbe, Register, SignExtend, ZeroExtend
│   │   ├── simulation/        # Propagator, CircuitState, Value, SimulatorEvent, PropagationPoints
│   │   └── mixins/             # GateRendererMixin
│   ├── routing/
│   │   └── Router.js           # Manhattan routing engine
│   ├── ui/
│   │   ├── Canvas.js           # Main canvas orchestrator
│   │   ├── Header.js           # Top bar (Run/Stop/Step, Save/Load)
│   │   ├── Sidebar.js          # Component palette with search & categories
│   │   ├── Toolbar.js          # Bottom toolbar (status, speed)
│   │   ├── Footer.js           # Version info and stats
│   │   ├── ContextMenu.js      # Right-click context menu
│   │   ├── PropertyEditor.js   # Modal dialog for component properties
│   │   ├── PanelManager.js     # Right panel (netlist, properties)
│   │   ├── NetlistPanel.js     # Connection netlist viewer
│   │   ├── PropertiesPanel.js  # Inline property editor
│   │   ├── HelpOverlay.js      # Keyboard shortcut reference
│   │   ├── OnboardingTour.js   # First-use guided tour
│   │   ├── EmptyState.js       # Empty canvas placeholder
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
│   │       ├── MiniMap.js          # Miniature overview navigation
│   │       └── WireEditHandler.js  # Manual wire control point editing
│   └── utils/
│       ├── EventBus.js         # Publish/subscribe event system
│       ├── UndoManager.js      # Command pattern undo/redo stack
│       ├── Serializer.js       # JSON export/import for circuit state
│       ├── CircuitValidator.js # Circuit validation and error detection
│       ├── SubcircuitManager.js# Save/load reusable subcircuits
│       ├── ConfirmDialog.js    # Themed confirmation dialog
│       ├── IdGenerator.js      # Unique ID generation
│       ├── NodePositionCache.js# Cached connector position lookups
│       ├── ConnectorRenderer.js# Static helper for connector DOM creation
│       └── IconHelper.js       # Lucide icon rendering utilities
├── js/lib/
│   └── lucide.js               # Lucide icon library (standalone bundle)
└── README.md
```

---

## Technical Stack

- **Runtime**: Browser-only (no server, no build step)
- **Frontend**: HTML5, CSS3 Custom Properties, CSS Grid, ES6+ Modules
- **Graphics**: SVG for wires, crossings, junctions, grid, and minimap
- **Architecture**: EventBus for decoupled UI/logic communication
- **State**: Command-pattern UndoManager for reversible operations
- **Simulation**: Logisim-Evolution inspired Propagator with event-driven delta-cycle processing

---

## Browser Support

Tested on Chrome 90+, Firefox 90+, Edge 90+, Safari 15+.

---

## Changelog

### v1.0.0 (2026-05-13)
- First stable release
- Bus data wire support (up to 32-bit)
- Event-driven simulation engine with oscillation detection
- Full undo/redo system
- Responsive design for desktop, tablet, and mobile
- Wire control point editing with Bézier curves
- Property editor with input validation and clamping
- Subcircuit save/load
- Circuit validation
- Onboarding tour for new users

---

## License

MIT License - Free for educational and personal use.
