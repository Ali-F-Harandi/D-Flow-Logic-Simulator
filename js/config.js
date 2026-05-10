// Centralized application constants
export const GRID_SIZE = 20;
export const WIRE_VISUAL_WIDTH = 2;
export const WIRE_HIT_WIDTH = 15;
export const JUNCTION_RADIUS = 3;
export const COMPONENT_DEFAULT_WIDTH = 4 * GRID_SIZE; // typical gate width
export const CONNECTOR_SIZE = 8;
export const SNAP_THRESHOLD = 0.5 * GRID_SIZE;

// ─── A* Router Constants ───
export const ASTAR_BEND_PENALTY    = 3;    // Cost for each 90° turn
export const ASTAR_WIRE_PENALTY    = 2;    // Extra cost for crossing wire cells
export const ASTAR_MAX_ITERATIONS  = 50000; // Maximum A* search iterations
export const ASTAR_STEP_BACK       = 1;    // Grid cells for step-back from pins

// ─── Wire Nudging Constants ───
export const WIRE_NUDGE_SPACING    = GRID_SIZE * 0.6; // Space between parallel wires
export const WIRE_NUDGE_MAX        = GRID_SIZE * 2;    // Maximum nudge offset

// ─── Wire Drawing Constants ───
export const WIRE_DRAW_PREVIEW_COLOR  = '#4ec9b0';
export const WIRE_DRAW_GLOW_COLOR     = 'rgba(78, 201, 176, 0.4)';
export const WIRE_DRAW_GLOW_WIDTH     = 8;
export const WIRE_HOVER_HIGHLIGHT     = '#7fffd4';
export const WIRE_ERROR_COLOR         = '#ff4444';
export const WIRE_PIN_MAGNET_RADIUS   = 30;    // Auto-magnet snap distance (pixels)

// ─── Spatial Hash Constants ───
export const SPATIAL_HASH_CELL_SIZE   = GRID_SIZE * 4;

// Z‑index values (matching CSS variables, for reference)
export const Z_CANVAS_WIRES = 1;
export const Z_CANVAS_COMPONENTS = 2;
export const Z_SIDEBAR = 10;
export const Z_HEADER = 20;
export const Z_CONTEXT_MENU = 1000;
export const Z_MODAL = 2000;