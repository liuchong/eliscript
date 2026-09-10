# 0155: Reversible Collection Traversal

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-10
- Depends on: 0058 Open Protocol Dispatch Core,
  0059 Collection Capability Protocols and Reduction Foundation,
  0063 Protocol-driven Core Sequence and Data Algorithms,
  0066 Eliscript-authored Core Protocol Surface and Algorithms

## Summary

This specification adds the open `IReversible/rseq` capability and uses it to
remove unnecessary forward scans and complete source copies from core sequence
algorithms. Reversible collections expose a replayable logical traversal from
their final value to their first value without changing or copying the source
collection.

The generic runtime operation is `rseq(collection)`. The Lisp-named collection
module exports the same operation and protocol identity. Core `last` and
`reverse` detect this capability through ordinary protocol inspection, while
retaining their existing reduction fallback for one-way sources.

## Reversible Values

Persistent Vector, native Array, String, and nil implement `IReversible`.
Persistent List, Map, Set, sequence views, and reduction-only views do not
claim a reverse traversal that their representations cannot provide directly.

`rseq` returns nil for an empty reversible value. A non-empty call returns an
iterable replayable sequence view with exact finite count. Each traversal owns
independent cursor state. The operation accepts exactly one argument and
rejects protocol implementations that return neither nil nor an iterable.

String traversal follows the existing UTF-16 code-unit collection contract.
Consequently, a surrogate pair is visited as two code units in reverse order;
this protocol does not introduce a second text segmentation model.

Native Array views retain the existing explicit mutable-host boundary. Their
length and values are read from the host Array when each traversal begins.
Persistent Vector views capture one immutable root state and therefore always
replay the same values.

## Persistent Vector Algorithm

The Vector reverse iterator starts at the tail and moves toward index zero. It
caches the current 32-value leaf and obtains a new trie leaf only when crossing
a leaf boundary. It therefore performs O(n) value visits and O(n / 32)
bounded-depth trie lookups, uses O(1) cursor storage, and allocates no copy of
the source values.

The iterator does not call public `pop` repeatedly and does not construct
intermediate Vectors. The source root, tail, metadata, and cached hash remain
unchanged.

## Sequence Algorithms

`last` reads only the first value of `rseq` when the source implements
`IReversible`. This makes final-value access constant-time for short-tail
Vectors and Arrays, while preserving the complete forward-reduction fallback
for arbitrary `IReduce` sources.

`reverse` reduces the reverse view directly into one transient-backed
Persistent Vector. Reversible sources no longer allocate a complete native
Array and mutate it with host `reverse`. One-way reducible sources keep the
existing private-buffer fallback because they have no reverse cursor.

Protocol detection is capability-based. An external type may implement only
`IReversible`; it need not implement `IReduce`, `IIndexed`, `IStack`, or any
other collection protocol for `last` and `reverse` to use its reverse view.

## Compatibility and Limits

This surface is additive and stable in Compatibility Baseline 2. It does not
define bidirectional iterators, random-access cursors, sorted traversal, List
reversal by structural mutation, Unicode grapheme segmentation, or reverse
transducers. Those behaviors require separate contracts.

## Acceptance Criteria

- **RCT-01:** Runtime and Eliscript collection surfaces export frozen
  `IReversible` and exact-arity `rseq`.
- **RCT-02:** Persistent Vector reverse traversal is replayable, has exact
  count, preserves its immutable root, and reads cached 32-value leaves from
  tail to root.
- **RCT-03:** Array and String adapters return replayable reverse views without
  prototype mutation, and nil plus empty reversible values return nil.
- **RCT-04:** Unsupported values fail through ordinary protocol dispatch and
  malformed external results fail deterministic result validation.
- **RCT-05:** An external reverse-only value drives `last` and `reverse`
  without implementing forward reduction or unrelated collection protocols.
- **RCT-06:** `last` consumes one reverse value and `reverse` builds one final
  Persistent Vector for reversible sources while one-way sources retain the
  established reduction fallback.
- **RCT-07:** A million-value Persistent Vector traverses completely in reverse
  order with exact endpoints, count, and sum without stack growth.
- **RCT-08:** Seed and self-hosted compilers reach the same fixed point and Bun
  and Node produce identical reverse traversal reports.
