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
- scalar and array-pattern bindings, references, literals, arrays, quoted
  values, functions, await, and throw
- conditionals, sequences, lexical bindings, assignments, loops, and
  short-circuit and exception expressions
- intrinsics, ordinary and computed calls, invocation, and application
- objects, properties, method calls, constructors, and raw JavaScript interop
- React elements and fragments

Import specifiers, function parameters, lexical and catch bindings, assignment
pairs, conditional and exception clauses, and object properties are first-class
nodes rather than untyped list positions. `eliscript-ir-walk` visits every node
in deterministic preorder, including these structural children.

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
`eliscript-emit-ir-module`. The dedicated IR backend recursively emits every
expression, declaration, structural child, and module wrapper without invoking
the canonical-form conversion functions or the original form backend.

The original formatter remains available as a compatibility API and an
independent regression oracle. It is not part of the production compilation
path. The two backends are required to produce byte-identical ESM for the
implemented language surface.

## Acceptance Evidence

- IR structure tests inspect declarations, mutability, functions, lexical
  bindings, conditionals, computed callees, and node kinds directly.
- Span tests verify that lowered handwritten and macro-generated nodes retain
  their source origins.
- A guard test replaces every form-conversion and form-emission entry point
  with a failure and verifies that IR emission still succeeds.
- A broad language fixture compares the direct and compatibility backends
  byte-for-byte.
- The complete existing ERT suite passes through the direct IR pipeline.
- CLI snapshots remain byte-for-byte stable and Bun executes the emitted ESM.
- The portable `ir.eli` and `lower.eli` implementations serialize this model
  as ordinary JavaScript objects and arrays. A shared oracle compares complete
  seed and portable trees for all 51 node kinds and all bootstrap sources.

## Deferred Work

- optimization and canonicalization passes over IR
- replacing internal condition messages with structured diagnostics
