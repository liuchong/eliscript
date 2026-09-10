# 0159: Declarative Protocol Definitions

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-10
- Depends on: 0036 Compile-time Macros, 0058 Open Protocol Dispatch,
  0079 Eliscript Protocol Dispatch Policy,
  0091 Transport-safe Protocol Definitions,
  0144 Source-level Failure Mapping

## Summary

This specification adds language-level declarations for defining protocols and
installing exact-type, host-category, and default implementations. The forms
expand to the existing protocol standard-library API. They do not add protocol
dispatch policy, host reflection, operation tables, or runtime state to either
compiler.

Programs explicitly import the low-level operations used by their declarations.
This preserves lexical dependency checking, project graph identity, portable
closure selection, and the single canonical protocol runtime.

## Protocol Definition

`defprotocol` accepts a protocol symbol followed by one or more distinct
operation symbols:

```elisp
(defprotocol IDescribe describe measure)
```

It expands to one immutable protocol binding and one immutable binding for each
exact runtime operation function:

```elisp
(defconst IDescribe
  (define-protocol "IDescribe" (js-array "describe" "measure")))
(defconst describe (protocol-method IDescribe "describe"))
(defconst measure (protocol-method IDescribe "measure"))
```

The source symbol spelling becomes the protocol or operation name unchanged.
An operation binding is the exact function produced by `protocol-method`, so
its protocol, operation, and direct-slot identity remain observable.

## Implementations

`extend-type` installs methods for the exact prototype owned by a constructor:

```elisp
(extend-type Box IDescribe
  (describe (box) (str "box:" (get box :value)))
  (measure (box scale) (* (get box :value) scale)))
```

It expands to `extend-protocol-type` with a host object whose operation values
are ordinary lambdas. The constructor and protocol must be symbols. Subclasses
do not inherit exact-type registrations unless the protocol runtime finds a
direct implementation slot.

`extend-category` installs methods for one non-empty literal host-category
string:

```elisp
(extend-category "number" IDescribe
  (describe (value) (str "number:" value)))
```

It expands to `extend-protocol-category`. The protocol runtime remains the
authority for the supported category set.

`extend-default` installs fallback methods:

```elisp
(extend-default IDescribe
  (describe (_value) "default"))
```

It expands to `extend-protocol-default`. All extension forms require at least
one method clause. A clause contains an operation symbol, a normal lambda
parameter list, and zero or more body forms. Lambda analysis owns parameter
shape, binding, and body semantics after expansion.

## Compilation Boundary

All four forms are valid only at module top level, including a top-level
`module` body. User macros inside method bodies expand normally. Declarations
execute in source order and retain the standard runtime priority of direct
slot, exact type, host category, and default implementation.

Generated operators and object structure map to the complete declaration.
Reused protocol, target, category, operation, parameter, and body nodes retain
their source spans. Generated protocol and operation strings map to their
originating source symbols.

The forms do not inject imports. Missing `define-protocol`, `protocol-method`,
or an `extend-protocol-*` binding remains an ordinary deterministic unbound
symbol diagnostic. This also permits a project to use only the extension
capabilities it needs.

## Interactive Evaluation

`defprotocol` is one named runtime definition for persistent evaluation. Its
expanded source also recreates all operation bindings when that definition is
replaced. Extension forms are expressions and replay in committed source order
without claiming to introduce bindings.

## Diagnostics

Malformed declarations use expansion diagnostic `ELI-X0001`.

| Condition | Message |
| --- | --- |
| `defprotocol` lacks a name or operation | `defprotocol expects a name and at least one operation` |
| Protocol name is not a symbol | `defprotocol name must be a symbol: VALUE` |
| Operation is not a symbol | `defprotocol operation must be a symbol: VALUE` |
| Operation appears twice | `defprotocol declares duplicate operation: NAME` |
| `extend-type` has incomplete shape | `extend-type expects a target, protocol, and at least one method` |
| Exact target is not a symbol | `extend-type target must be a symbol: VALUE` |
| Extension protocol is not a symbol | `FORM protocol must be a symbol: VALUE` |
| Category is not a non-empty literal string | `extend-category category must be a non-empty string: VALUE` |
| Method clause lacks operation or parameters | `FORM method must contain an operation and parameter list: VALUE` |
| Method operation is not a symbol | `FORM method operation must be a symbol: VALUE` |
| Method appears twice in one form | `FORM declares duplicate method: NAME` |
| A declaration appears in expression position | `FORM is only valid at module top level` |

Runtime rejection of unknown operations, unsupported host categories, invalid
constructors, and non-function implementations remains owned by the protocol
standard library.

## Acceptance Criteria

- **DPD-01:** `defprotocol` expands to one canonical protocol binding and one
  exact operation-function binding per distinct source operation.
- **DPD-02:** Type, category, and default forms expand to their matching
  standard-library extension operations with normal lambda semantics.
- **DPD-03:** Declaration shape, symbol ownership, duplicate operations,
  duplicate methods, literal categories, and expression-position use produce
  deterministic expansion diagnostics.
- **DPD-04:** Explicit imports remain mandatory and no protocol runtime policy
  is duplicated in either compiler.
- **DPD-05:** Seed and self-hosted expanders produce identical syntax, spans,
  and diagnostics for the maintained declaration corpus.
- **DPD-06:** Seed and self-hosted compilation produces byte-identical ESM and
  Source Maps for the maintained declarative protocol fixture.
- **DPD-07:** Exact-type, host-category, and default dispatch results plus
  operation identity agree under Bun and Node.
- **DPD-08:** Evaluation descriptors, formatting, Emacs editing support,
  documentation, public-surface inventory, and local core gates pass.
