# 0068: Immutable Metadata Semantics

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0048 Value Equality and Deterministic Hashing,
  0053-0057 Portable Persistent Values and Value Semantics,
  0058 Open Protocol Dispatch Core,
  0062 Owner-token Transient Collections,
  0067 First-class Keyword and Symbol Values

## Summary

This specification adds immutable root metadata to Eliscript Symbols and
persistent collections. Metadata is language data attached to a value wrapper;
it is not part of the value's logical contents, equality, or hash. Replacing
metadata creates at most one new root wrapper and shares the complete existing
List suffix, Vector trie, HAMT, or Set backing map.

The optimized runtime exposes open `IMeta` and `IWithMeta` protocols. A
portable implementation written in Eliscript supplies the same operations for
the four Eliscript-authored persistent collection families. Compiler source
locations remain explicit located syntax and never depend on user metadata.

## Metadata Value

Metadata is exactly one of:

- `null`/`nil`, meaning no metadata
- a persistent Map in the same implementation family as the annotated value

The optimized runtime accepts `runtime/core/map.mjs` values. The portable
reference accepts `stdlib/persistent-map.eli` values. Native JavaScript Object
and Map values are rejected so metadata itself retains immutable value
semantics and can participate in later deterministic printing and reading.

Metadata is not recursively interpreted. Keys and values may carry source,
documentation, tooling, compiler, or application annotations under the normal
persistent Map rules.

## Supported Values

The optimized runtime supports:

- Eliscript Symbols
- persistent Vectors
- persistent Maps
- persistent Sets

The portable standard library supports persistent Lists, Vectors, Maps, and
Sets. The runtime has no separate List class in this milestone. Keywords do
not support metadata because they are globally interned: attaching per-value
state would make an annotation mutate the meaning of every equal Keyword.
Symbols are non-interned value objects and therefore may carry metadata.

Host scalars, native containers, functions, Keywords, and arbitrary branded
objects do not acquire metadata implicitly.

## Protocol and API Surface

`runtime/core/metadata.mjs` exports:

```text
IMeta IWithMeta
meta supportsMetadata withMeta varyMeta
```

`IMeta` defines `meta`; `IWithMeta` defines `withMeta`. Both operations must be
implemented before `supportsMetadata(value)` returns true. `meta(value)`
returns `null` when no `IMeta` operation exists.

`stdlib/core/metadata.eli` exposes the Lisp-named runtime surface:

```text
IMeta IWithMeta
meta supports-metadata? with-meta vary-meta
```

`stdlib/metadata.eli` exposes the portable surface:

```text
meta metadata-valid? supports-metadata? with-meta vary-meta
```

The low-level per-collection `*-meta` and `*-with-meta` functions remain
public portable building blocks so portable modules can avoid representation
checks outside the one metadata dispatch module.

## Root Replacement and Sharing

`with-meta` replaces the complete metadata value; it does not merge Maps. If
the supplied metadata object is identical to the current metadata object, the
original annotated value is returned. Otherwise one root wrapper is created.

No collection node is copied solely to change metadata:

- a List wrapper shares the old root node's complete `rest` suffix
- a Vector wrapper shares its root trie and tail
- a Map wrapper shares its HAMT root
- a Set wrapper shares its backing persistent Map
- a Symbol wrapper shares its validated namespace and name values

`vary-meta` calls a transform with the current metadata followed by its extra
arguments, validates the returned value, and performs one `with-meta`.

## Propagation Rules

Operations that create a new version of the same root collection preserve its
metadata. This includes:

- List `cons`, `conj`, and `reverse`
- Vector `conj`, `assoc`, and `pop`
- Map `assoc` and `dissoc`
- Set `conj`, `disj`, union, intersection, and difference
- generic `empty` for optimized persistent collections
- transient conversion, editable updates, and `persistent!`

No-op updates still return the original value and therefore preserve metadata
by identity. Empty results preserve metadata through a non-canonical empty
wrapper when necessary; the global unannotated empty constants remain
unchanged.

Navigation does not copy parent metadata into child data. List `rest` and
`pop` return the existing suffix with that suffix's own metadata. Indexed
values, Map values, Set members, and sequence elements retain only metadata
already attached to those values.

## Equality, Hashing, and Host Conversion

Metadata never participates in `IEquiv`, `IHash`, `value-equal?`, or
`value-hash`. Annotated and unannotated versions with equal logical contents
are equal and have identical hashes. Metadata may therefore be changed without
invalidating a value's HAMT key or Set membership semantics.

Logical host conversions such as `toArray`, `toMap`, `toSet`, and the portable
`*-to-array`/`*-to-entries` functions emit collection contents only. They do
not insert metadata into the converted host value. A later explicit value
codec may choose a versioned metadata representation; this specification does
not define one.

## Failure Semantics

The optimized runtime validates public operations at the protocol boundary:

- `withMeta` on an unsupported value throws `TypeError`
- non-null metadata that is not a runtime persistent Map throws `TypeError`
- a non-function `varyMeta` transform throws `TypeError`
- an invalid transform result is rejected by `withMeta`

The portable reference returns `nil` for unsupported values, invalid metadata,
or a non-function transform. This follows the existing provisional portable
collection failure style until portable exception policy is unified. Valid
operations have the same data, propagation, equality, hashing, and sharing
semantics in both implementations.

## Acceptance Criteria

- **MET-01:** Runtime `IMeta` and `IWithMeta` are frozen protocols exposed
  through Lisp-named and JavaScript APIs.
- **MET-02:** Symbols and runtime persistent Vector, Map, and Set values support
  immutable metadata; Keywords and arbitrary host values do not.
- **MET-03:** Portable persistent List, Vector, Map, and Set values support the
  same root metadata model through `stdlib/metadata.eli`.
- **MET-04:** Metadata is `nil` or a persistent Map from the corresponding
  implementation family.
- **MET-05:** Replacing metadata copies only the root wrapper and shares every
  collection node, suffix, trie, tail, or backing Map.
- **MET-06:** Persistent updates, generic empty operations, and transient
  round trips preserve root metadata.
- **MET-07:** Navigation results do not inherit parent metadata.
- **MET-08:** Metadata does not affect runtime or portable equality and hashes.
- **MET-09:** Logical native conversions omit metadata.
- **MET-10:** `vary-meta` receives current metadata plus all extra arguments and
  validates the replacement.
- **MET-11:** Seed and self-hosted compilers emit byte-identical metadata and
  dependency artifacts, including Source Maps.
- **MET-12:** Bun and Node execute equivalent runtime and portable metadata
  fixtures; public-surface, compatibility, conformance, CLI, Vite, full test,
  and strict byte-compilation checks remain green.

## Next Boundary

Canonical runtime printer/reader round trips are now defined by
[0069-canonical-runtime-data-text.md](0069-canonical-runtime-data-text.md).
The matching portable List/collection model and cross-family byte contract are
implemented by [0071-canonical-portable-data-text.md](0071-canonical-portable-data-text.md).
Complete the P1 exit audit before source literals migrate from native
JavaScript containers to persistent Eliscript values.
