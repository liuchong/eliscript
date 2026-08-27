# 0013: Bootstrap Foundation

- Status: Implemented
- Date: 2026-08-28

## Summary

M4 begins by moving leaf compiler modules from the Emacs Lisp seed into
Eliscript and running both implementations against shared conformance data.
The first portable module owns symbol-name validation and deterministic
ECMAScript identifier mapping.

This stage does not claim self-hosting. It establishes the directory,
representation boundary, build command, and dual-implementation test pattern
that later compiler phases must follow.

## Source and Artifact Boundary

Portable compiler source lives below `bootstrap/compiler/`. Generated ESM and
Source Map v3 files live below `dist/bootstrap/` and are ignored build
artifacts.

```text
Emacs Lisp seed + bootstrap/compiler/symbol.eli
  -> dist/bootstrap/symbol.mjs
  -> JavaScript host
```

The seed compiler remains authoritative while Generation 1 is incomplete. A
portable module is accepted only after it matches the seed contract over one
shared fixture and can be built through the public compiler CLI.

## Runtime Symbol Representation

The seed compiler receives native Emacs symbols. The portable compiler will
instead represent parsed symbols explicitly and pass their names as strings to
the symbol-mapping module. Consequently, `symbol.eli` exports functions over
symbol-name strings:

- `munge-segment`
- `binding-name`
- `reference-name`

The reader or analyzer remains responsible for distinguishing a symbol from a
keyword, literal, or other syntax value. This keeps Emacs-specific object
identity out of the portable compiler API.

## Mapping Contract

The portable module preserves the seed behavior:

- ASCII letters, digits, `_`, and `$` remain unchanged.
- `-`, `?`, `!`, `*`, `+`, `=`, `<`, and `>` use readable substitutions.
- Other Unicode code points use uppercase `_U<hex>_` escapes with at least four
  hexadecimal digits.
- Leading digits receive `_`.
- ECMAScript reserved words receive `$`.
- Bindings reject reserved Eliscript values, qualified names, rest markers,
  and the compiler-owned `__eliscript_` prefix.
- References split on `.` or `/`, discard empty path segments, munge each
  segment, and join them with `.`.

The Unicode loop advances by JavaScript UTF-16 width while escaping the full
code point. This preserves the seed result for supplementary characters.

## Shared Conformance

`tests/fixtures/bootstrap-symbols.json` is the single conformance input for
both implementations. It includes valid outputs and expected failures for
segments, bindings, and qualified references.

The Emacs ERT test runs the seed functions against every case. The Bun test
first compiles `symbol.eli` with `bin/eliscript`, imports the resulting ESM,
verifies repeated code and source-map output are byte-identical, and runs the
same cases against its exports. Temporary generated files are removed after
the test.

This arrangement is intentionally symmetric: changing semantics requires one
fixture change and both implementations must agree before the suite passes.

## Next Portable Phases

The remaining Generation 1 dependency order is:

1. explicit syntax values and source spans
2. a portable reader
3. macro expansion and lexical analysis
4. IR construction and direct ESM emission
5. a host-neutral compiler driver with filesystem adapters
6. seed/portable compiler equivalence and reproducible self-compilation

Each phase must expose deterministic data and add shared conformance evidence.
