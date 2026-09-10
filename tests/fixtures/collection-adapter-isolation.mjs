const prototypes = [Array.prototype, Map.prototype, Set.prototype];
const before = prototypes.map((prototype) => Reflect.ownKeys(prototype));

const {
  IAssociative,
  IConj,
  ICounted,
  IEmptyable,
  IIndexed,
  ILookup,
  IMap,
  IReduce,
  IReversible,
  ISet,
  ISeqable,
  IStack,
} = await import("../../runtime/core/collection.mjs");
const { protocolSlot } = await import("../../runtime/core/protocol.mjs");

const after = prototypes.map((prototype) => Reflect.ownKeys(prototype));
const slots = [
  protocolSlot(ICounted, "count"),
  protocolSlot(IEmptyable, "empty"),
  protocolSlot(IConj, "conj"),
  protocolSlot(ILookup, "get"),
  protocolSlot(IIndexed, "nth"),
  protocolSlot(ISeqable, "seq"),
  protocolSlot(IReduce, "reduce"),
  protocolSlot(IAssociative, "assoc"),
  protocolSlot(IAssociative, "contains"),
  protocolSlot(IMap, "dissoc"),
  protocolSlot(ISet, "disj"),
  protocolSlot(IStack, "peek"),
  protocolSlot(IStack, "pop"),
  protocolSlot(IReversible, "rseq"),
];

console.log(JSON.stringify({
  unchanged: before.map((keys, index) =>
    keys.length === after[index].length &&
    keys.every((key, keyIndex) => key === after[index][keyIndex])),
  protocolSlotsAbsent: prototypes.map((prototype) =>
    slots.every((slot) => !Object.prototype.hasOwnProperty.call(prototype, slot))),
}));
