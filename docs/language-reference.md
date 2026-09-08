# Language Reference

[Core documentation](README.md) | [Macros](macros.md) |
[JavaScript interoperation](javascript-interop.md) |
[Specifications](../specs/README.md)

## Source Model

Eliscript source is a sequence of Lisp forms compiled to strict ECMAScript
modules. Symbols use lexical or module resolution; an unbound symbol is a
compile-time error. Only `false`, `nil`, and `undefined` are false in condition
positions. `nil` compiles to JavaScript `null`, while `undefined` remains a
separate value.

The checked public-surface registry in
[`contracts/public-surface.json`](../contracts/public-surface.json) is the
authoritative inventory of reader values, declarations, runtime forms, macro
operations, and IR kinds.

## Values And Collections

Numbers and strings use JavaScript scalar representation. Lists, Vectors,
Maps, Sets, Keywords, and Symbols are immutable Eliscript values with value
equality and deterministic hashing where specified. Their canonical source
constructors are `list`, `vector`, `hash-map`, and `hash-set`; vector, map, and
set literals use `[...]`, `{...}`, and `#{...}`.

`car`, `cdr`, and `cons` operate on persistent Lists. `nth` and `length`
dispatch through collection protocols. Native JavaScript containers are
explicit through forms such as `js-array` and are documented in
[JavaScript interoperation](javascript-interop.md).

`eq` compares identity. `equal` compares Eliscript values recursively:
independently constructed persistent collections can be equal, `NaN` equals
`NaN`, signed zeroes are equal, and opaque host objects remain identity-based.

<!-- eliscript-snippet:language-values -->
```elisp
(module docs.language-values
  (defconst values [1 2 3])
  (print (str (nth 1 values) ":" (length values)))
  (print (equal values [1 2 3])))
```

## Bindings And Functions

`defconst` defines an immutable module binding and `defvar` defines a mutable
one. `let` evaluates initializers in the surrounding scope; `let*` exposes each
binding to later initializers. `setq` and `set!` can update only mutable
bindings.

Functions use `defun`, `defn`, `lambda`, or `fn`. Parameters may include
`&optional` and one final `&rest`; macros additionally support `&body`.
`defasync` and `async` create asynchronous functions, and `await` is valid only
inside an asynchronous body. `defportable` defines functions whose complete
dependency closure can execute in the restricted worker environment.

## Control Flow

The core forms are `if`, `when`, `unless`, `cond`, `and`, `or`, `progn`,
`while`, `loop`, `recur`, `try`, `catch`, `finally`, and `throw`. `recur` is
valid only in a tail position owned by the nearest compatible function or
loop target. Argument evaluation and loop rebinding remain deterministic.

## Modules

Every maintained source file declares a module. `import` supports named,
default, namespace, side-effect, and combined ECMAScript imports. Local
`.eli` imports participate in project graph construction; external `.mjs` or
package imports remain ordinary host dependencies. `export` names public
bindings and `export-default` emits one default binding.

Project-wide compilation, source containment, and cache behavior are covered
by [Project configuration](project-configuration.md).

## Diagnostics And Source Maps

Reader, macro, analysis, lowering, emission, project, and runtime failures have
source locations where available. Public commands accept
`--diagnostic-format human|json`; JSON diagnostics use the versioned
`eliscript-diagnostic` schema. `--source-map` writes Source Map v3 output for a
named output file.

## Compatibility Status

`Stable` specifications and matching stable conformance features form the
compatibility promise. `Accepted` behavior is implemented and tested but may
still change before the final 1.0 freeze. Consult the
[compatibility baseline](../specs/0046-m7-compatibility-baseline.md) instead of
inferring stability from this overview.
