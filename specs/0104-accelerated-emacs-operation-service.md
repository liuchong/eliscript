# 0104: Accelerated Emacs Operation Service

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0022 Emacs Worker Integration,
  0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0088 Versioned Emacs Worker Persistent Value Codec,
  0089 Chunked Emacs Worker Value Streams,
  0091 Transport-safe Protocol Definitions

## Summary

Eliscript now exposes a high-level Emacs operation service over the worker
transport. Emacs packages declare generated modules and named dual-path
operations, then invoke those operations without constructing protocol
messages, choosing codec frames, tracking worker generations, or implementing
stale-buffer checks themselves.

Every operation retains an ordinary Emacs Lisp reference implementation. A
declared workload function and threshold select the local reference or warm
Eliscript path, callers can force either path, and verification mode compares
accelerated results with the reference before any editor state is changed.

This service is language runtime and Emacs integration infrastructure. Vite,
React, UI frameworks, bundlers, blog or site generators, publishing systems,
hosting, and development servers are optional consumers only. They define no
service semantics, core dependency, P6 evidence, or project maturity credit.

## Layered API

The public API has four explicit records:

1. A module declaration owns a generated module path plus optional project
   manifest and module version metadata.
2. An operation owns a symbolic name, an Emacs Lisp reference, exactly one
   portable or direct worker entry, workload sizing, an optional validated
   worker-argument projection, a nonnegative threshold, and an equality
   predicate.
3. A service owns one worker lifecycle, one current module declaration, an
   identity-keyed operation registry, verification policy, and value transport
   defaults.
4. A request exposes the selected path, completion state, result or error,
   worker request identity, target buffer version, and cancellation state.

Duplicate operation names are rejected before a worker is started. Missing or
ambiguous worker entries, invalid thresholds, and negative or non-integer
workload sizes are rejected before execution. Replacing a module immediately
advances the worker generation; explicit restart and stop likewise delegate
pending-request failure to the versioned worker lifecycle.

## Routing and Verification

Unless a caller forces a path, the service calls the operation workload
function with the complete argument list. Values below the threshold run the
reference directly; values at or above it use the accelerated entry. This
crossover belongs to each operation rather than to the protocol layer.

`always` verification evaluates the reference before dispatching the
accelerated request and applies the operation equality predicate to the two
results. A mismatch returns a structured `verification-mismatch` error and no
application callback runs. Reference execution therefore remains independently
exercisable in production code, tests, and future performance reviews.

An optional worker-argument projection runs only after routing and reference
verification have consumed the complete argument list. It must return a list.
This supports persistent worker snapshots without weakening the reference
contract or forcing unchanged bulk values across the process boundary.

The service passes progress, timing, timeout, project-manifest, module-version,
value-codec, and chunking concerns to the existing worker implementation. These
remain service options and callbacks rather than operation-specific protocol
code in Emacs packages.

## Editor Safety

A request targeting a buffer captures `buffer-chars-modified-tick` at dispatch.
The result is discarded when the buffer is dead or its tick has changed.
Successful application runs inside `atomic-change-group`; an application error
rolls back all buffer edits and becomes a structured `apply-error`.

Cancellation completes the high-level request exactly once, asks the worker to
cancel when a worker request exists, and suppresses any later result. Worker
restart, module replacement, timeout, protocol failure, and process exit likewise
cannot reach the application function after their request has failed.

## Maintained Integration

`tools/worker/eliscript-index.el` is migrated from direct protocol calls to the
operation service. It declares one exact Emacs scorer and one portable Eliscript
entry, enables continuous verification, and leaves generated-module and worker
lifecycle ownership to the service. The existing indexing API and result shape
remain compatible.

The conformance suite uses a real compiled fixture and real worker process. It
covers threshold routing, forced paths, twenty deterministic generated score
cases, deliberate disagreement, progress, cancellation, timeout, restart,
post-restart reuse, stale-buffer suppression, and transactional rollback.

## P6 and PD-09 Completion

P6 is complete because packages can invoke named accelerated operations without
protocol-level code, every operation has an independently callable reference,
and the service owns routing, verification, transport, lifecycle, and editor
application safety.

PD-09 is complete for every currently maintained accelerated operation. The
index scorer agrees on its fixed integration case and deterministic generated
cases. Deliberate mismatch, cancellation, stale buffers, and worker replacement
all produce errors without applying a result. Adding another maintained
operation requires extending this same reference and generated-case evidence.

## Acceptance Criteria

- **EOS-01:** A module declaration owns path, project-manifest, and version
  metadata without exposing protocol messages to operation callers.
- **EOS-02:** An operation has exactly one portable or direct worker entry and
  an executable Emacs Lisp reference.
- **EOS-03:** Workload size and a nonnegative threshold choose reference below
  the crossover and acceleration at or above it.
- **EOS-04:** Callers can force either path for correctness and measurement.
- **EOS-05:** Verification mismatch fails before result application.
- **EOS-06:** Progress, metrics, timeout, codec, chunks, and project lifecycle
  are owned by the service and worker layers.
- **EOS-07:** Cancellation completes exactly once and no later worker result is
  applied.
- **EOS-08:** Dead or modified target buffers reject results before application.
- **EOS-09:** Result application is atomic and fully rolls back on failure.
- **EOS-10:** Restart and module replacement fail obsolete requests and allow
  later requests on the current worker generation.
- **EOS-11:** The maintained index integration uses the service rather than raw
  protocol calls and preserves its public behavior.
- **EOS-12:** Real-worker tests cover deterministic agreement, disagreement,
  cancellation, stale buffers, restart, timeout, and transactional rollback.
- **EOS-13:** Application frameworks, bundlers, publishing, sites, hosting, and
  development servers remain outside core goals, dependencies, evidence, and
  maturity credit.
- **EOS-14:** Worker argument projection preserves complete reference and
  routing inputs, returns a validated list, and affects only accelerated
  dispatch.
