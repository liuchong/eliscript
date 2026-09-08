# 0061: Composable Transducers and Protocol-driven Into

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-29
- Depends on: 0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0059 Collection Capability Protocols and Reduction Foundation,
  0060 Collection Construction Protocols

## Summary

This specification adds the destination-independent collection transformation
layer. Stateless mapping/filtering, run-local indexed/keep/prefix/dedupe
transforms, and nested cat/mapcat transforms construct reusable transducers;
`composeTransducers` combines them in one declared-order reduction;
`transduce` executes the resulting reducing function; and `into` constructs a
target only through `IEmptyable`, `IConj`, and `IReduce`.

The transformation pipeline allocates no intermediate collection. A
transducer knows neither the input representation nor the destination. It is a
pure function from one reducing function to another, while state required by a
specific reduction is allocated only when that transducer is applied.

The original slice implemented the persistent protocol reference path for
`into`. [0062-owner-token-transient-collections.md](0062-owner-token-transient-collections.md)
now selects owner-token builders for editable persistent targets without
changing the observable API or results defined here.

## Public Runtime Surface

`runtime/core/transducer.mjs` exports:

- reducing-function construction: `completing`
- transducer constructors: `mapping`, `mappingIndexed`, `keeping`, `filtering`,
  `removing`, `taking`, `dropping`, `takingWhile`, `droppingWhile`, `deduping`,
  `catting`, and `mapcatting`
- composition: `composeTransducers`
- execution: `transduce`, `into`

The module imports only public collection operations. Private markers used to
recognize completed reducing functions and zero-input pipelines are not part
of the public value representation.

## Reducing Functions and Completion

`completing(step, complete = identity)` returns a frozen reducing function
with two exact call forms:

- `reducing(result, input)` performs one step
- `reducing(result)` performs completion

Any other arity fails deterministically. `step` and `complete` must be
functions. Completion is distinct from stepping so a future stateful
transducer may flush buffered state without introducing a second execution
API.

`transduce` accepts either a reducing function returned by `completing` or an
ordinary two-argument reducer. An ordinary reducer is lifted with identity
completion. A custom transducer may use `completing` to preserve downstream
completion while wrapping its step behavior.

Completion runs exactly once after ordinary exhaustion or explicit reduced
termination. A reduced value returned by the final completion is unwrapped at
the public boundary.

## Built-in Transducers

### Mapping

`mapping(transform)` applies `transform(input)` and passes the transformed
value to the downstream reducing function. The transform is called exactly
once for every source element that reaches this stage.

### Filtering

`filtering(predicate)` passes the original input downstream only when the
predicate returns an Eliscript-truthy value. Only `false`, `null`, and
`undefined` are false; `0` and the empty string are true. Rejected values leave
the current accumulator unchanged.

### Removing

`removing(predicate)` is the complement of filtering under the same Eliscript
truth contract. It rejects an input when the predicate result is truthy and
otherwise passes the original input downstream.

### Taking

`taking(limit)` accepts a non-negative safe integer. It passes at most `limit`
values downstream and uses the reduced wrapper from 0059 to stop source
traversal on the exact accepted element satisfying that limit.

The remaining count belongs to the reducing function produced for one
application, not to the reusable transducer. Reusing one `taking` value in
multiple `transduce` or `into` calls therefore starts every run with the full
limit.

`taking(0)` is a zero-input pipeline. `transduce` completes the initial result
without dispatching source reduction or acquiring an iterator. Composition
retains this property when any built-in stage admits no input.

### Dropping

`dropping(limit)` accepts a non-negative safe integer and rejects the first
`limit` source values reaching that stage. Its remaining count belongs to one
applied reducing function, so reusing the transducer starts each reduction
with fresh state.

### Indexed Mapping and Keeping

`mappingIndexed(transform)` calls `transform(index, input)` with a zero-based
index for every value reaching the stage. The index belongs to the applied
reducing function, so reusing the transducer starts every run at zero.

