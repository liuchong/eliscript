# 0110: Self-hosted Incremental Project Cache

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0031 Incremental Project Builds,
  0032 Build Decision Reports,
  0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0107 Self-hosted Project Graph Planning,
  0109 Self-hosted Build Decision Reports

## Summary

The self-hosted project service now reads, validates, migrates, and writes the
same private incremental project-cache family as the seed compiler. Cache
identity and module-reuse policy are implemented in Eliscript. A small
standards-based host supplies filesystem facts, SHA-256 digests, canonical
paths, source reads, and artifact writes.

This is a compiler and project-service capability. Vite, React, UI libraries,
bundlers, publishing systems, blog and site generators, hosting, and
development servers remain replaceable application validation. They are not
dependencies, design inputs, core goals, or maturity evidence for this cache.

## Version 2 Identity

New manifests write a private cache object with an explicit family identity:

```json
{
  "cache": {
    "format": "eliscript-project-cache",
    "version": 2,
    "compilerDigest": "<sha256>",
    "mode": "standard",
    "portableEntries": [],
    "modules": [
      {
        "source": "src/main.eli",
        "dependencies": ["src/value.eli"],
        "portableEntries": [],
        "macroDependencies": [
          {"path": "build-value.txt", "digest": "<sha256>"}
        ]
      }
    ],
    "digest": "<sha256>"
  }
}
```

The cache digest covers `format`, `version`, compiler identity, mode,
normalized portable roots, and canonical module metadata before `digest` is
added. When present, canonical module metadata includes the ordered declared
macro input paths and digests. Public graph identity remains versioned
independently and does not expose private cache mechanics, but specification
0124 places the same macro input records in public module identity.

Version 1 cache records without `format` remain readable. They are never
written. A successful standard reuse rewrites the manifest as version 2. A
portable version 1 hit bypasses the complete-hit shortcut, repeats closure
validation, reuses valid artifacts, and then writes version 2. Unsupported
families or versions produce `cache-version-changed`.

## Compiler-owned Policy

The generated compiler exports:

- `project-cache-format`, equal to `eliscript-project-cache`
- `project-cache-version`, equal to `2`
- `project-cache-lookup`, which validates host-supplied manifest facts and
  returns canonical records or a stable miss reason
- `project-cache-decision`, which decides whether one module is reusable

These operations are synchronous, deterministic, and free of filesystem
effects. They accept completed facts rather than Node, Bun, path, or hashing
APIs. Returned protocol records are frozen.

Manifest lookup checks public schema and entry identity, public graph digest,
private cache family and digest, compiler identity, build mode, normalized
portable roots, and one-to-one identity/metadata records. Module decisions
check output paths, portable entry identity, readable artifacts, source and
artifact digests, resolvable dependency metadata, and exact declared macro
input records. A changed macro input produces `macro-dependencies-changed`.

An unreadable artifact takes precedence over digest comparisons because a
partial set of host facts cannot prove a source or output change. Stable reason
strings remain compatible with specification 0032.

## Host Boundary

`bootstrap/host/project.mjs` owns effects only. It:

- derives a compiler digest from the generated compiler module directory
- reads and parses `eliscript-project.json`
- computes public and private identity digests
- supplies source and generated-artifact facts to compiler-owned policy
- reconstructs verified modules without emission
- writes a canonical version 2 cache after every completed build

The same generated compiler directory has one compiler digest under Bun and
Node. A cache written by either host is therefore reusable by the other.
Injected compiler objects must provide an explicit lowercase SHA-256 identity.
Different compiler identities conservatively miss with `compiler-changed`;
seed and generated compilers are not assumed to be byte-identical merely
because they implement equivalent semantics.

## Reuse Semantics

Standard graph planning follows verified cached dependency edges without
parsing reused modules. Dirty modules are parsed, lowered, and emitted
independently. A changed or damaged dependency does not force an unchanged
importer to emit again when its generated import path remains valid.

Portable self-hosted builds repeat requested-name propagation and closure
validation before making artifact decisions. They may reuse every verified
output after that proof, but must not reuse stale portable reachability. This
keeps the portable language boundary authoritative while avoiding unnecessary
emission.

The public build report distinguishes disabled, miss, partial, and hit states.
On a verified manifest with one damaged output, exactly that module reports its
specific reason while clean modules report `verified`.

## Acceptance Evidence

- Pure Eliscript policy accepts current v2 and legacy v1 records and rejects
  incompatible or damaged identity facts.
- Seed ERT proves v1 read compatibility and automatic v2 rewrite.
- Cache-free seed, Bun, and Node builds remain byte-identical for ordinary and
  portable graphs.
- Node fully reuses a standard and portable cache written by Bun.
- Tampering with one generated standard module recompiles and repairs only
  that module while reusing the remaining graph.
- Bootstrap fixed-point and compiler tests prove the policy remains authored
  in Eliscript rather than copied into a frontend integration.

## Compatibility Freeze

The private cache version 2 identity, read-only version 1 migration, verified
artifact reuse, dependency-edge reuse, portable-closure revalidation,
cross-host Bun/Node compatibility, and selective repair behavior are stable.
Future cache layouts require explicit migration and must preserve public
manifest, report, diagnostic, and generated-artifact semantics.

## Acceptance Criteria

- **SIC-01:** New private cache metadata has format
  `eliscript-project-cache`, version `2`, and a digest over its complete
  canonical identity.
- **SIC-02:** Version 1 metadata remains read-only compatible and migrates to
  version 2 after a successful build.
- **SIC-03:** Cache lookup and module-reuse decisions are implemented in `.eli`;
  host code supplies effects and completed facts only.
- **SIC-04:** Standard builds traverse verified cached dependency edges without
  parsing clean modules and selectively recompile dirty modules.
- **SIC-05:** Portable builds revalidate requested-name closure before
  selectively reusing generated artifacts.
- **SIC-06:** Bun and Node reuse each other's caches when compiler identity and
  project inputs match.
- **SIC-07:** Public graph identity, generated ESM, Source Maps, and report
  semantics remain deterministic and compatible with cache-free seed output.
- **SIC-08:** Vite, React, UI frameworks, bundlers, publishing, blogs, sites,
  hosting, and development servers do not enter core code, dependencies,
  goals, acceptance evidence, or maturity credit.
