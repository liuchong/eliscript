# 0070: Portable Keyword and Symbol Values

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0057 Portable Value Semantics Core,
  0067 First-class Keyword and Symbol Values

## Summary

This specification gives portable Eliscript code its own Keyword and Symbol
representation. The values are authored and constructed in `.eli`, require no
runtime class constructor, and participate in the same equality, hashing,
Map-key, and Set-membership contracts as the optimized runtime identifiers.

Portable identifiers close a language-model gap: portable persistent
collections no longer need host-injected runtime objects in order to represent
named data.

## Representation

`stdlib/identifier.eli` defines two logical immutable object shapes:

```text
{ kind: "eliscript/keyword", namespace: string | nil, name: string }
{ kind: "eliscript/symbol",  namespace: string | nil, name: string }
```

The properties are construction data, not a public mutation surface. Portable
functions cannot use `put`, raw JavaScript, host method calls, or host
constructors, so selected portable closures cannot alter an identifier after
construction. As with the existing Eliscript-authored persistent collection
roots, opaque host code remains capable of violating the representation and is
outside the portable-value contract.

The compiler's `value-type` intrinsic recognizes the own `kind` property
without invoking getters. It continues to recognize optimized runtime
identifiers through their private logical-type descriptor. Both
representations therefore report `keyword` or `symbol` to portable code.

## Construction and Validation

`keyword` and `symbol` accept either:

```text
(keyword "name")
(keyword "namespace/name")
(keyword "namespace" "name")
(keyword nil "name")
```

The same forms apply to `symbol`. A one-argument value of the requested
identifier category is returned unchanged. Otherwise:

- names are non-empty strings
- namespaces are nil or non-empty strings
- namespace and name parts cannot contain `/`
- a qualified spelling contains exactly one non-leading, non-trailing `/`
- malformed input returns nil from the portable constructor

Portable Keywords are not interned. Interning is an optimization of the
runtime implementation, not part of Keyword value identity. Equal portable
and runtime Keywords still have equal deterministic hashes.

## Public Surface

`stdlib/identifier.eli` exports:

```text
identifier-name identifier-namespace identifier?
keyword keyword? portable-keyword? portable-symbol?
qualified-name symbol symbol?
```

The general predicates and accessors accept either portable or optimized
runtime identifiers. The `portable-*?` predicates distinguish the concrete
portable representation when an adapter needs that information.

## Cross-representation Semantics

`stdlib/value.eli` remains authoritative for equality and hashing. It observes
the shared logical type and namespace/name fields, so:

- a portable Keyword equals an optimized Keyword with the same parts
- a portable Symbol equals an optimized Symbol with the same parts
- Keyword and Symbol categories remain distinct
- equal cross-representation values have equal hashes
- either representation can retrieve the other from a value Map or Set

No conversion is required for these language-level operations.

## Acceptance Criteria

- **PIV-01:** Portable constructors produce the documented Keyword and Symbol
  shapes without runtime imports.
- **PIV-02:** Qualified and two-part construction enforce the same namespace
  and name grammar as optimized identifiers.
- **PIV-03:** `value-type` recognizes portable identifiers in both seed and
  self-hosted compiler output without invoking hostile properties.
- **PIV-04:** Runtime and portable identifiers with equal parts compare equal
  and have equal deterministic hashes.
- **PIV-05:** Cross-representation Map lookup and Set membership preserve
  category distinctions and collapse equal values.
- **PIV-06:** Seed and self-hosted artifacts are byte-identical and execute
  equivalently under Bun and Node.
- **PIV-07:** The public-surface, compatibility, conformance, and full test
  gates track the new module and logical-type behavior.

## Deferred Work

Portable Symbol metadata is not introduced by this specification. Portable
collection metadata remains covered by 0068; a unified syntax-capable scalar
metadata representation must be specified before source forms migrate to
portable Symbols.
