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

## Project Requests

Direct project flags and versioned configuration both produce an
`eliscript-project-request` and execute it through
`eliscript-project-execute`. A minimal `eliscript.json` is:

```json
{
  "schemaVersion": 1,
  "sourceRoot": "src",
  "entry": "main.eli",
  "outDir": "dist"
}
```

Run it with `./bin/eliscript-build --config eliscript.json`. Paths in the file
are relative to the file as defined by specification 0106. Explicit entry,
root, output, portable-entry, and no-cache flags override configured values.
Unknown keys and unsupported versions fail with structured diagnostics.

Run `./bin/eliscript-check --config eliscript.json --json` to validate the same
entry closure without writing the configured output directory, manifest, or
cache. `--stdin-file FILE` checks standard input as the current contents of an
existing project source for editor integrations.

`./bin/eliscript-build --config eliscript.json --stdin-file FILE` performs a
real build with standard input as the current contents of that existing source.
Virtual builds disable cache reuse, preserve the canonical source identity in
diagnostics and Source Maps, and never rewrite the source file.

The schema is a compiler project contract. Application framework, bundler,
publishing, hosting, and development-server options belong in replaceable
adapters outside this file and outside core maturity evidence.

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

`persistent-list-literal`, `persistent-vector-literal`,
`persistent-map-literal`, `persistent-set-literal`,
`persistent-queue-literal`, and evaluated Keyword
literals emit calls through the package-owned `eliscript/runtime/literals.mjs` ESM
ABI. The import is inserted once and only when one of those runtime values is
constructed. Square-bracket expressions, brace Map expressions, `#{...}` Set
expressions, `#queue [...]`, `(list ...)`, `(vector ...)`, `(hash-map ...)`,
`(hash-set ...)`, `(queue ...)`, and source `:keywords` use that path;
`js-array`, `js-cons`, and
`js-object` remain direct native container forms. Keyword-shaped tokens in
static host-key positions also remain JavaScript strings and do not link the
literal runtime by themselves. The reader desugars `{key value ...}` into
located `hash-map` syntax, `#{...}` into located `hash-set` syntax, and
`#queue [...]` into located `queue` syntax,
validates Keyword names, and rejects malformed delimiters or odd Map forms
before analysis. Language-level `nth` and `length` link the
collection protocol runtime, while `js-nth` and `js-length` retain direct host
access without that dependency. `car`, `cdr`, and `cons` link the canonical
persistent List operations; they no longer imply native Array behavior.
The former `array` and `object` constructor aliases are not compiler forms;
without an ordinary user binding they are diagnosed as unbound symbols.

## Application Lowering

UI frameworks use the same explicit ESM imports and ordinary function calls as
any other host library. The compiler reserves no framework-specific forms,
introduces no framework-specific IR nodes, and injects no framework runtime.

This application compatibility surface is independent of persistent literal
semantics and is not a dependency of the compiler or runtime ABI.

## Source Discipline

The Emacs Lisp and self-hosted implementations must share a conformance suite.
Generated JavaScript is a build artifact and must never become the hand-edited
source of the self-hosted compiler.
