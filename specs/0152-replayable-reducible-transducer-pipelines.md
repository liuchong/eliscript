# 0152: Replayable Reducible Transducer Pipelines

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-10
- Depends on: 0059 Collection Capability Protocols and Reduction Foundation,
  0061 Composable Transducers and Protocol-driven Into,
  0066 Eliscript-authored Core Protocol Surface and Algorithms,
  0151 Replayable Bounded and Unbounded Sequence Sources

## Summary

This specification adds immutable reduction-only views and reusable
transducer pipelines. A program can compose transformations over finite or
unbounded protocol sources, pass the result to any bounded or terminating
reduction consumer, and avoid allocating intermediate collections.

The design deliberately keeps broad lazy-sequence machinery outside the core.
A reduction view implements only `IReduce`: it is neither countable nor
sequenceable. This makes resource behavior explicit while providing the
composition needed for unbounded source pipelines.

## Public Surface

`runtime/core/collection.mjs` exports:

```text
ReductionView reductionView isReductionView
```

`stdlib/core/collection.eli` exports:

```text
ReductionView reduction-view reduction-view?
```

`runtime/core/transducer.mjs` exports `eduction` and `runBang`.
`stdlib/core/transducer.eli` exports the Lisp-named `eduction` and `run!`.

## Reduction Views

`reductionView(reduceFunction)` creates a frozen `ReductionView`. The supplied
function receives a reducer followed by either zero or one initial value each
time generic reduction begins. It owns traversal and may use any source or
state needed to produce the logical values.

A reduction view has a direct `IReduce` slot but no `ICounted` or `ISeqable`
implementation. Generic `count` and `seq` therefore reject it through normal
protocol dispatch instead of traversing or materializing it. The public class
cannot be constructed without the private factory token.

Calling `reduce` repeatedly invokes the reduction function repeatedly. Mutable
cursor or transducer state must be created inside that call and cannot leak
through the frozen view.

## Eduction

`eduction(transducer..., collection)` requires at least one transducer and one
source. Transducers are composed in argument order, exactly like
`composeTransducers`, and are applied anew on every reduction.

The returned reduction view performs no work at construction time. Its source
is traversed only when a consumer calls `reduce`, `transduce`, `into`, a search,
or an eager bounded sequence operation. A downstream reduced value propagates
through every transformation and stops the original source at the decisive
input.

Reduction with an explicit initial value preserves that value for empty
output. Reduction without an initial value uses the first transformed output
as its accumulator and rejects empty output deterministically. The outer
reducer is isolated from transducer completion, while stateful transducer
completion still runs exactly once. Partitioning therefore flushes one final
partial partition without completing the outer reducer twice.

A zero-input transducer such as `taking(0)` returns the initial value without
opening or pulling the source. Reusing an eduction creates fresh indexes,
dedupe state, distinct sets, partition buffers, and take/drop counters.

## Effectful Consumption

`run!(procedure, collection)` reduces a source in logical order, invokes the
procedure exactly once for each consumed value, ignores procedure results, and
returns `nil`. The JavaScript spelling is `runBang` and returns `null`.

`run!` is an explicit effect boundary. It does not collect results, infer
parallelism, swallow failures, or reinterpret a returned reduced wrapper.
Procedure and source errors propagate unchanged.

## Resource Behavior

An eduction retains only its transducers and source. Each reduction allocates
the state required by those transducers but no intermediate result collection.
For `n` consumed source values, its traversal work is the sum of source and
transducer work and remains stack-constant. A bounded consumer can therefore
take 100,000 transformed values from an unbounded source without realizing the
unconsumed tail.

Stateful transducers may retain bounded counters, one current value, a distinct
set, or a pending partition according to their individual contracts. The final
consumer alone determines whether a persistent output collection is built.

## Compatibility and Limits

This surface is stable in Compatibility Baseline 2. Existing eager sequence
functions keep returning persistent Vectors, and existing transducer semantics
do not change. Reduction views do not implement JavaScript iteration,
`ISeqable`, `ICounted`, memoization, asynchronous reduction, parallel fold, or
application-framework integration.

## Acceptance Criteria

- **RTP-01:** Both collection surfaces expose the immutable `ReductionView`
  type, factory, and predicate with their registered names.
- **RTP-02:** Reduction views implement only `IReduce`; `count` and `seq`
  reject them without invoking their reduction function.
- **RTP-03:** Repeated reduction invokes the view again and creates independent
  transducer state.
- **RTP-04:** `eduction` applies one or more transducers in declared order over
  arbitrary `IReduce` sources without intermediate collection materialization.
- **RTP-05:** Explicit-initial and no-initial reduction preserve generic reduce
  semantics, including deterministic empty-output rejection.
- **RTP-06:** Reduced values stop the original finite or unbounded source at
  the exact decisive input.
- **RTP-07:** Stateful completion runs once, flushes final partitions, and does
  not expose inner reducer completion to the outer consumer.
- **RTP-08:** Zero-input transducers do not open their source, and `run!`
  performs ordered effects exactly once before returning nil.
- **RTP-09:** A bounded 100,000-value eduction over an unbounded source
  completes with constant stack usage and exact boundary values.
- **RTP-10:** Seed and self-hosted compilers reach byte-identical fixed points,
  and generated modules produce identical local Bun and Node results.
