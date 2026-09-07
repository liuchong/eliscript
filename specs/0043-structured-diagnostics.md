# 0043: Structured Compiler Diagnostics

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0006 Located Forms and Diagnostic Positions, 0019 Self-hosted Compiler Driver, 0040 Project Maturity Roadmap and 1.0 Acceptance Contract

## Summary

Eliscript compiler failures now carry a versioned, JSON-compatible diagnostic
record while preserving the existing human-readable condition and terminal
messages. The seed compiler, project builder, and self-hosted Bun driver expose
the same schema through `--diagnostic-format json`.

This contract gives Emacs integrations, editors, CI systems, and future
language servers structured data without requiring them to parse terminal
prose. Human output remains the default.

## Schema

A version 1 diagnostic is a JSON object with these required fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `format` | string | Always `eliscript-diagnostic` |
| `version` | integer | Always `1` for this schema |
| `code` | string | Stable diagnostic category identifier |
| `severity` | string | `error` in the implemented compiler |
| `phase` | string | Compiler or host phase that owns the failure |
| `message` | string | Diagnostic prose without a file prefix |

The optional `location` object contains `file`, `start`, and `end`. Each
position contains a zero-based Unicode code-point `offset` and one-based
`line` and `column` values. `location` is omitted when a host or option failure
has no meaningful source file.

Example:

```json
{
  "format": "eliscript-diagnostic",
  "version": 1,
  "code": "ELI-A0001",
  "severity": "error",
  "phase": "analysis",
  "message": "unbound symbol: missing",
  "location": {
    "file": "broken.eli",
    "start": { "offset": 19, "line": 2, "column": 3 },
    "end": { "offset": 26, "line": 2, "column": 10 }
  }
}
```

Consumers must ignore unknown additive fields. A breaking field removal,
meaning change, or coordinate-system change requires a new schema version.

## Diagnostic Codes

Version 1 reserves these implemented category codes:

| Code | Phase | Owner |
| --- | --- | --- |
| `ELI-R0001` | `reader` | source reading and syntax |
| `ELI-X0001` | `expansion` | macro expansion |
| `ELI-X0002` | `macro-evaluation` | deterministic seed macro evaluation |
| `ELI-A0001` | `analysis` | lexical and semantic analysis |
| `ELI-P0001` | `portable-analysis` | portable closure validation |
| `ELI-S0001` | `symbol` | identifier mapping |
| `ELI-E0001` | `emission` | ECMAScript emission |
| `ELI-I0001` | `ir-schema` | canonical IR serialization and validation |
| `ELI-B0001` | `project-build` | project graph and build validation |
| `ELI-C0001` | `cli` | option, host, and uncategorized CLI failures |

These are category-level codes, not one code per prose message. Later
specifications may add narrower codes without changing the schema.

## Human Compatibility

Compiler conditions retain their historical first data value. Located errors
render as `file:line:column: message`; unlocated errors retain their original
message. Existing callers using `cadr`, `error-message-string`, or human CLI
output therefore continue to work.

The structured object is associated with the condition internally and is read
through `eliscript-diagnostic-from-condition`. Callers must not inspect the
condition's storage mechanism.

The CLI defaults to human output. `--diagnostic-format json` writes exactly
one diagnostic JSON document to stderr and leaves stdout available for
generated modules or successful build reports. `eliscript-build --json`
continues to select the successful build report on stdout; it is independent
from diagnostic formatting.

## Public Interfaces

The Emacs compiler module exposes these supported diagnostic interfaces:

- `eliscript-diagnostic-p` and generated field accessors
- `eliscript-diagnostic-from-condition`
- `eliscript-diagnostic-condition-message`
- `eliscript-diagnostic-render`
- `eliscript-diagnostic-to-alist`
- `eliscript-diagnostic-to-json`
- `eliscript-diagnostic-from-error` for a host fallback
- `eliscript-diagnostic-signal` for compiler phases and adapters
- `eliscript-diagnostic-format-name` and `eliscript-diagnostic-version`

Functions and variables containing `--` remain internal implementation
details. In particular, the weak condition association and JSON location
helpers are not compatibility surfaces.

The Bun host exports `diagnosticFromError` for host adapters and
`requestedDiagnosticFormat` for its CLI boundary. Compiler-generated errors
carry an internal `eliscriptDiagnostic` property; consumers use the host
normalizer rather than depending on that property directly.

## Seed and Self-hosted Agreement

The portable reader, expander, and analyzer attach schema-compatible records at
their original failure sites. Their `Error.message` values remain byte-for-byte
compatible with the existing conformance fixtures. The Bun driver serializes
attached compiler diagnostics and creates `ELI-C0001` only when an error has no
compiler-owned record.

The shared stable scope requires matching format, version, code, severity,
phase, message, file, start, and end coordinates for every maintained negative
reader, expander, and analyzer conformance case. Other code categories become
dual-generation requirements as their corresponding portable phases gain
public host entry points.

## Acceptance Evidence

- ERT proves seed reader, expander, and analyzer conditions preserve exact
  human text and expose complete structured objects and source spans.
- CLI integration proves seed compiler and project-builder JSON failures,
  including the unlocated CLI fallback.
- The fixed-point compiler test proves the self-hosted CLI emits the same
  analyzer schema while Generations 1 through 3 remain reproducible.
- The reader, expander, and analyzer bootstrap suites prove exact seed and
  self-hosted diagnostic parity for all 89 maintained negative cases while the
  fixtures retain their exact historical human diagnostics.
