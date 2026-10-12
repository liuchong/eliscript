export const warmups = 5;
export const samples = 9;
export const cases = [
  { name: "recurrence-batch", fn: "recurrence", args: [1_000_000, 0.123], calls: 2 },
  { name: "escape-grid", fn: "escape-grid", args: [160, 64], calls: 2 },
  { name: "recurrence-tiny-calls", fn: "recurrence", args: [1, 0.123], calls: 2_000_000 },
];

export function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { medianMs: sorted[Math.floor(sorted.length / 2)], minMs: sorted[0], maxMs: sorted.at(-1), samplesMs: values };
}
