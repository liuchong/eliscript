# Compiler

This directory contains the first Emacs Lisp seed compiler:

- `eliscript-reader.el` reads one or more `.eli` forms.
- `eliscript-emitter.el` emits standard ECMAScript modules.
- `eliscript.el` exposes the public string and file compilation API.
- `eliscript-cli.el` implements the batch command used by `bin/eliscript`.

The current vertical slice goes directly from read forms to JavaScript. The next
phase boundaries are macro expansion, semantic analysis, IR lowering, source
maps, and structured diagnostics. Public entry points support both interactive
Emacs use and clean batch-mode builds.

The Emacs Lisp and self-hosted implementations must share a conformance suite.
Generated JavaScript is a build artifact and must never become the hand-edited
source of the self-hosted compiler.
