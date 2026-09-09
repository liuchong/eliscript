# 0151: Replayable Bounded and Unbounded Sequence Sources

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-09
- Depends on: 0059 Collection Capability Protocols and Reduction Foundation,
  0061 Composable Transducers and Protocol-driven Into,
  0063 Protocol-driven Core Sequence and Data Algorithms,
  0066 Eliscript-authored Core Protocol Surface and Algorithms,
  0150 Protocol-driven Finite Sequence Selection

## Summary

This specification adds replayable sequence construction to the protocol core.
Programs can create finite or unbounded arithmetic ranges, repeated values,
producer-driven values, iterative state sequences, cycles, and indexed
generated values without depending on native Arrays or application frameworks.

Each source is a `SequenceView` whose factory creates a fresh iterator for each
traversal. Finite sources expose an exact safe-integer count. Unbounded sources
carry an explicit internal marker so `seq` can return immediately and `count`
can reject the operation without speculative traversal.

## Public Surface

The Eliscript module `stdlib/core/seq.eli` exports:

```text
range repeat repeatedly iterate cycle generate
```

The JavaScript runtime module `runtime/core/sequence.mjs` exports the same six
names. `stdlib/core/collection.eli` additionally exports
`unbounded-sequence-view`; `runtime/core/collection.mjs` exports its camel-case
counterpart `unboundedSequenceView`.

## Sequence View Bounds

`sequenceView(factory, count)` remains the bounded constructor. Its count is a
non-negative safe integer or a resolver that returns one. An omitted count is
computed by finite traversal for compatibility with existing external types.

`unboundedSequenceView(factory)` creates a replayable view with no finite
cardinality. Calling `seq` on that value returns the view itself without
invoking its factory. Calling `count` throws `RangeError` with a deterministic
unbounded-sequence diagnostic. Bounded consumers such as `take` can reduce the
view normally and stop through the shared reduced-value contract.

## Source Semantics

`range` accepts zero through three arguments. With no arguments it yields the
unbounded sequence `0, 1, 2, ...`. One argument is the exclusive end with a
zero start. Two arguments select start and exclusive end. Three arguments also
select the step. A finite range supports positive, negative, and fractional
steps; every bound must be finite and a zero step is invalid. Empty-direction
ranges return `null`. Finite range count is computed without traversal and
must fit a safe integer.

`repeat(value)` is unbounded. `repeat(count, value)` is finite and requires a
non-negative safe-integer count. `repeatedly(producer)` is unbounded, while
`repeatedly(count, producer)` is finite under the same count contract. The
producer is validated eagerly but invoked only as values are consumed.

`iterate(transform, seed)` yields `seed` first and applies `transform` only
when the iterator advances. It is unbounded. `generate(count, producer)` is a
finite indexed source: the producer receives indexes from zero through
`count - 1` and is called only for consumed values.

`cycle(collection)` consumes an arbitrary finite `IReduce` source once into a
persistent Vector snapshot and then repeats that immutable snapshot without
end. Cycling an empty source returns `null`. Snapshotting prevents later native
container mutation and avoids re-running an effectful source on every cycle.

## Replay and Resource Behavior

Each call to the view's iterator factory starts independent state. Traversing
`range`, `repeat`, `iterate`, or a cycle twice therefore produces identical
values. `repeatedly` and `generate` also create fresh traversals, while their
callbacks intentionally run again because callback results are not cached.

Iteration is iterative and stack-constant. Finite sources retain only iterator
state; `cycle` additionally retains its finite persistent snapshot. Unbounded
sources must be consumed by a terminating reducer or a bounded operation.
The maintained corpus covers a 100,000-value finite range and bounded prefixes
of every unbounded source.

## Compatibility and Limits

This surface is stable in Compatibility Baseline 2. It extends the existing
protocol-driven core without changing the older portable Array-oriented
`stdlib/sequence.eli` API. It adds no async sequence, memoized lazy list,
parallel traversal, compiler specialization, browser, UI, build-framework, or
publishing dependency.

## Acceptance Criteria

- **RSS-01:** Both sequence surfaces expose all six constructors, and both
  collection surfaces expose the bounded/unbounded view constructors.
- **RSS-02:** Every source returns a replayable `SequenceView` or `null` for a
  statically empty finite source.
- **RSS-03:** `seq` observes an unbounded view without traversal and `count`
  rejects it immediately with a deterministic `RangeError`.
- **RSS-04:** Finite ranges are exclusive, support both directions and
  fractional steps, expose an exact safe count, and reject invalid bounds.
- **RSS-05:** Finite repeat, repeatedly, and generate counts are validated
  before callback execution and exposed without traversal.
- **RSS-06:** Producer and transform callbacks are lazy with respect to source
  construction and execute only for values demanded by traversal.
- **RSS-07:** `cycle` accepts any finite `IReduce` source, snapshots it once as
  persistent data, returns `null` for empty input, and then repeats indefinitely.
- **RSS-08:** Bounded consumers stop every unbounded source at the exact
  requested value through the existing reduced-value protocol.
- **RSS-09:** A 100,000-value finite range completes with constant stack usage,
  and repeated traversals have independent iterator state.
- **RSS-10:** Seed and self-hosted compilers reach byte-identical fixed points,
  and generated modules produce identical local Bun and Node results.
