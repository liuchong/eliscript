# Eliscript

Eliscript is an Emacs Lisp-flavored language that compiles to modern
JavaScript and React.

The compiler is intended to be written in Emacs Lisp and runnable with plain
Emacs, including `emacs --batch`. Its output is standard JavaScript modules,
so the generated application can run directly in a browser or pass through an
optional tool such as Vite for development and bundling.

## Why

Emacs Lisp is a productive language for editing, automation, macros, and
content workflows, but the browser does not provide it as an application
runtime. Eliscript explores a smaller, deliberately designed language that
keeps the Lisp programming model while targeting the JavaScript ecosystem.

The project is especially interested in programmable publishing workflows:
Org content, user-defined macros, static site generation, and highly custom
React interfaces should be able to live in one coherent toolchain.

## Goals

- A compiler core implemented in Emacs Lisp with no Node.js dependency.
- A defined path from the Emacs Lisp seed compiler to a self-hosted compiler
  written in Eliscript.
- A portable execution layer that can move suitable Emacs workloads to fast
  JavaScript engines without replacing Emacs as the interactive host.
- Predictable ESM output that is readable and easy to debug.
- Lexical scope, first-class functions, macros, and familiar Lisp data forms.
- Direct interop with JavaScript modules, objects, promises, and browser APIs.
- A small React-oriented layer rather than a separate component runtime.
- First-class source maps and useful compiler diagnostics.
- Optional adapters for Vite and Org publishing, kept outside the core.

## Non-goals

- Full compatibility with Emacs Lisp or its dynamic runtime.
- Compiling arbitrary Emacs packages for the browser.
- Reimplementing Emacs in JavaScript.
- Hiding JavaScript semantics when explicit interop is clearer.

## Language Sketch

This example is directional; the syntax and names are not frozen yet.

```elisp
(module example.counter
  (import "react" useState))

(defcomponent Counter ()
  (let ((state (useState 0)))
    (let ((count (get state 0))
          (set-count (get state 1)))
      (button {:on-click (lambda () (set-count (+ count 1)))}
        "Count: " count))))

(export Counter)
```

The intended result is ordinary ESM that imports React and emits a component
without requiring a custom virtual DOM.

## Repository Layout

```text
compiler/                Emacs Lisp compiler implementation
runtime/                 Minimal JavaScript runtime helpers
stdlib/                  Portable Eliscript standard library
examples/                End-to-end example applications
  react-counter/         First React compilation target
specs/                   Numbered language and toolchain decisions
tests/                   Compiler fixtures and output snapshots
tools/                   Optional integrations and developer utilities
```

## Compilation Pipeline

```text
.eli source
  -> reader
  -> macro expansion
  -> semantic analysis
  -> language-neutral IR
  -> JavaScript/ESM emitter
  -> browser or optional bundler
```

## Bootstrap Strategy

Eliscript will follow a staged self-hosting path:

```text
Stage 1: Emacs Lisp seed compiler
         compiler.el + program.eli -> program.js

Stage 2: Compiler rewritten in Eliscript
         compiler.el + compiler.eli -> compiler.js

Stage 3: Self-hosted compiler
         compiler.js + compiler.eli -> compiler.js
```

In the self-hosted stage, JavaScript is the executable form of the compiler,
not its maintenance language. Compiler development moves to `.eli` source,
while the Emacs Lisp implementation remains the readable bootstrap seed and a
reference implementation.

Self-hosting is accepted only when the seed compiler and the generated compiler
agree on language behavior, pass the same conformance suite, and reproduce a
stable normalized compiler artifact.

## Emacs Acceleration

Self-hosting creates a useful path back into Emacs. Portable Eliscript code can
be compiled to JavaScript and executed by a long-lived JavaScript worker, while
Emacs remains responsible for buffers, windows, commands, and editor state.

```text
Emacs
  -> editor-bound work stays in Emacs Lisp
  -> portable compute is compiled from Eliscript to JavaScript
  -> structured results return to Emacs
```

Likely candidates include parsers, syntax-tree transformations, content builds,
code indexing, data processing, and other mostly pure computations. The goal is
measured end-to-end improvement, including startup and communication overhead,
not an assumption that every function becomes faster outside Emacs.

See [specs/0001-language-and-toolchain.md](specs/0001-language-and-toolchain.md)
for the language and bootstrap boundary, and
[specs/0002-emacs-acceleration.md](specs/0002-emacs-acceleration.md) for the
portable execution model.

## Status

Eliscript is currently in the specification and bootstrap-scaffold phase.

Established decisions:

- Emacs Lisp implements the seed compiler.
- Eliscript targets readable standard ESM.
- React and Org support live above the language core.
- The compiler will eventually be rewritten in Eliscript and self-hosted.
- Portable Eliscript may serve as a JavaScript acceleration layer for Emacs.

The next implementation milestone is M0: a batch-mode Emacs compiler for a
small lexical Lisp subset, backed by fixtures and JavaScript snapshots. There
is no usable compiler or runtime yet.
