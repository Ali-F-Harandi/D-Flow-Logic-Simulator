// Centralized application constants
export const GRID_SIZE = 20;
export const WIRE_VISUAL_WIDTH = 2;
export const WIRE_HIT_WIDTH = 15;
export const JUNCTION_RADIUS = 3;
export const COMPONENT_DEFAULT_WIDTH = 4 * GRID_SIZE; // typical gate width
export const CONNECTOR_SIZE = 8;
export const SNAP_THRESHOLD = 0.5 * GRID_SIZE;

// Z‑index values (matching CSS variables, for reference)
export const Z_CANVAS_WIRES = 1;
export const Z_CANVAS_COMPONENTS = 2;
export const Z_SIDEBAR = 10;
export const Z_HEADER = 20;
export const Z_CONTEXT_MENU = 1000;
export const Z_MODAL = 2000;