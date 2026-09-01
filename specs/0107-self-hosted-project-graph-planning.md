# 0107: Self-hosted Project Graph Planning

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0019 Self-Hosted Compiler Driver,
  0024 Multi-file Project Builds,
  0028 Portable Module Composition,
  0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0106 Versioned Project Request Configuration

## Summary

Eliscript now owns deterministic multi-module graph planning in the
self-hosted compiler. `bootstrap/compiler/project.eli` computes ordinary
dependency closure, cycle-safe traversal, portable requested-name propagation,
and the portable graph fixed point without reading files, resolving paths, or
writing artifacts.

A small standards-based JavaScript host service supplies source reads,
canonical path containment, import resolution, output writes, hashing, and
compiler module loading. The planner remains a language/toolchain component;
the host service is an implementation boundary around external effects.
Application frameworks, publishing systems, and site generators may consume
the resulting ESM, but remain replaceable validation and receive no core
maturity credit.

## Planner Contract

The generated compiler exports two synchronous planning operations:

| Operation | Input | Result |
| --- | --- | --- |
| `project-plan` | entry module IDs and a dependency callback | complete ordinary module closure |
| `portable-project-plan` | module/name requests and a dependency callback | complete portable name closure |

Module IDs and requested names are non-empty strings. Entries, dependencies,
module records, and requested names are deduplicated and sorted. Result arrays
and records are frozen. Invalid shapes, invalid callback results, and the
bounded iteration guard fail with `ELI-B0003` in phase `project-plan`.

The planner returns `eliscript-project-plan` version 1:

```json
{
  "format": "eliscript-project-plan",
  "version": 1,
  "mode": "standard",
  "entries": ["src/main.eli"],
  "modules": []
}
```

The standard planner visits each module at most once and accepts dependency
cycles. The portable planner reprocesses a module whenever newly discovered
imports add requested names. It terminates only when no module has unprocessed
names, so transitive portable selection is a graph fixed point rather than a
single traversal snapshot.

## Host Boundary

`bootstrap/host/project.mjs` implements the effectful project service. It:

- canonicalizes the project root, entry, and output directory
- rejects missing files and symlink/path escapes before compilation
- reads source text and resolves only relative local `.eli` graph edges
- invokes the generated compiler for IR, planning, ESM, and Source Maps
- rewrites local source imports to generated `.mjs` imports
- writes the version 1 public project manifest and deterministic digest

The host does not implement graph traversal or portable fixed-point policy.
The `.eli` planner receives module IDs and dependency callbacks, so another
filesystem or editor host can implement the same effect boundary without
forking language logic.

The service is standards-based and executes under both Bun and Node when given
the generated compiler module directory. The current project command still
uses the seed project operation; routing configuration and CLI entry points to
this service is a later M9 convergence slice.

## Reproducibility

Ordinary and portable self-hosted project builds are compared with cache-free
seed builds. Every generated ESM module and Source Map must be byte-identical,
and the public project manifest digest must match. The same self-hosted service
must produce those bytes under Bun and Node.

Private cache convergence was completed by specifications 0109 and 0110 after
this planning slice. Graph planning remains independent of cache effects and
application integrations.

## Acceptance Criteria

- **SHP-01:** Ordinary graph planning is deterministic, deduplicated, and
  cycle-safe.
- **SHP-02:** Portable graph planning reprocesses modules until requested-name
  propagation reaches a deterministic fixed point.
- **SHP-03:** Graph and closure policy is implemented in `.eli`; filesystem,
  path, and output effects remain in a host adapter.
- **SHP-04:** Ordinary and portable self-hosted builds match cache-free seed
  ESM, Source Maps, and public manifest digests.
- **SHP-05:** The same host service and generated compiler pass under Bun and
  Node.
- **SHP-06:** Application frameworks, publishing, sites, hosting, and
  development servers remain outside core implementation and evidence.
