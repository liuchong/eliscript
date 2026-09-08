# 0144: Source-level Failure Mapping

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-08
- Depends on: 0009 Source Map v3 Emission,
  0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0119 Self-hosted Persistent Evaluation,
  0126 Explicit Browser and Worker Capability Packages

## Summary

Eliscript runtime failures identify the original `.eli` source point across the
maintained execution boundaries. Generated `.mjs` coordinates remain available
as secondary evidence, but they never replace the Eliscript location in a
required debugging workflow.

This contract closes AC-14. Its evidence executes directly with local Emacs,
Bun, Node, and filesystem tools. It does not require or accept a sandbox,
container, virtual machine, hosted service, application framework, or publishing
system as substitute evidence.

## Shared Mapping Runtime

`runtime/source-mapping.mjs` is a host-neutral ECMAScript module. It decodes the
Source Map v3 Base64 VLQ `mappings` field, parses V8 and browser-style JavaScript
stack frames, and maps generated positions to one-based source positions. It
imports no Node, DOM, worker, framework, or network API.

The public mapping functions accept explicit stack text and source-map
descriptors. File URLs, ordinary filesystem paths, cache-busting query strings,
and URL fragments are normalized for identity comparison. A mapped frame keeps
its generated position in `generated` and promotes the original `.eli` position
to `file`, `line`, and `column`.

Malformed VLQ input, negative decoded coordinates, invalid field counts, and
invalid descriptors fail with a structured `SourceMappingError`. Missing maps
or unmapped frames preserve the generated frame instead of inventing a source
position.

## Failure Boundaries

The maintained source-debugging corpus contains exactly these workflows:

| Workflow | Boundary | Required result |
| --- | --- | --- |
| Compiler | public compiler diagnostic | complete `.eli` start and end span |
| Runtime | persistent evaluation session | exact `.eli` point |
| Browser event | `browserEventBoundary` synchronous handler | exact `.eli` point |
| Async rejection | `browserEventBoundary` returned promise | exact `.eli` point |
| Worker | versioned worker request | exact `.eli` point |

`browserEventBoundary(handler, report, sourceMaps)` returns an event listener
that preserves successful synchronous return values. A thrown value or rejected
thenable is converted to one source-mapped failure and passed to `report` with
the original event. The boundary consumes the failure after reporting it so the
host event dispatcher does not also emit an unmapped asynchronous error.

The worker uses the same decoder, stack parser, and frame mapper. Its protocol
error payload selects the first mapped `.eli` frame as `location` while retaining
the complete frame list and original stack.

## Versioned Evidence

`contracts/source-debugging-corpus.json` freezes the ordered workflow inventory,
source fixture, exact expected location, and executable evidence locator. The
checker rejects missing, additional, reordered, untracked, non-Eliscript, or
coordinate-incomplete entries and missing evidence locators.

Browser event and async rejection evidence compiles one Eliscript fixture with
an external source map, loads the result through standard `EventTarget`, and
executes it independently under Bun and Node. Engine-specific messages and
generated stack frames may differ; the original Eliscript file, line, and column
must be identical.

## Acceptance Criteria

- **SFM-01:** The corpus contains exactly compiler, runtime, browser-event,
  async-rejection, and worker workflows in that order.
- **SFM-02:** Compiler evidence matches the complete expected `.eli` start and
  end span.
- **SFM-03:** Runtime, event, rejection, and worker evidence match exact `.eli`
  file, line, and column values.
- **SFM-04:** Every runtime-mapped primary location ends in `.eli`; generated
  `.mjs` coordinates are retained only under `generated`.
- **SFM-05:** Browser event and rejection cases pass under both maintained Bun
  and Node hosts without framework APIs.
- **SFM-06:** Worker and browser boundaries share the public host-neutral source
  mapping runtime.
- **SFM-07:** The default core contract gate validates corpus completeness and
  executes all evidence directly on the local machine.

AC-14 is complete only while all seven criteria pass in the default core suite.
