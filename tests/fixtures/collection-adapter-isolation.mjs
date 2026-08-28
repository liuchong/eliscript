const prototypes = [Array.prototype, Map.prototype, Set.prototype];
const before = prototypes.map((prototype) => Reflect.ownKeys(prototype));

const {
  ICounted,
  IIndexed,
  ILookup,
  IReduce,
  ISeqable,
} = await import("../../runtime/core/collection.mjs");
const { protocolSlot } = await import("../../runtime/core/protocol.mjs");

const after = prototypes.map((prototype) => Reflect.ownKeys(prototype));
const slots = [
  protocolSlot(ICounted, "count"),
  protocolSlot(ILookup, "get"),
  protocolSlot(IIndexed, "nth"),
  protocolSlot(ISeqable, "seq"),
  protocolSlot(IReduce, "reduce"),
];

console.log(JSON.stringify({
  unchanged: before.map((keys, index) =>
    keys.length === after[index].length &&
    keys.every((key, keyIndex) => key === after[index][keyIndex])),
  protocolSlotsAbsent: prototypes.map((prototype) =>
    slots.every((slot) => !Object.prototype.hasOwnProperty.call(prototype, slot))),
}));
