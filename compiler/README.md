# Compiler

[Project README](../README.md) | [Bootstrap compiler](../bootstrap/README.md) |
[Specifications](../specs/README.md)

## Modules

This directory contains the first Emacs Lisp seed compiler:

- `eliscript-reader.el` reads one or more `.eli` forms.
- `eliscript-form.el` carries source spans through front-end phases.
- `eliscript-diagnostic.el` defines shared compiler condition types.
- `eliscript-macro-eval.el` interprets the deterministic macro language.
- `eliscript-expander.el` registers macros and recursively expands their output.
- `eliscript-symbol.el` owns identifier validation and ECMAScript name mapping.
- `eliscript-analyzer.el` validates module and lexical bindings.
- `eliscript-ir.el` defines the explicit, source-located compiler IR.
- `eliscript-lower.el` lowers analyzed forms into IR nodes.
- `eliscript-ir-emitter.el` emits standard ECMAScript modules directly from IR.
- `eliscript-source-map.el` encodes IR span markers as Source Map v3 mappings.
- `eliscript-emitter.el` retains the original form emitter as a compatibility
  backend and supplies shared formatting helpers.
- `eliscript.el` exposes the public string and file compilation API.
- `eliscript-cli.el` implements the batch command used by `bin/eliscript`.
- `eliscript-project.el` discovers expanded local imports and writes complete
  source-mapped ESM trees.
- `eliscript-project-cli.el` implements the batch command used by
  `bin/eliscript-build`.

## Pipeline

The current pipeline expands user macros before passing forms through lexical
analysis and JavaScript emission. Macro environments are isolated per
compilation, and expanded forms are validated for resolution, mutability,
exports, duplicate declarations, and output-name collisions. Located forms
carry source spans through expansion, analysis, IR lowering, direct IR
emission, and optional Source Map v3 output. The public compiler never
reconstructs reader-shaped forms after lowering. Public entry points support
both interactive Emacs use and clean batch builds.

The analyzer also tracks recur targets, tail positions, physical function
parameter slots, and exception boundaries. Lowering preserves binding loops
and recurrence as distinct IR nodes; the emitter turns valid targets into
deterministic labeled JavaScript loops with simultaneous temporary-backed
rebinding.

## Persistent Literal Linking

`persistent-vector-literal` and `persistent-map-literal` IR nodes emit calls
through the package-owned `eliscript/runtime/literals` ESM ABI. The import is
inserted once and only when those nodes occur. Square-bracket expressions,
brace Map expressions, `(vector ...)`, and `(hash-map ...)` use that path;
`js-array` and `js-object` remain direct native container forms. The reader
desugars `{key value ...}` into located `hash-map` syntax and rejects odd or
mismatched forms before analysis. Language-level `nth` and `length` link the
collection protocol runtime, while `js-nth` and `js-length` retain direct host
access without that dependency.

## Application Lowering

React `jsx` and `fragment` forms lower to dedicated IR nodes. Modules that use
those nodes receive one automatic `react/jsx-runtime` namespace import and emit
`jsx`, `jsxs`, and `Fragment` calls directly; ordinary modules remain free of
React imports.

This application compatibility surface is independent of persistent literal
semantics and is not a dependency of the compiler or runtime ABI.

## Source Discipline

The Emacs Lisp and self-hosted implementations must share a conformance suite.
Generated JavaScript is a build artifact and must never become the hand-edited
source of the self-hosted compiler.
