# Bootstrap Compiler

This directory contains compiler modules written in Eliscript. The Emacs Lisp
seed compiler builds them into ESM until the portable implementation can
compile itself.

The bootstrap grows along this dependency order:

```text
symbol semantics (implemented)
  -> syntax data model (implemented)
  -> reader (implemented)
  -> macro expander (implemented)
  -> lexical analyzer (implemented)
  -> IR data model (implemented)
  -> IR lowering (implemented)
  -> ESM and Source Map emitter (implemented)
  -> compiler driver (implemented)
  -> reproducible self-compilation (implemented)
```

`compiler/symbol.eli` owns deterministic mapping from Lisp-style names to
ECMAScript identifiers. `compiler/syntax.eli` defines serializable syntax nodes
and source spans. `compiler/reader.eli` parses the portable source grammar into
that representation. `compiler/expander.eli` evaluates the deterministic macro
subset without host `eval`, then `compiler/analyzer.eli` validates lexical
scope and special forms. `compiler/ir.eli` defines JSON-safe IR nodes, and
`compiler/lower.eli` lowers analyzed syntax across the complete language
surface. `compiler/emitter.eli` formats portable IR through explicit text and
mapping fragments, while `compiler/source-map.eli` encodes those marks as
Source Map v3. The generated pipeline can process and emit every current
bootstrap module, including its own sources. `compiler/compiler.eli` composes
the complete in-memory pipeline without filesystem dependencies.

Build the current bootstrap modules with the seed compiler:

```sh
bun run build:bootstrap
```

After that seed build, compile through the generated compiler and Bun host
adapter:

```sh
./bin/eliscript-portable --output dist/program.mjs source/program.eli
```

Generated files are written below `dist/bootstrap/` and are not source
artifacts. Shared fixtures cover symbol behavior, reader syntax, macro
expansion, lexical analysis, all 51 IR node kinds, direct ESM emission, and
Source Map v3. Oracles compare complete syntax and IR trees, spans, properties,
acceptance, exact diagnostics, JavaScript bytes, and parsed source maps between
the seed and generated implementations. Repeated builds must be byte-identical.

Generation 1 is self-hosting. The conformance suite builds it with the seed,
uses it to build Generation 2, then uses Generation 2 to build Generation 3.
All ten ESM modules and Source Maps are byte-identical across those generations.
The Emacs Lisp seed remains the readable bootstrap and reference implementation.
