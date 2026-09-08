# 0008: Direct ECMAScript Emission from IR

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0003 Core Language v0, 0007 Explicit Compiler IR

## Summary

The production compiler emits ECMAScript directly from `eliscript-ir-program`
and `eliscript-ir-node` values. It no longer converts IR back into Emacs
reader-shaped forms before formatting output.

```text
located forms -> expansion -> analysis -> IR lowering -> direct IR emitter
                                                       -> ECMAScript module
```

This makes IR an actual compiler phase boundary rather than an observational
view layered over the original formatter.

## Backend Boundary

`eliscript-ir-emitter.el` owns direct emission for:

- module declarations, imports, variables, functions, and exports
- scalar and collection literals, references, functions, and calls
- conditionals, sequences, lexical bindings, assignment, and loops
- arithmetic, comparison, list, vector, and short-circuit intrinsics
- objects, property operations, JavaScript methods, constructors, and raw
  JavaScript escape hatches

Structural IR nodes such as parameters, lexical bindings, import specifiers,
assignment pairs, conditional clauses, and object properties are consumed in
their typed positions. They are never flattened into anonymous list slots.

The public `eliscript-compile-string` and `eliscript-compile-file` paths call
`eliscript-emit-ir-module`. The compatibility form emitter is not reachable
from that entry point.

## Output Stability

Direct emission preserves the established generated-module contract:

- deterministic, readable ESM formatting
- the existing Lisp-truthiness helper and value semantics
- stable identifier munging and JavaScript interop
- byte-identical CLI snapshots
- no Bun-specific output syntax or runtime dependency

The original form emitter remains available for compatibility and as an
independent reference backend during the seed-compiler phase. Shared helpers
are limited to scalar formatting, indentation, temporary names, identifier
mapping, arity failures, and quoted-data formatting.

Generation 1 implements the same boundary in
`bootstrap/compiler/emitter.eli`. Because portable JavaScript strings do not
carry Emacs text properties, this backend composes explicit `{text, marks}`
fragments. Concatenation, joining, indentation, and source location operations
move marks together with text, preserving one formatter for plain and
source-mapped output.

## Acceptance Evidence

- For the M1 language core, the direct backend and compatibility backend
  produce byte-identical output for a broad fixture covering declarations,
  imports, bindings, control flow, mutation, data, functions, calls, and
  interop. Host libraries compile through this generic surface without
  target-specific IR extensions.
- A guard test disables IR-to-form conversion and all form-emitter entry points;
  direct IR emission still compiles a complete module.
- The checked-in CLI snapshot remains unchanged.
- Bun executes the generated fixture and validates its exports and behavior.
- Every existing IR node retains its source span through emission.
- The generated Eliscript backend matches the seed ESM byte-for-byte across
  the shared IR fixture and all thirteen compiler modules.

## Deferred Work

- optional IR validation at backend boundaries
- optimization and canonicalization passes

## Compatibility Freeze

The public production path emits directly from typed IR and must not regain a
dependency on reader-shaped forms or the compatibility form emitter. For an
unchanged source and compiler revision, ESM and Source Map output remain
byte-stable across seed and self-hosted compilation.

Backend validation and optimization may evolve internally, but they must
preserve language behavior, deterministic output, source locations, and
host-neutral standard ESM.
