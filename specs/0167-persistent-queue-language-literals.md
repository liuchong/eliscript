# 0167: Persistent Queue Language Literals

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-10
- Depends on: 0069 Canonical Runtime Data Text,
  0082 Persistent Literal Runtime ABI and Explicit Host Containers,
  0166 Persistent Queue

## Summary

Eliscript exposes the canonical persistent Queue as an ordinary language value.
Programs may construct it explicitly with `(queue value...)` or use the reader
form `#queue [value...]`. Both forms lower to one dedicated
`persistent-queue-literal` IR node and link the package-owned literal runtime.

Canonical runtime data text prints and reads Queue values as `#queue [...]`.
This adds source and local data representation without changing the Queue
implementation or introducing a second Queue type.

## Source Semantics

The two executable forms are equivalent:

```elisp
(queue 1 :ready [2 3])
#queue [1 :ready [2 3]]
```

The tagged form requires a Vector payload. Whitespace between `#queue` and the
opening `[` is allowed. Strings and comments containing `#queue [` are ordinary
text.
An unclosed Queue form reports unexpected end of input at the opening `#`.

The reader represents tagged syntax as a located `(queue value...)` form. The
complete form spans the dispatch through the closing bracket, the synthetic
operator spans `#queue`, and every value retains its recursive source span.
Quoted Queue syntax is therefore constructor syntax data, consistent with
quoted Map and Set reader forms:

```elisp
'#queue [1 :ready]
```

produces syntax equivalent to `(queue 1 :ready)` and does not evaluate a Queue.

## Evaluation and Runtime ABI

Each member expression is evaluated exactly once from left to right. Values are
retained in FIFO order, including value-equal duplicates. Empty construction
returns the canonical empty Queue.

The compilation path is:

```text
#queue [value...]
  -> (queue value...)
  -> persistent-queue-literal IR
  -> __eliscript_queue(...)
  -> runtime/literals.mjs queue(...)
  -> persistentQueue(...)
```

The literal runtime import is emitted once and only when the module constructs
a persistent literal or another value already governed by specification 0082.
Seed and self-hosted compilers expose the same builtin, IR, ESM, Source Map, and
fixed-point behavior.

## Canonical Data Text

`printValue` emits Queue values in FIFO order as `#queue [value ...]`.
`readValue` accepts exactly that tag with a persistent Vector payload and
constructs the canonical persistent Queue. Printing a reconstructed Queue is
byte-identical and value equality is preserved.

The data reader rejects a non-Vector Queue payload. Existing depth, length, and
value-count limits apply recursively to Queue values.

## Boundaries

This specification does not extend the worker value codec, JSON, portable
closures, or implicit JavaScript conversion. Queue construction is rejected in
portable closures until a separately versioned transport contract includes the
Queue category. No protocol or transport version changes here.

The feature belongs to the reader, compiler, IR, runtime ABI, and canonical data
text. It has no framework, bundler, publishing, site-generation, or development
server dependency.

## Acceptance Criteria

- **PQL-01:** Explicit and tagged Queue forms produce canonical persistent Queue
  values in FIFO order and preserve left-to-right single evaluation.
- **PQL-02:** Tagged syntax preserves complete, operator, and recursive member
  spans and has matching Seed and self-hosted diagnostics.
- **PQL-03:** Both forms lower to `persistent-queue-literal` and emit one
  conditional `runtime/literals.mjs` Queue constructor import.
- **PQL-04:** Quoted tagged syntax remains canonical constructor syntax data.
- **PQL-05:** Canonical data text round-trips Queue values as `#queue [...]` and
  rejects non-Vector payloads.
- **PQL-06:** Seed and self-hosted readers, IR, ESM, Source Maps, and compiler
  fixed points agree.
- **PQL-07:** Generated modules and canonical data text agree under local Bun
  and Node execution.
- **PQL-08:** Portable closures and worker transport remain closed to Queue
  values until a separately versioned codec extension is specified.
