# Compiler

This directory contains the first Emacs Lisp seed compiler:

- `eliscript-reader.el` reads one or more `.eli` forms.
- `eliscript-form.el` carries source spans through front-end phases.
- `eliscript-diagnostic.el` defines shared compiler condition types.
- `eliscript-expander.el` evaluates trusted compile-time macros.
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

The current pipeline expands user macros before passing forms through lexical
analysis and JavaScript emission. Macro environments are isolated per
compilation, and expanded forms are validated for resolution, mutability,
exports, duplicate declarations, and output-name collisions. Located forms
carry source spans through expansion, analysis, IR lowering, direct IR
emission, and optional Source Map v3 output. The public compiler never
reconstructs reader-shaped forms after lowering. Public entry points support
both interactive Emacs use and clean batch builds.

React `jsx` and `fragment` forms lower to dedicated IR nodes. Modules that use
those nodes receive one automatic `react/jsx-runtime` namespace import and emit
`jsx`, `jsxs`, and `Fragment` calls directly; ordinary modules remain free of
React imports.

The Emacs Lisp and self-hosted implementations must share a conformance suite.
Generated JavaScript is a build artifact and must never become the hand-edited
source of the self-hosted compiler.
