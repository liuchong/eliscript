# 0067: First-class Keyword and Symbol Values

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0048 Value Equality and Deterministic Hashing,
  0049 Persistent Hash Map Trie Prototype,
  0050 Persistent Hash Set Prototype,
  0057 Portable Value Semantics Core,
  0058 Open Protocol Dispatch Core,
  0066 Eliscript-authored Core Protocol Surface and Algorithms

## Summary

This specification introduces immutable Keyword and Eliscript Symbol runtime
values. They are ordinary language data rather than compiler bindings or native
JavaScript Symbols. Both carry an optional namespace and a required name,
participate in recursive equality and deterministic hashing, and can be Map
keys or Set members through both the optimized runtime and portable Eliscript
value cores.

This is the first prerequisite for metadata, deterministic printing/reading,
and persistent literal migration. This slice originally introduced explicit
constructors without changing source keyword or quoted-symbol emission;
specification 0085 now applies the same canonical Keyword values to evaluated
source literals.

## Value Model

A Keyword or Symbol has exactly two logical fields:

- `namespace`: `null` for an unqualified value, otherwise a non-empty string
- `name`: a non-empty string

Neither field may contain `/`. A one-argument constructor accepts either
`name` or `namespace/name`; the qualified spelling must contain exactly one
separator and two non-empty parts. A two-argument constructor accepts
`namespace` or `null`, followed by `name`.

Keywords are interned by their canonical qualified spelling. Reconstructing a
Keyword with equal parts returns the same object. Symbols are not interned:
separately constructed Symbols are different JavaScript objects but equal
Eliscript values when both fields match. Keyword and Symbol remain distinct
categories even when their fields match.

Instances are frozen. Their logical fields are exposed through read-only
accessors. Direct class construction is rejected so validation and Keyword
interning cannot be bypassed.

## Runtime and Standard-library Surface

`runtime/core/identifier.mjs` exports:

```text
Keyword EliscriptSymbol
keyword eliscriptSymbol
isKeyword isEliscriptSymbol isIdentifier
identifierName identifierNamespace qualifiedIdentifierName
```

`stdlib/core/identifier.eli` exposes the Lisp-named surface:

```text
Keyword EliscriptSymbol
keyword keyword? symbol symbol? identifier?
identifier-name identifier-namespace qualified-name
```

`keyword` and `symbol` accept the one- or two-argument forms. Predicate and
accessor functions provide the public representation-independent API.

## Logical Type Contract

Each value owns one non-enumerable data property keyed by
`Symbol.for("eliscript.value.type")`. Its value is exactly `"keyword"` or
`"symbol"`. The `value-type` compiler primitive recognizes only those two own
data-property values; every other object and function retains its JavaScript
`typeof` category. Property-descriptor failures from hostile host Proxies fall
back to the host category.

The global brand lets independently generated portable modules recognize the
logical category without importing the optimized runtime. It is a narrow data
interchange contract, not permission to treat arbitrary branded objects as
valid identifiers: public accessors still validate namespace and name.

## Equality and Hashing

Two identifiers are equal exactly when:

1. both have the same Keyword or Symbol category
2. both namespaces are equal, including `null`
3. both names are equal

Keyword and Symbol use separate frozen 32-bit category tags. Hashing mixes the
category tag, a distinct unqualified marker or namespace string hash, and the
name string hash, then applies the shared finalizer. The optimized
`IEquiv`/`IHash` slots and `stdlib/value.eli` implement the same contract and
frozen constants.

Equal independently constructed Symbols therefore have equal hashes. Runtime
HAMT Map/Set and portable value Map/Set lookup work with freshly reconstructed
identifiers rather than JavaScript object identity.

## Text and Serialization

`String(keyword("article/title"))` is `":article/title"`.
`String(symbol("article/title"))` is `"article/title"`. Unqualified values use
the same rules without a namespace prefix.

JSON serialization throws a deterministic error. Silent `{}` output would
lose both category and fields. Specification 0088 defines the explicit
versioned worker representation instead.

## Compatibility and Limits

This stable M8 surface adds explicit values and extends
`value-type`, equality, hashing, and collection-key behavior without changing
reader syntax, keyword property keys, host-library calling conventions, quoted forms, or
compiler binding Symbols.

Immutable Symbol metadata is now specified by 0068; Keywords remain
unannotated because they are interned. Canonical optimized-runtime
printing/reading is specified by 0069, including tagged escape forms for
otherwise ambiguous names. Portable data text is implemented by 0071, while
the versioned Emacs worker representation is implemented by 0088. Namespace
aliases remain separate work. Automatic source Keyword emission is implemented
by 0085. Native JavaScript `Symbol` values retain the behavior defined by 0048.

## Acceptance Criteria

- **KSV-01:** Both value classes are frozen, constructor-guarded, and expose
  validated read-only namespace and name fields.
- **KSV-02:** Keywords intern by canonical spelling; Symbols are non-interned
  but value-equal when their fields match.
- **KSV-03:** Keyword and Symbol categories remain unequal and use distinct
  deterministic hashes.
- **KSV-04:** Qualified and unqualified constructor forms reject empty,
  ambiguous, and multi-separator names deterministically.
- **KSV-05:** Runtime persistent Map and Set lookup accepts freshly
  reconstructed equal identifier keys and members.
- **KSV-06:** Portable `value-equal?`, `value-hash`, value Maps, and value Sets
  implement the same identifier behavior.
- **KSV-07:** Bun and Node.js agree on frozen qualified and unqualified
  Keyword/Symbol hashes and category invariants.
- **KSV-08:** Seed and self-hosted compilers emit byte-identical `value-type`,
  `stdlib/value.eli`, and `stdlib/core/identifier.eli` artifacts.
- **KSV-09:** Ordinary JSON serialization fails explicitly, while the accepted
  0088 codec transports the identifier category without coercion.
- **KSV-10:** Public-surface, compatibility, conformance, documentation, CLI,
  full default-test, and strict byte-compilation checks remain green. No
  application framework is a prerequisite for identifier semantics.

## Next Slice

Immutable metadata is implemented by
[0068-immutable-metadata-semantics.md](0068-immutable-metadata-semantics.md).
The optimized-runtime printer/reader round trip exists in 0069. Portable
Keyword/Symbol values and collection/List data text are implemented by 0070
and 0071. The P1 exit audit is complete, and specification 0085 implements
source Keyword emission while preserving explicit native JavaScript property
keys and JSX tag semantics rather than treating every keyword-shaped token
alike.
