# 0168: Immutable Record Types

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-11
- Depends on: 0048 Value Equality and Deterministic Hashing,
  0049 Persistent Hash Map Trie Prototype,
  0058 Open Protocol Dispatch,
  0068 Immutable Metadata Semantics,
  0159 Declarative Protocol Definitions

## Summary

Eliscript provides declarative immutable Record types for named domain values.
`defrecord` creates one exact runtime type backed by the persistent HashMap and
generates positional, map-based, and predicate bindings. Records participate in
the existing collection, value, metadata, and open protocol systems without a
framework or host-application dependency.

```elisp
(import "./core/record.eli" define-record-type)

(defrecord Person [name age])

(defconst ada (->Person "Ada" 36))
(defconst grace (map->Person {:name "Grace" :age 37 :role "engineer"}))

[(get ada :name) (Person? grace)]
```

## Declaration

`defrecord` is valid only at module top level and accepts exactly one
unqualified type symbol and one Vector of distinct unqualified field symbols.
It expands to four bindings:

- `Type`, the exact runtime constructor used by `extend-type`;
- `->Type`, a positional constructor requiring exactly one value per field;
- `map->Type`, a constructor from an iterable associative value;
- `Type?`, an exact instance predicate.

The declaration calls the imported `define-record-type` operation from
`stdlib/core/record.eli`. This follows the existing declarative protocol rule:
syntax expansion defines the declaration shape while ordinary module imports
make the runtime capability explicit.

## Construction and Fields

The positional constructor preserves declaration order and rejects missing or
extra arguments. The map constructor retains extra entries and inserts `nil`
for each missing declared field. Neither constructor mutates its arguments.

Each declared field is available through both collection lookup with its
unqualified Keyword and direct Eliscript property access such as
`(get value :field)`. Field names that collide with a Record runtime member are
rejected when the type is defined.

## Persistent Map Semantics

A Record implements `ICounted`, `IEmptyable`, `IConj`, `ILookup`,
`IAssociative`, `IMap`, `ISeqable`, `IReduce`, and `IKVReduce`.

Association of a declared or extra key returns the same Record type and shares
the unchanged persistent map structure. Removing an extra key returns the same
Record type. Removing a declared field returns a persistent HashMap because the
result no longer satisfies the declared Record layout. `empty` likewise returns
an empty persistent HashMap. Historical values remain unchanged.

Lookup, association, and removal inherit the persistent HashMap's expected
O(log32 n) behavior. Count is O(1); iteration and reduction are O(n).

## Value, Metadata, and Protocols

Record equality requires the same exact generated type and equal map entries.
Two separately declared types are unequal even when their names, fields, and
values match. Equal Records have equal deterministic hashes. Metadata is
excluded from equality and hashing and is preserved by association, removal,
degradation to HashMap, and `empty`.

The generated `Type` is a JavaScript constructor with one exact prototype, so
ordinary `extend-type` declarations attach open protocol implementations to
that Record type. No protocol-specific methods are embedded by `defrecord`.

## Boundaries

This specification adds no reader literal, canonical data-text tag, JSON
encoding, worker transport encoding, or portable closure encoding. Those
boundaries continue to reject or explicitly adapt unknown runtime values until
separately versioned. Record types are language and runtime capabilities, not
framework, bundler, site-generation, or UI features.

## Acceptance Criteria

- **IRT-01:** `defrecord` validates its top-level name and field Vector and
  generates `Type`, `->Type`, `map->Type`, and `Type?` bindings.
- **IRT-02:** Positional and map constructors create frozen exact-type values,
  preserve extra entries, and fill missing declared fields with `nil`.
- **IRT-03:** Records implement persistent collection lookup, association,
  presence, traversal, key/value reduction, removal, and empty semantics.
- **IRT-04:** Extra-key removal preserves the Record type; declared-field
  removal degrades to persistent HashMap.
- **IRT-05:** Equality is exact-type and value based, hashing agrees with
  equality, and metadata is excluded while preserved across updates.
- **IRT-06:** Generated Record constructors are valid `extend-type` targets.
- **IRT-07:** Seed and self-hosted expansion, ESM, and Source Maps agree, and
  generated modules execute identically under local Bun and Node.
