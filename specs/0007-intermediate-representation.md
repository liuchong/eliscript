# 0007: Explicit Compiler Intermediate Representation

- Status: Implemented
- Date: 2026-08-28
- Depends on: 0004 Lexical Analysis, 0006 Located Forms

## Summary

Eliscript now lowers analyzed forms into an explicit intermediate
representation before ECMAScript emission. The IR separates language semantics
from Emacs reader data and gives the seed and future self-hosted compilers a
shared structural contract.

```text
located forms -> macro expansion -> lexical analysis -> IR lowering
              -> IR emitter -> ECMAScript
```

The public `eliscript-compile-ir-string` and `eliscript-compile-ir-file`
functions expose the analyzed IR without emitting JavaScript.

## Program and Nodes

`eliscript-ir-program` contains the source filename and an ordered top-level
body. Every `eliscript-ir-node` contains:

- a documented node kind
- the originating source span
- an optional scalar value
- ordered child nodes
- kind-specific properties

The node-kind vocabulary covers the complete implemented language surface:

- modules, imports, variables, functions, exports, and expression statements
- bindings, references, literals, arrays, quoted values, and functions
- conditionals, sequences, lexical bindings, assignments, loops, and
  short-circuit expressions
- intrinsics, ordinary and computed calls, invocation, and application
- objects, properties, method calls, constructors, and raw JavaScript interop

Import specifiers, function parameters, lexical bindings, assignment pairs,
conditional clauses, and object properties are first-class nodes rather than
untyped list positions. `eliscript-ir-walk` visits every node in deterministic
preorder, including these structural children.

## Normalization

Lowering happens only after macro expansion and successful lexical analysis.
It normalizes reader aliases where their runtime meaning is identical:

- `defn` becomes a function declaration
- `fn` becomes a function expression
- `let` and `let*` share one node kind with a `sequential` property

Operators whose distinction affects behavior remain explicit values, including
`and` versus `or`, assignment forms, arithmetic aliases, and interop forms.
Lowering does not optimize, reorder, or evaluate application code.

## Source Locations

Every IR node retains the span of the located form that produced it. Synthetic
nodes such as parameter bindings and object properties use the narrowest
available child span. Macro-generated IR keeps the macro call origin established
by specification 0006.

This makes IR the authoritative source-location input for future diagnostics
and source maps; later backends do not need to inspect reader forms.

## Emission Boundary

The public compiler now sends an `eliscript-ir-program` to
`eliscript-emit-ir-module`. The current implementation uses a normalization
bridge from IR back to canonical forms before invoking the stable M0 formatter.
This preserves byte-for-byte output while the direct IR emitter is developed.

The bridge is a compatibility backend, not the front-end contract. New compiler
phases and public APIs consume IR, and direct ECMAScript emission must not
reintroduce reader-shaped forms as its semantic interface.

## Acceptance Evidence

- IR structure tests inspect declarations, mutability, functions, lexical
  bindings, conditionals, computed callees, and node kinds directly.
- Span tests verify that lowered handwritten and macro-generated nodes retain
  their source origins.
- The complete existing ERT suite passes through the IR pipeline.
- CLI snapshots remain byte-for-byte stable and Bun executes the emitted ESM.

## Deferred Work

- direct ECMAScript formatting from IR nodes
- source-map generation driven by IR spans
- structured serialization for cross-implementation conformance fixtures
- optimization and canonicalization passes over IR
- replacing internal condition messages with structured diagnostics
