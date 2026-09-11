# 0176: Memoized Lazy Sequences and Pull Transduction

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-11
- Depends on: 0059 Collection Protocols, 0061 Transducers, 0151 Replayable
  Sequence Sources, 0152 Replayable Reducible Transducer Pipelines

## Summary

Eliscript provides demand-driven sequence values whose realized prefix is
cached exactly once and shared by every traversal. The language-facing APIs are:

```text
lazy-cons lazy-seq lazy-seq? realize realized-count realized?
sequence
```

The first six operations live in `stdlib/core/lazy-sequence.eli`. `sequence`
lives beside the existing transducer API in `stdlib/core/transducer.eli` and
turns a transducer plus any sequenceable input into a memoized lazy sequence.
The implementation is host-neutral and has no filesystem, process, UI, or
application-framework dependency.

## Realization Model

`lazy-seq` accepts a zero-argument producer. It does not invoke that producer
until a consumer requests the first value. The producer returns any value that
implements `ISeqable`, including nil. Each produced value is appended to one
private realization cache. Independent and interleaved iterators read the same
cache and never restart the producer.

`lazy-cons` exposes one value immediately and accepts a thunk for its tail. The
tail thunk is invoked at most once and only after a consumer advances beyond
the head. Chains of `lazy-cons` values are flattened iteratively so recursive
infinite streams do not grow the JavaScript call stack.

If producer or iterator realization fails, the exact failure and its position
are retained. Later traversals replay the cached prefix and throw the same
failure without rerunning user code. `realized?` reports whether realization
has started, `realized-count` reports the cached prefix length, and `realize`
fully consumes a finite lazy sequence before returning the same sequence
identity. Calling `realize` on an unbounded sequence intentionally does not
terminate.

Lazy sequences implement `ISeqable` and `IReduce` and participate in
`collection?`, `sequential?`, `sequence?`, `bounded-count`, head/tail views, and
generic reduction. They do not claim a finite count until traversal proves one.

## Pull Transduction

`sequence` instantiates transducer state once for one memoized output. Pulling
an output value advances the input only until the transducer emits that value.
Filtering may therefore consume several inputs, while mapping consumes one.
Multiple outputs from one input are queued without front-removal copying.

Early reduction closes the active input iterator and invokes transducer
completion exactly once. A zero-input transform such as `taking(0)` completes
without starting its source. Completion output, including a final partial
partition, remains visible. Transformation failures close the active input and
are cached by the lazy output at their exact realization position.

## Explicit Boundaries

This contract does not change the existing eager return types of `map`,
`filter`, `take`, or related finite sequence helpers. It does not add asynchronous
iteration, weak caches, chunked realization, worker transport tags, or implicit
parallel evaluation. Those are separate semantic choices and require their own
contracts.

## Acceptance Criteria

- **MLS-01:** A lazy producer starts only on first demand and starts exactly
  once across independent and interleaved traversals.
- **MLS-02:** Every traversal shares one ordered realized prefix; explicit full
  realization returns the original sequence and does not repeat production.
- **MLS-03:** Producer, iterator, and transformation failures retain their exact
  position, close active input where applicable, and replay without rerunning
  user code.
- **MLS-04:** Recursive `lazy-cons` streams defer each tail and consume at least
  100,000 values without JavaScript stack growth.
- **MLS-05:** Pull transduction preserves mapping, filtering, stateful
  transforms, early termination, zero-input behavior, and completion output.
- **MLS-06:** Lazy values satisfy sequence and reduction protocols and work with
  collection classification, bounded counting, and head/tail views.
- **MLS-07:** Seed and self-hosted ESM and Source Maps are byte-identical, and
  Bun and Node execution produce the same observable report.
