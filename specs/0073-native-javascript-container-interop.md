# 0073: Native JavaScript Container Interop

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0057 Portable Value Semantics Core, 0070 Portable Keyword and Symbol Values

## Summary

This specification defines the explicit boundary between Eliscript persistent
values and mutable native JavaScript containers. It adds native constructors
and predicates, shallow conversion by default, explicit deep conversion,
cycle and resource diagnostics, and a focused plain-object adapter for host
APIs and ordinary JavaScript option objects.

The implementation lives in `stdlib/interop/js.eli`. Conversion traversal,
category selection, duplicate detection, path construction, and error policy
are authored in Eliscript. Small raw host functions provide native container
allocation, internal-slot-safe Map/Set checks, property descriptors, WeakMap
identity tracking, and safe data-property definition.

## Public Surface

The module exports:

```text
js-array js-object js-map js-set
array? object? js-map? js-set?
to-js to-js-object from-js
```

`array?` uses the native cross-realm Array predicate. `object?` accepts only a
plain object with a null or realm-root object prototype. Class instances,
Arrays, Maps, Sets, functions, dates, promises, typed arrays, DOM objects, and
other opaque values are not plain objects. Map and Set predicates validate
their native internal slots and work across JavaScript realms.

`js-array`, `js-map`, and `js-set` construct mutable native containers.
`js-map` entries are two-value native arrays. `js-object` receives alternating
string keys and values and defines own enumerable data properties, including a
literal `__proto__` key, without changing the result prototype.

## Category Mapping

The conversion families are:

| Eliscript/source category | `to-js` target | `from-js` target |
| --- | --- | --- |
| persistent List | Array | existing List family when already persistent |
| persistent Vector | Array | runtime Vector for native Array; existing persistent family otherwise |
| persistent Map | Map | runtime Map for native Map/object; existing persistent family otherwise |
| persistent Set | Set | runtime Set for native Set; existing persistent family otherwise |
| native plain object | plain object | runtime persistent Map with string keys |
| scalar, Keyword, Symbol | unchanged | unchanged |

Both portable and optimized runtime persistent collections are recognized.
Deep conversion of an existing persistent value preserves whether it uses the
portable or optimized runtime representation. A native source snapshots into
the optimized runtime Vector, Map, and Set implementations. Metadata is not a
host-container property and is not copied across this boundary.

## Shallow Conversion

Shallow conversion is the default.

- `to-js` converts one persistent collection root and leaves its child values
  unchanged.
- `from-js` snapshots one native container root and leaves its child values
  unchanged.
- a value already in the target family is returned unchanged.
- functions and opaque host values pass through unchanged.

Shallow conversion makes host cost visible and avoids accidentally walking a
large graph at a package or React boundary.

## Deep Conversion

`{ deep: true }` recursively converts every supported child container.
Persistent values, native Arrays, Maps, Sets, and plain objects may be mixed in
one graph. Scalars and logical identifiers pass unchanged. Functions and
opaque objects are rejected with `ELI-INTEROP-UNSUPPORTED` at their exact
path.

A conversion owns a WeakMap memo. Repeated references to the same source
container reuse one converted target identity. A second WeakMap tracks active
ancestors. Encountering an active source is a cycle error with both the
current path and the origin path. Repeated acyclic sharing is therefore
preserved rather than mistaken for a cycle.

Conversion never mutates a source container. Native inputs are read and new
persistent roots are constructed; persistent inputs are traversed and new
native roots are allocated only where conversion requires them.

## Plain Objects

Only enumerable own string-keyed data properties participate. Inherited and
non-enumerable properties are ignored. An enumerable Symbol key is rejected
instead of being silently dropped. An accessor property is rejected without
invoking its getter.

`from-js` converts a plain object to a persistent runtime Map. `to-js` in deep
mode copies a plain object while converting its values. Shallow `to-js` returns
an existing native object unchanged.

