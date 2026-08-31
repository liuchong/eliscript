# 0085: First-class Source Keyword Values

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0005 Compile-time Macros,
  0007 Explicit Intermediate Representation,
  0014 Portable Syntax and Reader,
  0019 Self-hosted Compiler Driver,
  0067 First-class Keyword and Symbol Values,
  0082 Persistent Literal Runtime ABI,
  0084 Persistent Map Source Syntax

## Summary

Keyword expressions now evaluate to canonical immutable Keyword values rather
than JavaScript strings:

```text
:ready
:article/title
```

Generated ESM constructs them through the package-owned literal runtime ABI,
which delegates to the optimized interned Keyword implementation. Persistent
Map literals therefore use value-semantic Keyword keys by default.

This is a language, compiler, and runtime contract. Application frameworks,
bundlers, publishing adapters, and development servers remain replaceable
integration evidence and are not dependencies or goals of Keyword semantics.

## Source Grammar

A source Keyword starts with `:` and contains either a non-empty name or one
non-empty namespace/name pair. The logical name may contain ordinary source
characters, but `/` is reserved as the namespace separator:

```text
keyword = ":" name | ":" namespace "/" name
```

Empty names, leading or trailing separators, and multiple separators are
reader errors. Seed and self-hosted readers report the same located structured
diagnostic before macro expansion or analysis.

## Value Semantics

In evaluated expression position, a Keyword literal lowers to ordinary
`literal` IR with an explicit Keyword category. The seed representation uses
its host Keyword value; portable IR uses a string value plus `literalKind`.
Both emit exactly:

```text
__eliscript_keyword("namespace/name")
```

The binding is imported from `eliscript/runtime/literals.mjs`. That ABI re-exports
the canonical runtime `keyword` constructor and does not define another
identifier representation. Repeated equal source Keywords are interned,
frozen, value-equal, hash-equal, and valid persistent Map or Set keys.

Qualified source Keywords preserve namespace and name through the public
identifier accessors. Their string form includes the leading colon. A native
string with the same spelling or qualified name remains a different value and
does not retrieve a Keyword-keyed Map entry.

## Explicit Host Syntax Boundary

Keyword-shaped tokens retain string-key behavior only in syntax positions
that explicitly name native JavaScript members:

- static `js-object` or compatibility object property keys
- property keys in `get`, `put`, and `aref`
- method names in `js-call`
- keys in `object-has?` and `object-assoc`
- application element tags and import modifiers

Those positions emit the name without the leading colon and do not construct a
Keyword. A module containing only such host markers does not import the literal
runtime. A computed key expression remains an ordinary value expression and
constructs a Keyword when its source value is a Keyword literal.

This distinction preserves direct JavaScript interoperability without
weakening language-value semantics or silently converting persistent Map keys
back to strings.

## Macro and Quote Boundary

Macros may return or generate Keyword expressions. Expanded evaluated code
constructs the same canonical runtime Keyword and retains the macro call-site
source location.

Specification 0087 now materializes quoted Keywords as canonical Keyword
values inside persistent quoted data. Quote still suppresses evaluation and
macro expansion; it no longer erases the Keyword category into a string.

## Portable Boundary

Optimized source Keyword values are not JSON-compatible and fail explicit JSON
serialization. Portable closures accept evaluated and quoted Keyword values;
callers select the 0088 worker codec when those values cross the process
boundary.

Keyword-shaped native property keys remain portable because they compile to
strings and cross the worker boundary as ordinary host-object keys. The
Eliscript-authored identifier constructor from specification 0070 and source
Keyword syntax now share the same transport category.

## Import and Bootstrap Discipline

The compiler emits one sorted literal-runtime import when a module contains an
evaluated or quoted Keyword, persistent List/Vector quote, or persistent
Vector/Map constructor. Static host-key tokens alone do not trigger that
import.

Seed and self-hosted compilers must agree on reader trees, macro expansion,
complete IR, ESM, Source Maps, diagnostics, and import selection. The
three-generation compiler fixed point remains byte-identical under the same
arbitrary-temporary-directory test.

## Compatibility Boundary

This is an intentional provisional semantic change. Source Keyword expressions
previously evaluated to strings without the leading colon. Code that requires
a native string value must now write a string literal explicitly. Static host
property and tag syntax retains its prior behavior.

The explicit runtime `keyword` constructors remain valid. Quoted identifiers
are defined by 0087. Automatic namespace aliases and namespaced Map notation
remain separate contracts.

## P3 Completion

Specifications 0093 and 0094 now close static transient ownership analysis and
legacy List-operation migration. Specification 0095 removes the provisional
host aliases and promotes the literal/host-container family to stable;
application clients are not core acceptance evidence.

## Acceptance Criteria

- **SKL-01:** Unqualified and qualified source Keywords construct canonical
  optimized runtime Keyword values.
- **SKL-02:** Empty, malformed, and multiply qualified source Keywords fail in
  both readers with matching located diagnostics.
- **SKL-03:** Generated Keyword values are frozen and intern by canonical
  qualified spelling.
- **SKL-04:** Source Keyword Map keys use value equality and hashing; equal
  reconstructed Keywords retrieve entries while strings do not.
- **SKL-05:** Seed and self-hosted IR retain an explicit Keyword category and
  emit byte-identical constructor calls.
- **SKL-06:** Literal-runtime imports are sorted, emitted once, and absent from
  host-marker-only modules.
- **SKL-07:** Static object keys, property keys, method names, and application
  tags preserve native string semantics.
- **SKL-08:** Computed expression positions preserve normal Keyword value
  semantics rather than applying host-key coercion.
- **SKL-09:** Macro-generated evaluated Keywords construct runtime values with
  matching seed/self-hosted expansion and source locations.
- **SKL-10:** Quoted Keywords retain their syntax category as canonical Keyword
  values under the 0087 persistent quote contract.
- **SKL-11:** Portable closures accept evaluated and quoted source Keywords
  while Keyword-shaped static host keys retain native string behavior.
- **SKL-12:** Bun and Node produce identical Keyword identity, name, string,
  and persistent Map reports.
- **SKL-13:** ESM, Source Maps, diagnostics, complete IR, and the compiler
  fixed point remain seed/self-hosted identical.
- **SKL-14:** Public-surface, compatibility, and conformance registries track
  the new runtime ABI export and provisional behavior.
- **SKL-15:** No application framework, bundler, or publishing adapter is a
  compiler/runtime dependency or core acceptance condition for this feature.
