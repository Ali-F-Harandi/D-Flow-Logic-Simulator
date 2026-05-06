let counter = 1;

export function generateId(prefix = 'comp') {
  return `${prefix}_${counter++}`;
}