`to-js-object` always creates one plain object from a persistent Map, native
Map, or plain object. Map keys must be strings. Its values follow the same
shallow/deep option. This is the focused boundary for React props and ordinary
JavaScript APIs that require an object rather than a Map.

## Duplicate Value Semantics

Distinct native Map keys or Set members can become equal persistent values
after deep conversion. For example, two separate native Arrays containing the
same values both become value-equal persistent Vectors. Silently collapsing
one would lose data.

`from-js` therefore checks every converted Map key and Set member against the
target's value semantics. A duplicate throws `ELI-INTEROP-DUPLICATE` at the
second key/member path. Plain object keys are already unique strings.

## Options and Limits

All conversion functions accept an optional plain own-property object:

```text
deep       boolean, default false
maxDepth   non-negative safe integer, default 256
maxValues  positive safe integer, default 1,000,000
```

Unknown enumerable own options are rejected. Inherited options are ignored.
Option accessors are rejected without execution. Limits count the root and all
visited deep values. They prevent untrusted host graphs from causing unbounded
recursion or traversal.

## Paths and Errors

Interop-owned failures throw:

```text
{
  kind: "eliscript/interop-error",
  code: string,
  message: string,
  path: string,
  origin: string | nil
}
```

Paths begin at `$`:

```text
$[2]              sequential child
$["name"]         plain object property
$<key:1>          Map key
$<value:1>        Map value
$<set:3>          Set member
```

Cycle errors include the active ancestor path in `origin`. Implemented codes
cover invalid options/entries/keys, accessors, unsupported values, duplicates,
cycles, depth limits, and value-count limits.

## Complexity

Shallow conversion costs O(n) in the converted root size and O(1) additional
work per unchanged child. Deep conversion is O(v + e) over visited containers
and child edges, plus persistent Map/Set insertion costs. Memo and active maps
use O(c) host identity storage for `c` visited containers. The source graph is
never copied more than once per distinct source identity.

## Acceptance Criteria

- **JSI-01:** Native constructors and predicates distinguish Array, plain
  object, Map, and Set without confusing persistent values.
- **JSI-02:** Predicates and conversion work for native values from an
  independent JavaScript realm.
- **JSI-03:** Shallow conversion changes only one root and preserves nested
  source identities.
- **JSI-04:** Deep conversion covers portable/runtime List, Vector, Map, Set,
  native containers, scalars, and identifiers with the documented targets.
- **JSI-05:** Repeated source identities reuse one converted identity; cycles
  fail with exact current and origin paths.
- **JSI-06:** Plain object accessors and Symbol keys are rejected without
  silent data loss or getter execution.
- **JSI-07:** Value-equal converted Map keys and Set members fail at the second
  exact path rather than collapsing.
- **JSI-08:** Depth, value-count, option, key, entry, and opaque-value failures
  use structured interop errors.
- **JSI-09:** Deep conversion leaves source host graphs unchanged.
- **JSI-10:** An ordinary JavaScript host consumer receives a deeply converted
  plain object containing a persistent Vector without implementation details
  leaking.
- **JSI-11:** At least 2,000 generated nested host graphs round-trip
  structurally, and a 100,000-value snapshot remains stack safe.
- **JSI-12:** Seed/self-hosted modules and Source Maps are byte-identical; Bun
  and Node execute the same report for both compiler generations.
- **JSI-13:** Public-surface, compatibility, conformance, standard-library
  build, and default test contracts track the module.

## Deferred Work

Typed arrays, dates, regular expressions, errors, promises, DOM values,
user-defined conversion protocols, asynchronous streaming, and configurable
Map-to-object key coercion are outside this specification. They require
separate loss, identity, and capability contracts. Specification 0142 supplies
the maintained JavaScript package fixture. The final PD-07 gate still requires
that fixture to pass under the full supported matrix; this specification
provides its core conversion and host-boundary evidence.
