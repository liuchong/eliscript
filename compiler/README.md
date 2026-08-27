# Compiler

This directory contains the first Emacs Lisp seed compiler:

- `eliscript-reader.el` reads one or more `.eli` forms.
- `eliscript-diagnostic.el` defines shared compiler condition types.
- `eliscript-symbol.el` owns identifier validation and ECMAScript name mapping.
- `eliscript-analyzer.el` validates module and lexical bindings.
- `eliscript-emitter.el` emits standard ECMAScript modules.
- `eliscript.el` exposes the public string and file compilation API.
- `eliscript-cli.el` implements the batch command used by `bin/eliscript`.

The current pipeline passes read forms through lexical analysis before
JavaScript emission. The analyzer validates resolution, mutability, exports,
duplicate declarations, and output-name collisions while returning the forms
unchanged. The next phase boundaries are macro expansion, IR lowering, located
forms, and source maps. Public entry points support both interactive Emacs use
and clean batch-mode builds.

The Emacs Lisp and self-hosted implementations must share a conformance suite.
Generated JavaScript is a build artifact and must never become the hand-edited
source of the self-hosted compiler.