`keeping(transform)` calls its transform once and suppresses only an exact
`nil`/JavaScript `null` result. `false`, `undefined`, zero, and the empty string
remain ordinary output values. This preserves the distinction between the
language's nil value and other falsey host values.

### Predicate-controlled Prefixes

`takingWhile(predicate)` passes values while the predicate is
Eliscript-truthy. It consumes but does not pass the first rejected value, wraps
the current result as reduced, and closes an acquired iterator through normal
reduction termination.

`droppingWhile(predicate)` suppresses the longest truthy prefix. On the first
falsey result it passes that input and every later input downstream without
calling the predicate again. Both predicates and all stage state are allocated
or validated before traversal as appropriate.

### Adjacent Deduplication

`deduping()` suppresses only consecutive equivalent values. Equality uses the
shared Eliscript value contract rather than JavaScript identity, so separately
allocated equal persistent values collapse while a repeated value after a
different value remains visible. A private sentinel allows `undefined` to be a
normal first or previous value.

### Cat and Mapcat

`catting()` reduces each input collection through the downstream reducer and
flattens exactly one level. Inputs require only `IReduce`; they need not expose
an iterator or concrete collection representation. A downstream reduced value
stops the nested reduction and is rewrapped after the generic reduce boundary
so the outer source also terminates before another input is consumed.

`mapcatting(transform)` composes one validated mapping stage with `catting`.
It therefore maps each outer input once, flattens the returned reducible value,
and preserves the same nested early-termination behavior without allocating an
intermediate flattened collection.

## Composition

`composeTransducers(first, second, ...)` executes stages left to right for each
input. For example, mapping followed by filtering tests the mapped value. The
implementation applies the functions right to left around the destination
reducer so the observable input flow remains left to right.

Calling `composeTransducers()` returns an identity transducer. Every argument
must be a function. Built-in transducer functions and the composed function
are frozen and hold only immutable configuration. Reduction-local state is
created when the composed function receives its destination reducer.

## Transduce

The exact call is:

```text
transduce(transducer, reducer, initial, collection)
```

The operation:

1. lifts the reducer into a completing reducing function when necessary
2. applies the transducer exactly once to allocate run-local state
3. delegates source traversal to generic `reduce` and therefore `IReduce`
4. respects the shared reduced wrapper for early termination
5. invokes the transformed completion exactly once
6. returns the unwrapped completed value

There is no implicit-initial form. An explicit initial value keeps empty input,
completion, and target construction deterministic.

## Into

`into` has two call forms:

```text
into(target, source)
into(target, transducer, source)
```

It obtains the result seed with `empty(target)`. Editable persistent seeds
reduce through `conjBang` and complete through `persistentBang`; native and
external seeds reduce through `conj`. The original target and source remain
unchanged under either protocol contract.

The logical target category controls element semantics:

- Vector and Array collect values in traversal order
- Map accepts exact key/value entries
- Set collects unique members
- an external target may define its own category through `IEmptyable` and
  `IConj`

The source requires only `IReduce`; it does not need indexed access, a sequence
view, or a known concrete representation. A transformed `into` still executes
one source reduction and constructs no mapped or filtered intermediate value.

## Complexity and Allocation

For `n` consumed scalar inputs and constant-time user transforms, `transduce`
is O(n) time with O(s) reducing state, where `s` is the number of composed
stateful stages. Indexed mapping, prefix control, and adjacent dedupe use one
counter, flag, or previous value per application. Cat/mapcat is O(n + m), where
`m` is the number of nested values actually consumed. Composition depth is
fixed before traversal and does not grow the JavaScript call stack per input.

`into` inherits the logical target update cost. Owner-token persistent Vector,
Map, and Set builders copy each selected path once per owner and then reuse it.
Native immutable-copy adapters still copy their target on each addition, so
large native Array, Map, or Set targets may require O(n^2) copied elements.
This cost is explicit and is not hidden behind a mutable target alias.

