# 0022: Emacs Worker Integration

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0002 Emacs Acceleration Through JavaScript,
  0020 Emacs Worker Protocol and Measurement Probe,
  0021 Portable Functions and Dependency Closure

## Summary

The Emacs worker adapter is now a reusable execution service rather than a
single-process probe. One client object survives worker crashes and module
changes, portable closure builds carry source maps, and runtime diagnostics
point back to Eliscript source. A document indexing adapter validates the whole
path with concurrent, representative work.

```text
Emacs text and editor state
  -> explicit token vectors
  -> asynchronous portable calls
  -> cached generated module graph in Bun
  -> ordered score records or mapped diagnostics
  -> Emacs applies complete results
```

## Worker Generations and Module Cache

An imported ESM module is immutable within one worker generation. The worker
normalizes local module URLs, computes a filesystem fingerprint when the caller
does not provide `moduleVersion`, and caches one import promise plus its source
map. Responses expose `moduleCacheHit`, `moduleVersion`, and `sourceMapLoaded`
alongside duration metrics.

A request that presents a different version for an already imported module
receives `module-version-changed`; stale code is never executed as if it were
fresh. The Emacs client fingerprints local modules before sending a request and
restarts the worker when a known module changes. This policy accounts for ESM
loader caches that cannot reliably reload a changed file inside one process.

The same `eliscript-worker` object remains usable after:

- an explicit restart
- an unexpected process exit
- termination after an unresponsive synchronous timeout
- a local module fingerprint change

`generation`, `restart-count`, and `last-exit` keep lifecycle behavior visible.
Calling `eliscript-worker-stop` closes the object permanently, so explicit
shutdown is never mistaken for a recoverable crash.

## Source-mapped Diagnostics

Portable closure compilation supports external Source Map v3 output in both
the seed and self-hosted compiler drivers. The worker loads the linked map with
the module, decodes its Base64 VLQ mappings, and translates generated stack
frames to original `.eli` locations.

Project calls pass the deterministic `eliscript-project.json` produced by the
builder. Its digest covers the complete generated graph, and the worker loads
one map for every declared module. Dependency-only changes therefore trigger a
new worker generation, while dependency stack frames map to their own sources.

Runtime error objects contain:

- stable `code`, `name`, and `message` fields
- the original JavaScript `stack`
- structured `frames`, retaining generated locations when mapped
- `location`, selecting the first mapped Eliscript frame

`eliscript-worker-error-location` and `eliscript-worker-format-error` expose
that data to editor commands without requiring stack-string parsing.

## Representative Indexing Adapter

`tools/worker/eliscript-index.el` keeps editor-owned text handling in Emacs and
delegates pure scoring to `examples/emacs-index/index.eli`.

The adapter:

- tokenizes text in Emacs into explicit JSON-compatible vectors
- builds only the portable `score-document` project closure and its selected
  `data`/`object` dependencies, with a source map for every module
- owns a temporary generated module tree and long-lived worker session
- sends one asynchronous request per document
- preserves document order while responses complete independently
- cancels remaining requests after the first failure
- removes the generated module tree and stops its worker during session cleanup

The synchronous convenience path is built on the asynchronous API; it does not
introduce a second execution mechanism.

## Acceptance Evidence

The Bun protocol test proves cold and warm module-cache metadata, rejects
version changes within one generation, reloads fresh code in a new generation,
and maps a real runtime exception to its Eliscript fixture line.

ERT uses real Emacs and Bun processes to prove source-formatted errors,
automatic restart after module and dependency rewrites, recovery on the same
client after a blocking timeout, and concurrent scoring of three text
documents. The indexing test verifies ordered results and observes one cold
module load followed by cache hits. A graph test maps an imported-module error
and proves that a dependency-only rebuild changes the generation.

The fixed-point compiler test compares seed and self-hosted portable closure
JavaScript and Source Maps. This keeps diagnostics available on both sides of
the bootstrap boundary.

The indexing kernel now composes with `data/count-by` through a verified
portable import. Its project build and three-module execution path are detailed
in [0029-portable-indexing-composition.md](0029-portable-indexing-composition.md).

## Future Work

- map unsaved buffer positions through virtual source identities
- add explicit filesystem and network capability grants
- benchmark full Org or codebase indexes at useful corpus sizes
- define a browser implementation of the same portable request contract
