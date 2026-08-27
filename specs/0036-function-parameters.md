# 0036: Optional and Rest Function Parameters

- Status: Implemented
- Date: 2026-08-28
- Depends on: 0003 Implemented Core Language, 0004 Lexical Analysis,
  0017 Portable IR Lowering, 0019 Self-hosted Compiler

## Summary

Named and anonymous Eliscript functions support required parameters, an
optional section introduced by `&optional`, and one trailing rest parameter
introduced by `&rest`.

```elisp
(defun collect (required &optional optional &rest rest)
  [required optional rest])
```

The grammar is shared by `defun`, `defn`, `defportable`, `lambda`, and `fn`.
`defcomponent` expands to `defun` and therefore inherits the same grammar.

## Grammar

The canonical order is:

```text
(required* [&optional optional*] [&rest rest])
```

Every binding must be a symbol. `&optional` may occur at most once and only
after required parameters. `&rest` may occur at most once, must be followed by
exactly one symbol, and must end the list. `&body` remains a macro-only alias
for macro rest parameters and is rejected in runtime function signatures.

Markers do not introduce bindings. Duplicate source names and JavaScript output
identifier collisions are checked across all actual parameters in one lexical
scope.

## Runtime Semantics

Required parameters emit as ordinary JavaScript parameters. Eliscript does not
yet add a runtime arity check for missing required arguments.

Optional parameters emit with a `null` default:

```javascript
function collect(required, optional = null, ...rest) {}
```

JavaScript applies a default to an omitted argument and to an argument whose
value is explicitly `undefined`. Both therefore become Eliscript `nil`. Other
false values, including `false`, zero, and an empty string, remain unchanged.

The rest parameter is always a newly allocated JavaScript array containing all
remaining arguments. With no remaining arguments it is an empty array.

## Intermediate Representation

Each `parameter-binding` node has a `parameter-kind` property whose value is
`required`, `optional`, or `rest`. Marker forms are not IR nodes and do not
contribute to `parameter-count`.

Keeping the distinction in IR lets both emitters, source maps, compatibility
round trips, portable closure validation, and future backends consume one
semantic representation. Converting IR back to reader forms reconstructs the
canonical markers.

The JSON-safe self-hosted representation uses the equivalent
`parameterKind` field.

## Portable and Bootstrap Behavior

Portable-function validation adds every actual parameter to the local scope
while ignoring markers. Optional and rest parameters do not weaken the
existing transitive dependency or host-interop restrictions.

The Emacs Lisp seed compiler and self-hosted compiler implement the same
parameter parser, diagnostics, IR properties, ESM syntax, and source mappings.
The compiler sources continue to reach the same Generation 1 to Generation 2
fixed point.

## Acceptance Evidence

- ERT covers named, anonymous, and portable functions, explicit IR kinds,
  canonical IR round trips, and invalid marker order.
- Shared analyzer fixtures compare exact seed and self-hosted diagnostics.
- Shared IR and emitter fixtures compare complete trees, JavaScript, and Source
  Maps across both generations.
- The CLI runtime fixture verifies omitted optional values, explicit
  `undefined`, supplied optional values, empty rest arrays, and populated rest
  arrays under Bun.
