// Generates unique IDs with a time-random suffix, making collisions negligible even after page reload.
let counter = 1;

export function generateId(prefix = 'comp') {
  return `${prefix}_${counter++}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// HP-3 FIX: Instead of blindly resetting counter to 1 (which causes
// ID collisions when imported components use IDs like comp_1_xxx),
// we now scan all existing component IDs and set the counter ABOVE
// the highest found numeric prefix. This is called after importing
// a project to avoid future ID clashes.
export function resetIdCounter(components) {
  if (components && components.size > 0) {
    let maxCounter = 0;
    for (const comp of components.values()) {
      // Component IDs are like "comp_3_m5x_abcd" — extract the counter part
      const match = comp.id.match(/^[a-z]+_(\d+)_/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxCounter) maxCounter = n;
      }
    }
    counter = maxCounter + 1;
  } else {
    counter = 1;
  }
}
