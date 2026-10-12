// Diagnostic baseline: same scalar algorithms, written directly in JavaScript.
// This separates current JS emission overhead from target-engine limitations.
export function recurrence(n, seed) {
  let i = 0, x = seed, total = 0;
  while (i < n) {
    x = (3.8 * x) * (1 - x);
    total = total + x;
    i = i + 1;
  }
  return total;
}

export function escape_grid(width, limit) {
  let row = 0, total = 0;
  while (row < width) {
    let column = 0;
    while (column < width) {
      const cx = (column * 3) / width - 2;
      const cy = (row * 2) / width - 1;
      let x = 0, y = 0, steps = 0;
      while (steps < limit && x * x + y * y < 4) {
        const nextX = (x * x - y * y) + cx;
        y = ((2 * x) * y) + cy;
        x = nextX;
        steps = steps + 1;
      }
      total = total + steps;
      column = column + 1;
    }
    row = row + 1;
  }
  return total;
}
