# 0019: Self-Hosted Compiler Driver

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0014 Portable Syntax and Reader,
  0015 Portable Lexical Analyzer, 0016 Portable Macro Expander,
  0017 Portable IR Lowering, 0018 Portable ESM and Source Map Emission

## Summary

Generation 1 now provides a complete compiler driver written in Eliscript. It
accepts source text, runs every portable compiler phase, and returns IR,
JavaScript, or JavaScript with a Source Map v3 document. A thin Bun adapter owns
filesystem and command-line operations outside the compiler core.

```text
source string
  -> reader -> expander -> analyzer -> lowerer -> emitter
  -> JavaScript + optional Source Map
```

The seed-built compiler can compile all of its own source modules to an exact
fixed point. This completes M4 self-hosting while retaining the Emacs Lisp seed
as the readable bootstrap and independent reference implementation.

## In-Memory Driver

`bootstrap/compiler/compiler.eli` imports only portable compiler modules and
exports:

- `compile-ir-string(source, filename)`
- `compile-string(source, filename)`
- `compile-string-with-source-map(source, filename, generated-name,
  source-name)`

The driver has no filesystem, process, environment, Bun, or Node.js dependency.
Diagnostics are thrown by the phase that detects them and retain the shared
`filename:line:column: message` contract.

## Host Adapter

`bootstrap/host/bun.mjs` is the first runtime adapter. It reads and writes
files, resolves relative Source Map names, appends `sourceMappingURL`, parses CLI
arguments, and loads a generated compiler directory. The adapter can also be
imported as a library for controlled builds.

`bin/eliscript-portable` exposes that adapter after `bun run build:bootstrap`:

```sh
./bin/eliscript-portable [--output FILE] [--source-map] INPUT
```

Host-specific behavior stays replaceable. Another JavaScript runtime can
provide the same small adapter without changing `.eli` compiler source.

## Reproducible Bootstrap

The fixed-point test creates three artifact directories:

```text
Emacs Lisp seed -> Generation 1
Generation 1    -> Generation 2
Generation 2    -> Generation 3
```

Each generation contains ten ESM modules and ten external Source Maps. Every
`.mjs` and `.mjs.map` file from Generation 1 is byte-identical to Generation 2,
and every Generation 2 file is byte-identical to Generation 3. The comparison
includes `compiler.mjs` itself and its mapping back to `compiler.eli`.

The same test compares seed and portable CLI output for a complete program,
compares mapped output files and maps, checks CLI argument failures, and verifies
that both implementations preserve the same located diagnostic.

## Bootstrap Status

The generated compiler is now sufficient to maintain and compile its own
portable source. Generated artifacts remain ignored build output rather than
checked-in source. The seed remains necessary only to establish Generation 1
from a clean checkout and to provide independent conformance evidence.

## Next Phase

M5 now uses the portable compiler through the versioned worker and measurement
boundary implemented in [0020-worker-protocol.md](0020-worker-protocol.md).
Portable function declarations and static dependency validation are next.