The million-input scalar fixture counts source pulls, mapping calls, and
predicate calls and observes no persistent collection allocation. The bounded
`into` fixture constructs only its final persistent Vector. Specification 0062
adds structural allocation gates for transient-backed target construction.

## Failure and Extension Boundaries

Public constructor validation happens before source traversal. Invalid
transforms, predicates, limits, composed stages, reducers, transducer results,
or operation arities fail with `TypeError` and do not consume input.

Custom transducers remain ordinary JavaScript functions. They receive a
callable reducing function and must return a callable reducing function.
Returning `completing(step, complete)` is the supported way to preserve the
downstream completion chain. Custom implementations own their side effects and
state discipline; the runtime can validate callability but cannot prove
purity.

## Compatibility and Limits

This runtime surface is stable in Compatibility Baseline 2. It does not change
existing Eliscript literal emission or the array-backed `stdlib/sequence.eli`
API. Portable closure extraction remains a separate value-only contract and
does not weaken the runtime transducer semantics defined here.

`removing` and `dropping` were added with the maintained sequence algorithms in
[0063-protocol-driven-core-algorithms.md](0063-protocol-driven-core-algorithms.md).
Indexed mapping, keeping, predicate-controlled prefixes, adjacent dedupe, and
cat/mapcat are compatible additive extensions to the same stable contract.
This surface does not yet provide partitioning, global distinctness, async
transducers, parallel fold, or implicit completion initializers. Those
operations require concrete maintained use cases and their own completion or
resource contracts before joining the public surface.

## Acceptance Criteria

- **TRD-01:** Completing reducers have frozen identities, exact step and
  completion call forms, and exactly one completion per execution.
- **TRD-02:** Mapping and filtering compose in declared left-to-right order and
  call each transform or predicate once per value reaching that stage.
- **TRD-03:** Taking validates its limit, terminates on the exact boundary,
  closes traversed iterators, consumes no input at zero, and has fresh state in
  every run.
- **TRD-04:** Transduce delegates through `IReduce`, preserves shared reduced
  termination, completes after exhaustion or termination, and unwraps only at
  the public result boundary.
- **TRD-05:** A custom transducer built with `completing` composes with built-in
  stages and preserves downstream completion.
- **TRD-06:** Into constructs persistent and native Vector/Array, Map, and Set
  categories without mutating target or source values.
- **TRD-07:** External immutable source and target types participate using only
  `IReduce`, `IEmptyable`, and `IConj` extensions.
- **TRD-08:** Malformed constructors, arities, reducers, and transformation
  results fail before source traversal.
- **TRD-09:** Bun and Node.js produce identical composed, reduced, mapped-entry,
  and reused-state reports.
- **TRD-10:** One million generated inputs traverse in one pass with exact
  transform counts, bounded stack, and zero persistent collection allocations
  for a scalar reduction.
- **TRD-11:** A filtered and bounded persistent Vector `into` stops at the exact
  accepted count and builds no intermediate transformed collection.
- **TRD-12:** Existing collection, protocol, persistent-value, public-surface,
  conformance, compatibility, and complete repository suites remain green.
- **TRD-13:** Indexed mapping, keeping, take-while, and drop-while allocate
  fresh state per execution and preserve the exact nil/truth contracts.
- **TRD-14:** Adjacent dedupe uses Eliscript value equality, handles
  `undefined` as data, and preserves non-consecutive repeats.
- **TRD-15:** Cat and mapcat accept arbitrary reducible nested values and
  propagate downstream reduced termination to the outer source without an
  intermediate collection.

## Continuation

Owner-token Vector, Map, and Set builders, deterministic invalidation, and
transient-backed `into` are specified and evidenced in
[0062-owner-token-transient-collections.md](0062-owner-token-transient-collections.md).
Maintained sequence and keyed-data algorithms now use the protocol and
transient surface in
[0063-protocol-driven-core-algorithms.md](0063-protocol-driven-core-algorithms.md).
