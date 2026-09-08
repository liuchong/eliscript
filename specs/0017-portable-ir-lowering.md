# 0017: Portable IR Lowering

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0007 Explicit IR, 0015 Portable Lexical Analyzer,
  0016 Portable Macro Expander

## Summary

Generation 1 now owns its intermediate representation and lowering pass.
`bootstrap/compiler/ir.eli` defines a host-neutral data model, while
`bootstrap/compiler/lower.eli` converts analyzed portable syntax into that
model without consulting Emacs objects or reader-shaped seed forms.

```text
portable syntax -> macro expansion -> lexical analysis -> portable IR lowering
```

The generated reader, formatter, expander, analyzer, and lowerer can process all
thirteen bootstrap compiler modules, including the compiler driver source.

## Data Contract

A program is an ordinary object with `filename` and an ordered `body` array.
Every node contains `kind`, `span`, `value`, and `children`; nodes with
kind-specific metadata also contain `properties`. Constructors validate node
kinds, arrays, and child-node membership.

No Emacs struct, symbol identity, cons cell, or property list crosses this
boundary. Kinds and operators are strings. Properties use camel-case names:
`parameterCount`, `sourceOperator`, `mutable`, `childCount`, `sequential`,
`bindingCount`, `style`, and `computed`.

## Literal and Quoted Data

Ordinary null, boolean, number, and string literals stay JSON values. Keywords
and JavaScript `undefined` use explicit `literalKind` tags so their semantics
do not depend on host identity. An evaluated Keyword tag emits the canonical
runtime Keyword constructor defined by 0085; the portable IR itself remains
JSON-compatible.

Quoted compound data is recursively encoded with tagged `symbol`, `keyword`,
`undefined`, `list`, and `vector` objects. Literal object keys are normalized
to strings; computed keys remain child expressions. This representation can be
serialized, compared, cached, or passed to the host-neutral compiler driver.
Quoted brace syntax therefore remains a tagged `list` beginning with
`hash-map`; unquoted brace syntax lowers to `persistent-map-literal`.

## Lowering Surface

The portable lowerer implements all 55 public IR kinds from specification
0007. The surface includes modules and imports, declarations and exports,
functions and lexical bindings, all control forms, assignments, intrinsics,
native and persistent collection constructors, JavaScript interop, objects,
and ordinary host-library calls. Portable closure analysis
accepts persistent collection, evaluated Keyword, and quoted persistent values
now that 0088 defines their explicit worker codec. Static host-property Keyword
markers remain strings and do not cross that value boundary.

Lowering only consumes syntax that has passed macro expansion and lexical
analysis. It preserves operator distinctions and source order, performs no
optimization, and retains a source span on every semantic and structural node.

## Conformance Evidence

`tests/fixtures/bootstrap-ir.json` is shared by both implementations. The
Emacs oracle runs the seed reader, expander, analyzer, and lowerer, then
normalizes the seed structs into the portable object contract. Bun runs the
same sources through the generated pipeline and compares complete programs.

The fixture verifies:

- every public IR kind is reached
- complete recursive values, children, and kind-specific properties
- literal tags and recursively quoted data
- narrow structural spans and macro call-site origins
- all thirteen bootstrap compiler sources
- deterministic generated modules and Source Map files

## Downstream Integration

Generation 1 now reaches stable portable IR. Direct ESM and Source Map emission
is implemented in [0018-portable-emission.md](0018-portable-emission.md). The
host-neutral driver and reproducible self-compilation are implemented in
[0019-self-hosted-compiler.md](0019-self-hosted-compiler.md).

## Compatibility Freeze

Portable lowering covers all 55 public IR kinds using ordinary serializable
objects, typed children, kind-specific properties, and a source span on every
semantic and structural node. It preserves source order and operator identity
without optimization.

New language forms may add versioned IR surface through explicit specifications.
Host objects, implicit evaluation, and representation-changing optimization do
not enter this stable lowering boundary.
