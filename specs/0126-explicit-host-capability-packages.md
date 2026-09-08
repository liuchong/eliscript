# 0126: Explicit Browser and Worker Capability Packages

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-07
- Depends on: 0020 Emacs Worker Protocol and Measurement Probe, 0040 Project
  Maturity Roadmap and 1.0 Acceptance Contract, 0088 Versioned Emacs Worker
  Persistent Value Codec, 0089 Chunked Emacs Worker Value Streams, 0118
  Framework-neutral Library Interoperation

## Summary

Eliscript exposes browser and worker host authority through explicit platform
packages. A caller supplies a concrete host object and an exact grant list;
package import and token construction never read ambient browser, worker,
process, network, clock, randomness, or document globals.

Capability tokens are frozen, versioned data descriptors whose executable
operations remain in a package-private `WeakMap`. Copying or reconstructing the
descriptor does not copy authority. This completes the M11-04 implementation
unit without adding a framework, bundler, UI runtime, or compiler intrinsic.

## Authority Model

Both packages use the same lifecycle:

1. validate the host adapter and requested grant names
2. reject duplicate, unknown, or unavailable grants
3. normalize grant names into lexical order
4. bind only those host operations into private package state
5. return a frozen token containing only `format`, `version`, and `grants`
6. require the original token for every operation

A JSON round trip, object spread, structured clone, or hand-written lookalike
retains descriptive data but has no executable authority. Descriptor functions
return separate frozen data values for logging and negotiation.

This is an object-capability API, not a JavaScript sandbox. Non-portable code
can still use explicit `js*` or ordinary JavaScript imports. Portable closure
validation and worker transport continue to reject hidden host dependencies
and function transport; platform packages make intentionally host-bound code
reviewable and least-authority by construction.

## Browser Package

`eliscript/platform/browser.mjs` exports an Accepted browser capability token
with five closed grant names:

| Grant | Required host facility | Exposed operation |
| --- | --- | --- |
| `clock` | `scope.performance.now` | monotonic host time |
| `document` | `scope.document` | the explicitly supplied document authority |
| `network` | `scope.fetch` | receiver-preserving fetch calls |
| `randomness` | `scope.crypto.getRandomValues` | host random-value filling |
| `timers` | `scope.setTimeout`, `scope.clearTimeout` | paired timer creation and cancellation |

`browserCapabilities(scope, grants)` defaults to an empty grant list, not to
ambient authority. Supplying an unavailable grant fails before a token is
returned. Timer authority is atomic: both creation and cancellation must exist.

The package deliberately does not wrap DOM nodes, responses, requests, typed
arrays, callbacks, or timer handles in project-specific classes. Those values
remain ordinary host values behind an explicit authority boundary.

## Worker Package

`eliscript/platform/worker.mjs` defines two closed operation grants:

- `progress` permits delivery through the current request's progress channel
- `cancellation` permits inspection of the current request's `AbortSignal`

The reference worker constructs a fresh token for every request and exposes it
as `context.capabilities`. Existing `context.progress` and `context.signal`
fields remain compatible views over the same request-owned operations. The
context object and token are frozen; a token cannot be reused to acquire a
different request, process, filesystem, network, or module authority.

The worker ready frame advertises `operation-capabilities-v1`. Temporary
request modules may resolve `eliscript/platform/` imports through the same
package-confined resolver used for `eliscript/runtime/`; traversal outside the
platform directory is rejected.

The worker package also re-exports the existing versioned value-codec and
chunk-stream APIs. It does not define a second encoding, framing grammar, or
limit set; the canonical runtime modules remain the implementation owners.

## Package and Core Boundary

Platform packages are host-facing standard facilities, not portable core
libraries. They may depend on public runtime codecs and concrete JavaScript
host values. The language reader, analyzer, IR, emitter, persistent values,
protocols, transducers, and portable standard-library closures do not import
them.

Application code may pass a narrowly granted token into ordinary functions or
use it from JavaScript-backed operations. UI-library adapters, publishing
systems, and bundlers remain replaceable consumers and provide no evidence for
this specification.

## Compatibility Freeze

The version 1 browser and worker capability descriptors, closed grant sets,
original-token authority, private operation storage, request ownership,
receiver preservation, cancellation error, package-confined resolution, and
ambient-authority prohibition are stable. New authority requires a new
explicit grant or versioned package contract; descriptor-compatible lookalikes
must never acquire executable authority.

## Acceptance Criteria

- **HC-01:** Browser token construction reads no ambient global and defaults to
  zero grants.
- **HC-02:** Browser grants are closed, unique, explicit, and unavailable
  facilities fail before token creation.
- **HC-03:** Browser document, network, clock, randomness, and timer operations
  preserve their supplied host receivers and values.
- **HC-04:** Worker grants are closed to progress and cancellation and reject
  missing request operations.
- **HC-05:** Worker cancellation uses the request `AbortSignal` and produces a
  stable `worker-cancelled` capability error.
- **HC-06:** Tokens and descriptors are frozen; reconstructed descriptors
  cannot invoke operations.
- **HC-07:** Browser and worker package behavior is identical under supported
  Bun and Node hosts for deterministic adapters.
- **HC-08:** The real worker injects request-scoped capabilities, advertises
  negotiation support, and preserves existing context behavior.
- **HC-09:** Worker resolution accepts package-owned platform imports and
  rejects traversal outside the platform directory.
- **HC-10:** Public-surface checks inventory both platform packages, their host
  classification, inherited stability, and exact exports.
- **HC-11:** Source evidence rejects ambient-global and application-framework
  dependencies in both platform package implementations.
- **HC-12:** Default contract checks, the complete test suite, and strict Emacs
  byte compilation pass.
