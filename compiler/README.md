# Compiler

This directory will first contain the Emacs Lisp seed implementation of the
compiler. After the language core stabilizes, it will also contain the compiler
rewritten in Eliscript and the adapters needed to run its generated JavaScript.

The planned phase boundaries are reader, macro expansion, semantic analysis,
IR lowering, JavaScript emission, source maps, and diagnostics. Public entry
points should support both interactive Emacs use and clean batch-mode builds.

The Emacs Lisp and self-hosted implementations must share a conformance suite.
Generated JavaScript is a build artifact and must never become the hand-edited
source of the self-hosted compiler.
