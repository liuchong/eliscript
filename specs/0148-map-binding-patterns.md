# 0148: Map Binding Patterns

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-09
- Depends on: 0036 Function Parameters, 0039 Vector Binding Patterns,
  0055 Eliscript-authored Persistent HAMT Map, 0084 Persistent Map Source Syntax

## Purpose

Eliscript map binding patterns provide associative destructuring without
coupling language semantics to JavaScript object destructuring. The same syntax
works with Eliscript persistent maps and native JavaScript objects through the
collection lookup protocol.

## Syntax

```elisp
{:keys [profile/name]
 :account/keys [id]
 :strs [label]
 :syms [token]
 :or {id 18}
 :as row}
```

A pattern may contain these directives:

- `:keys` accepts a vector of symbols and looks up Keywords with the same
  qualified names. A qualified shortcut such as `:account/keys` supplies the
  key namespace while each local binding keeps only its final name component.
- `:strs` accepts a vector of symbols and looks up string keys.
- `:syms` accepts a vector of symbols and looks up Symbol value keys.
- `:or` accepts one map from scalar bound names to default expressions.
- `:as` accepts one symbol bound to the complete source value.

Every other pair is an explicit entry whose left side is a binding pattern and
whose right side is a keyword, string, or number lookup key:

```elisp
{alias :name {:keys [city]} :profile}
```

Map patterns may appear in function parameters, `let`, `let*`, `loop`,
`catch`, and nested binding targets. Optional map parameters default to `nil`
when omitted and remain safe to destructure.

## Semantics

The source expression is evaluated exactly once. Every entry is read through
the core collection lookup protocol. For plain JavaScript objects, Keyword and
Symbol keys map to their qualified string names; persistent maps retain their
canonical value keys. String keys remain strings on both paths.

Defaults run only when a key is absent. A present key whose value is `nil`,
JavaScript `null`, or `undefined` does not activate `:or`. Default expressions
are analyzed and evaluated in the scope outside the names introduced by the
same pattern.

`loop` and function-level `recur` first capture all replacement values, then
assign their source slots, then run map extraction again. This preserves
simultaneous replacement and stack safety.

## Intermediate Representation

`map-binding-pattern` owns ordered `map-binding-entry` children and records
`entryCount` plus the presence of an `:as` child. Each entry owns its target,
lookup-key expression, and optional default expression. This representation is
shared by the Emacs seed and self-hosted compilers.

## Diagnostics

Compilation rejects duplicate shortcut directives, non-vector shortcut values,
non-symbol or marker shortcut entries, non-map `:or`, defaults without a
matching scalar target, invalid `:as` values, unknown directives, and
unsupported explicit lookup keys.

## Acceptance

- **MBP-01:** Native objects and persistent maps produce the same associative
  binding results.
- **MBP-02:** Missing keys activate defaults while present nullish values do
  not.
- **MBP-03:** Function, lexical, loop/recur, catch, nested, optional, and
  portable bindings execute locally.
- **MBP-04:** Seed and self-hosted compilers produce identical IR, JavaScript,
  Source Maps, and a reproducible fixed point.
- **MBP-05:** Invalid directives and targets fail during lexical analysis.
- **MBP-06:** `:keys`, qualified `:keys`, `:strs`, and `:syms` preserve local
  names and lookup-key identity across native objects and persistent maps.
