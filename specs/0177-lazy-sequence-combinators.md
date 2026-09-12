# 0177: Lazy Sequence Combinators

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-12
- Depends on: 0061 Composable Transducers, 0151 Replayable Sequence Sources,
  0176 Memoized Lazy Sequences and Pull Transduction

## Summary

Eliscript exposes the common transformation transducers as direct memoized
lazy-sequence operations. Programs can express demand-driven pipelines without
manually constructing a transducer or changing the existing eager finite
sequence helpers.

The language module `stdlib/core/lazy-sequence.eli` exports:

```text
lazy-map lazy-map-indexed lazy-keep lazy-keep-indexed
lazy-filter lazy-remove lazy-take lazy-drop
lazy-take-while lazy-drop-while lazy-take-nth lazy-interpose
lazy-dedupe lazy-distinct lazy-mapcat
lazy-partition-all lazy-partition-by
```

The JavaScript runtime exports the corresponding camel-case names from
`runtime/core/lazy-sequence.mjs`.

## Evaluation

Every operation validates its own arguments at construction and returns a
memoized lazy sequence. Creating or composing operations does not traverse the
input. Requesting an output advances each source only until that output can be
produced, while every later traversal reuses the same realized prefix.

`lazy-take` with a zero limit completes without starting its source. Prefix
termination closes active iterators through the existing pull-transduction
contract. Callback failures, source failures, completion output, and repeated
traversal inherit the stable cached behavior of specification 0176.

## Semantics

Mapping, indexed mapping, keeping, filtering, removing, prefix take/drop,
predicate take/drop, nth sampling, interposition, adjacent deduplication,
value-semantic distinctness, one-level map concatenation, fixed-size partial
partitioning, and classifier partitioning are exactly the corresponding
transducer semantics.

Keeping drops only nil and preserves other falsey or nullish host values under
the existing value boundary. Partitions are persistent Vectors. Distinctness
uses Eliscript equality and hashing rather than JavaScript identity. Stateful
operations own fresh state per returned lazy result, and that state advances at
most once because the result is memoized.

## Compatibility

The existing `map`, `filter`, `take`, and related operations in
`stdlib/core/seq.eli` continue to return eager persistent Vectors. The portable
Array-oriented module also remains unchanged. Lazy behavior is explicit at the
call site and introduces no asynchronous iteration, application framework,
filesystem, process, or network dependency.

## Acceptance Criteria

- **LSC-01:** All seventeen operations exist on the Eliscript and JavaScript
  surfaces with exact arity and delegated transducer argument validation.
- **LSC-02:** Composed operations over an unbounded source perform no work at
  construction and pull only enough input for each requested output.
- **LSC-03:** Independent and interleaved traversals share one memoized output
  prefix without repeating callbacks or source reads.
- **LSC-04:** Every operation matches its transducer semantics, including
  indexed callbacks, nil removal, early termination, value equality, and final
  partial partitions.
- **LSC-05:** A zero-length take completes without starting the source, and
  malformed calls fail before consuming it.
- **LSC-06:** Seed and self-hosted ESM and Source Maps are byte-identical, and
  Bun and Node execution produce the same observable report.
