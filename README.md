<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/pages/assets/eliscript-logo-light.png">
    <img src="docs/pages/assets/eliscript-logo.png" width="144" alt="Eliscript logo">
  </picture>
</p>

# Eliscript

Eliscript is an Emacs Lisp-flavored language that compiles to modern
JavaScript and React.

Website source: [`docs/index.html`](docs/index.html)

The seed compiler is written in Emacs Lisp and runs with plain Emacs, including
`emacs --batch`. It emits standard ECMAScript modules. Bun is the reference
JavaScript host for development and tests; generated modules do not depend on
Bun-specific syntax or APIs.

## Quick Start

Requirements:

- Emacs 29 or newer for compilation
- Bun 1.4 or newer for executing generated modules and running all tests

Compile and run the basic example:

```sh
./bin/eliscript --output dist/basic.mjs examples/basic/main.eli
bun run dist/basic.mjs
```

Run the complete test suite:

```sh
bun run test
```

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

## Current Language

The first compiler accepts an Emacs Lisp-shaped lexical subset:

```elisp
(module example.basic
  (defun factorial (n)
    (if (<= n 1)
        1
      (* n (factorial (1- n)))))

  (print (factorial 5))
  (export factorial))
```

Implemented forms include:

- literals, symbols, keywords, vectors, quoted lists, and object literals
- `defvar`, `defconst`, `defun`, `lambda`, `let`, and `let*`
- `if`, `when`, `unless`, `cond`, `progn`, `while`, `and`, and `or`
- `setq`, arithmetic, comparisons, and basic list/vector operations
- ESM `module`, `import`, `export`, and `export-default`
- `get`, `put`, `js-call`, `new`, and explicit `js*` interop

Eliscript already differs deliberately from Emacs Lisp: it is lexically scoped,
uses ECMAScript numbers and arrays, distinguishes `false` from `nil`, and emits
standard ESM. Full Emacs Lisp compatibility is not a goal.

## Repository Layout

```text
bin/                     Command-line entry point
compiler/                Emacs Lisp compiler implementation
docs/                    GitHub Pages website
runtime/                 Minimal JavaScript runtime helpers
stdlib/                  Portable Eliscript standard library
examples/                End-to-end example applications
  basic/                 Executable language example
  react-counter/         First React compilation target
specs/                   Numbered language and toolchain decisions
tests/                   Compiler fixtures and output snapshots
tools/                   Optional integrations and developer utilities
```

## Compilation Pipeline

The current seed compiler is intentionally direct:

```text
.eli source -> Emacs reader -> lexical analyzer -> ESM emitter -> Bun or browser
```

The next compiler stage adds macro expansion before analysis, then replaces the
analyzer's pass-through output with a language-neutral IR and source maps.

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
portable execution model. The exact implemented subset is recorded in
[specs/0003-core-language-v0.md](specs/0003-core-language-v0.md).

## Status

The first Emacs Lisp seed compiler is implemented and usable from the command
line. The M0 vertical slice is complete and M1 is in progress.

Current evidence:

- `.eli` files compile to deterministic, readable `.mjs` modules.
- The compiler itself has no JavaScript runtime dependency.
- A lexical analyzer resolves module, function, and local bindings before
  emission; it rejects undeclared names, immutable assignment, duplicate
  declarations, invalid exports, and output identifier collisions.
- Twenty ERT tests cover reading, analysis, core emission, modules,
  truthiness, errors, and JavaScript interop.
- A CLI integration test compares generated output with a checked-in snapshot.
- Bun 1.4 executes the generated module and verifies recursion, mutation,
  loops, higher-order functions, objects, arrays, and exports.

The next M1 slice adds macro expansion and located forms, then introduces an
explicit IR and source maps. React and Org publishing remain later milestones.

See [specs/0004-lexical-analysis.md](specs/0004-lexical-analysis.md) for the
implemented analyzer contract.

## License

Eliscript is free software licensed under the
[GNU General Public License, version 3 or later](LICENSE).
