# 0163: Replayable Sequence Head and Tail Views

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-10
- Depends on: 0059 Collection Capability Protocols and Reduction Foundation,
  0066 Eliscript-authored Core Protocol Surface and Algorithms,
  0151 Replayable Bounded and Unbounded Sequence Sources

## Summary

Eliscript extends its small immutable sequence-view model with composable head
and tail operations. The maintained Eliscript standard library exports:

```text
ffirst fnext next nfirst nnext nth-next nth-rest prepend rest second
```

The JavaScript runtime facade exports equivalent camel-cased operations. This
feature does not introduce a pervasive lazy-sequence abstraction: all results
reuse the existing replayable `SequenceView` substrate.

## Head and Tail Semantics

`rest` skips one value and returns a possibly-empty sequence. Empty known
sources return the canonical empty persistent List. `next` skips one value and
normalizes an empty result to nil. `nth-rest` and `nth-next` generalize those
operations to a non-negative safe-integer offset. At offset zero, `nth-rest`
returns its original collection by identity while `nth-next` returns its
normalized sequence.

`prepend` returns a new replayable view whose first value is the supplied value
and whose remaining values traverse the input sequence. The name remains
distinct from the language intrinsic `cons`, which constructs a persistent
List and retains its established type-specific contract.

`second` preserves a present `undefined` value separately from an absent
second position. `ffirst`, `nfirst`, `fnext`, and `nnext` are ordinary
compositions of `first` and `next`; they add no special collection dispatch.

## Replay, Cardinality, and Realization

Every traversal creates fresh iterator state. Slicing skips only when a result
is consumed, and prepending does not inspect its source. Known finite counts
are adjusted without traversal, dynamic finite counts remain dynamic, unknown
counts remain unknown, and explicit unbounded markers remain unbounded.
Consequently, counting an unbounded derived view fails before invoking its
source factory.

Sequence normalization of an unknown-count view probes one iterator step to
distinguish empty from non-empty. It never traverses the complete source merely
to answer `seq`, `next`, or an emptiness query. As with all replayable views,
source callbacks can run again for each independent traversal.

## Host Boundary

These operations use only collection protocols and the existing sequence-view
runtime substrate. They perform no host I/O, framework integration, implicit
native-container conversion, or shared mutation.

## Acceptance Criteria

- **SHT-01:** Both public language surfaces export all ten documented
  operations with matching argument and nil behavior.
- **SHT-02:** `rest` and `nth-rest` return possibly-empty sequences while
  `next` and `nth-next` normalize exhausted results to nil.
- **SHT-03:** `prepend` preserves source order, replayability, and present
  `undefined` values without realizing the source at construction.
- **SHT-04:** Nested selectors compose `first` and `next` without concrete
  collection assumptions.
- **SHT-05:** Finite, dynamic, unknown, and unbounded cardinality categories
  remain correct after slicing and prepending.
- **SHT-06:** Unknown-count `seq` probes at most one iterator step, and counting
  an unbounded derived view rejects before invoking its source factory.
- **SHT-07:** Invalid offsets reject before source normalization or traversal.
- **SHT-08:** Eliscript-authored functions compile reproducibly and execute
  with matching observable results under local Bun and Node hosts.
