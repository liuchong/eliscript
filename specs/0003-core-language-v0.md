# 0003: Implemented Core Language

- Status: Implemented
- Date: 2026-08-27
- Depends on: 0001 Language and Toolchain Boundary
- ECMAScript target: [ECMA-262](https://ecma-international.org/publications-and-standards/standards/ecma-262/)

## Summary

This specification records the behavior implemented by the first Emacs Lisp
seed compiler. It is a vertical slice, not a commitment to preserve every
surface form indefinitely.

The compiler reads `.eli` source with the Emacs Lisp reader and emits standard
ECMAScript modules. Emacs is the only compilation dependency. Bun 1.4 or newer
is the reference execution and integration-test host, but generated code does
not use Bun-specific language extensions or APIs.

## Command Line

```sh
bin/eliscript [--output FILE] INPUT
```

When `--output` is omitted, generated ECMAScript is written to standard output.
Parent directories for an output file are created automatically.

## Source and Module Model

A source file contains zero or more Emacs Lisp-readable forms. Semicolon line
comments and ordinary Emacs Lisp string syntax are accepted by the seed reader.

Each source file emits one ESM module. The optional top-level `module` form
groups declarations and supplies a source-level name; the name does not affect
the output path yet.

```elisp
(module example.math
  (defun square (value) (* value value))
  (export square))
```

## Values

| Eliscript | ECMAScript |
| --- | --- |
| `nil` | `null` |
| `t` | `true` |
| `false` | `false` |
| `undefined` | `undefined` |
| numbers | ECMAScript numbers |
| strings | ECMAScript strings |
| keywords | strings without the leading colon |
| vectors | arrays |
| quoted proper lists | arrays |
| `(object key value ...)` | plain object literals |

Quoted symbols currently become strings. Dotted lists are rejected.

## Truthiness

Eliscript does not use JavaScript truthiness directly. `false`, `null`, and
`undefined` are false; every other value, including `0`, an empty string, and
an empty array, is true.

The seed compiler emits a local `__eliscript_truthy` helper to preserve this
rule in `if`, `when`, `unless`, `cond`, `while`, `and`, `or`, and `not`.

`nil?` tests strictly for JavaScript `null`, `undefined?` tests strictly for
JavaScript `undefined`, and `nullish?` tests for either value. The historical
`null` operator remains a compatibility alias of `nullish?`. These predicates
do not use truthiness, so all four return false for `false`, `0`, and empty
strings. See [0034-nullish-values.md](0034-nullish-values.md).

## Bindings and Functions

The implemented binding forms are:

- `defconst` for top-level immutable bindings
- `defvar` for top-level mutable bindings
- `defun` and `defn` for ordinary named functions
- `defportable` for worker entries with a statically checked dependency closure;
  see [0021-portable-functions.md](0021-portable-functions.md)
- `lambda` and `fn` for anonymous functions
- `let` for parallel lexical bindings
- `let*` for sequential lexical bindings
- `setq` and `set!` for assignment

All local bindings are lexical. Function signatures may contain an
`&optional` section and one trailing `&rest` binding; see
[0036-function-parameters.md](0036-function-parameters.md). Dynamic scope,
special variables, and declarations are not implemented.

A function returns the value of its final body form. An empty function body
returns `null`.

## Control Flow

The compiler implements `if`, `when`, `unless`, `cond`, `progn`, `do`, `while`,
`and`, and `or`. These forms are expressions and produce values. `while`
returns `null`; `and` and `or` short-circuit and return operand values.

## Operators and Collections

The initial arithmetic and comparison forms are:

- `+`, `-`, `*`, `/`, `%`, and `mod`
- `1+` and `1-`
- `=`, `/=`, `not=`, `<`, `<=`, `>`, and `>=`
- `eq`, `equal`, `nil?`, `undefined?`, `nullish?`, compatibility `null`, and
  `not`

The initial collection forms are:

- `list`, `vector`, and `array`
- `car`, `cdr`, `cons`, `nth`, `aref`, and `length`
- `object`, `get`, and `put`
- `object-keys`, `object-has?`, and `object-assoc`

Lists and vectors currently share the ECMAScript array representation. `equal`
currently uses strict identity equality; structural equality is deferred to the
portable runtime.

Higher-order, non-mutating sequence operations are implemented as Eliscript
library code rather than special forms. See
[0023-portable-sequence-library.md](0023-portable-sequence-library.md) for
`map`, `filter`, `reduce`, ranges, slicing, predicates, and search.

The object primitives provide own enumerable string-key discovery,
own-property testing, and shallow immutable association. `nil` is treated as an
empty object. Higher-level immutable transforms are library code; see
[0026-portable-object-library.md](0026-portable-object-library.md).

## ECMAScript Modules

Imports use these top-level forms:

```elisp
(import "react" :default React useState useMemo)
(import "library" :as Library)
(import "side-effect-only")
(import-portable "./object.eli" assoc)
```

`import-portable` is named-only. It emits a standard ESM import in complete
modules and becomes a verified local graph edge during project-level portable
closure builds; see
[0028-portable-module-composition.md](0028-portable-module-composition.md).

Exports use `(export name ...)` or `(export-default value)`.

## JavaScript Interop

- Qualified symbols such as `JSON/stringify` emit property paths such as
  `JSON.stringify`.
- `(get object key)` reads a property.
- `(get object key fallback)` uses nullish fallback behavior.
- `(put object key value)` assigns a property.
- `(object-keys object)` enumerates own enumerable string keys.
- `(object-has? object key)` tests only own properties.
- `(object-assoc object key value)` returns a shallow copy with one property.
- `(js-call object method arguments...)` preserves the method receiver.
- `(new Constructor arguments...)` constructs a JavaScript object.
- `(funcall function arguments...)` and `(apply function array)` call values.
- `(js* "expression")` emits an explicit raw JavaScript escape hatch.

`js*` accepts only a source string literal. It is deliberately visible and
should not be used by portable standard-library code.

## Identifier Mapping

Hyphens become underscores, so `add-one` emits `add_one`. Question marks,
exclamation marks, stars, and other punctuation receive deterministic textual
escapes. ECMAScript reserved words gain a trailing `$`. Qualified references
split on `/` or `.` and emit property paths.

This mapping is deterministic. The M1 lexical analyzer diagnoses source names
in one scope that map to the same output identifier.

## Intentional Differences from Emacs Lisp

- lexical scope is mandatory
- numbers follow ECMAScript behavior rather than Emacs integer semantics
- list and vector values currently use arrays rather than cons cells
- `false` is distinct from `nil`
- JavaScript modules and objects are first-class interop concepts
- browser and JavaScript host APIs are explicit

Compile-time user macros and recursive source locations are implemented by the
front end described in specifications 0005 and 0006. Explicit IR lowering is
specified in 0007. Source maps, structured diagnostic records, Emacs object
interop, and full diagnostics are not implemented yet. Later Eliscript versions
may add forms that are more expressive than Emacs Lisp rather than preserving
compatibility for its own sake.

## Acceptance Evidence

The implementation is accepted by:

- ERT tests for reading, literals, bindings, truthiness, modules, interop, and
  invalid forms
- a checked-in `.eli` fixture and deterministic `.mjs` snapshot
- compilation through the public `bin/eliscript` command
- execution of the generated module by Bun 1.4
