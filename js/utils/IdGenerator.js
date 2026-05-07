// Generates unique IDs with a time‑random suffix, making collisions negligible even after page reload.
let counter = 1;

export function generateId(prefix = 'comp') {
  return `${prefix}_${counter++}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// Used after importing a project to avoid future ID clashes
export function resetIdCounter() {
  counter = 1;
}