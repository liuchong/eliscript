# 0121: Host-neutral Project Watch Events

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0043 Structured Compiler Diagnostics,
  0106 Versioned Project Request Configuration,
  0116 Read-only Project Check and Emacs Diagnostics

## Summary

Eliscript adds one versioned, host-neutral source invalidation stream for
configured and explicit-root projects. The public `eliscript-watch` command
emits normalized project events; the maintained Emacs mode consumes the same
events to refresh project diagnostics. Filesystem observation, timers, paths,
and process lifecycle remain host responsibilities and do not enter language,
compiler, runtime, or standard-library semantics.

The implementation uses deterministic content snapshots rather than exposing
native filesystem watcher event names. This avoids platform-specific rename,
coalescing, and recursive-watch behavior while preserving exact create,
modify, and delete observations for Eliscript source files.

Application frameworks, bundlers, publishing tools, development servers,
sites, and hosting are neither dependencies nor evidence for this capability.
Optional application adapters may consume the public event stream without
changing it.

## Versioned Event Contract

Every machine event is one JSON line with:

- `format`: `"eliscript-watch-event"`
- `version`: `1`
- `sequence`: a non-negative safe integer, increasing within one process
- `event`: `"ready"`, `"change"`, or `"error"`
- `root`: the canonical absolute source root

A `ready` event has an empty `changes` array and the initial snapshot digest.
A `change` event has a non-empty sorted `changes` array and the resulting
snapshot digest. Each change has a canonical absolute `file`, a root-relative
`path` when the file is contained by the source root, and one `kind`:
`"create"`, `"modify"`, or `"delete"`. A configuration file outside the source
root has no relative `path` but retains its canonical `file` identity.

An `error` event contains one versioned Eliscript diagnostic. Observation
continues after a recoverable scan error. Event objects and change arrays are
closed: unknown event kinds, change kinds, or fields are not part of version 1.

Snapshot digests are SHA-256 over sorted canonical file identities and content
digests. Timestamps, inode numbers, native watcher event names, polling times,
and temporary paths do not affect the digest.

## Observation Boundary

An explicit-root watch recursively observes regular `.eli` files below the
canonical root. A configured watch resolves `eliscript.json` through the same
versioned project request as build/check commands, observes the resulting
source root, and also observes the canonical configuration file. Directory and
file symlinks are not followed. Non-Eliscript files and generated output do not
produce source events.

The public polling interval is bounded and validated. A scan cannot overlap a
prior scan. Files that disappear during a scan are represented by the next
stable snapshot rather than an uncontrolled host exception. Changes are
coalesced per snapshot and sorted by canonical file identity.

## Public Command

`eliscript-watch` accepts exactly one project selector:

- `--root DIRECTORY`
- `--config FILE`

`--interval MILLISECONDS` selects a bounded polling interval. `--json` emits
the versioned NDJSON contract; human mode prints a concise ready line and one
line per change or error. `--help` exits without starting a timer.

Normal end of input does not terminate a watch. SIGINT, SIGTERM, command
failure, and explicit Emacs stop close the polling timer and process. The
command owns no listener, child process, or persistent artifact.

## Emacs Consumption

The maintained mode owns at most one watch process per canonical project root.
Starting a second watch reuses the live session. It validates event format and
version, preserves partial NDJSON lines between process-filter calls, exposes a
project watch event hook, and requests Flymake refresh for live Eliscript
buffers in the changed project.

Stopping a watch is explicit and removes the shared session. Process death
removes stale ownership so the next start creates a fresh session. Watch
events never replace unsaved buffer contents and never invoke application
tooling.

## M10 Status

This specification completes the host-neutral watch API and maintained Emacs
consumer when every acceptance item has default-suite evidence. M10 remains in
progress until local onboarding, troubleshooting documentation, the
complete AC-12 compatibility matrix, and the milestone exit gate are closed.

## Acceptance Criteria

- **HPW-01:** Ready and change events satisfy `eliscript-watch-event` version 1
  and use strictly increasing process-local sequences.
- **HPW-02:** Content snapshots report sorted create, modify, and delete changes
  for regular `.eli` files without relying on timestamps.
- **HPW-03:** Non-source files, generated output, directory symlinks, and file
  symlinks do not produce source events.
- **HPW-04:** Configured watching uses the versioned project request and detects
  both source and configuration changes.
- **HPW-05:** Node and Bun emit equivalent ready/change/error events for the
  same canonical project state.
- **HPW-06:** Invalid roots, configurations, intervals, options, and inaccessible
  snapshots produce controlled diagnostics or command errors.
- **HPW-07:** SIGINT, SIGTERM, explicit stop, and process failure leave no timer,
  child process, listener, or generated artifact.
- **HPW-08:** Emacs shares one process per project, validates and frames NDJSON,
  runs the public event hook, refreshes matching Flymake buffers, and removes
  dead sessions.
- **HPW-09:** Public surface, compatibility baseline, documentation, and default
  tests cover watch behavior on maintained hosts and editors.
- **HPW-10:** No application framework, bundler, publishing, development-server,
  site, or hosting dependency contributes to implementation or evidence.
