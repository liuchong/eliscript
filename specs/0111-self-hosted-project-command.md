# 0111: Self-hosted Project Command and Configuration

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0106 Versioned Project Request Configuration,
  0107 Self-hosted Project Graph Planning,
  0109 Self-hosted Build Decision Reports,
  0110 Self-hosted Incremental Project Cache

## Summary

The public `eliscript-build` command now executes the self-hosted project
service. Versioned request and configuration normalization are implemented in
Eliscript, while a shared standards-based JavaScript host owns argument
presentation, JSON decoding, filesystem access, path resolution, and process
exit behavior. The same command runs under Bun and Node and automatically
bootstraps a generated compiler when none is present.

The Emacs Lisp project command remains available as an explicit seed reference
for bootstrap audits and differential tests. It is no longer the implementation
behind the normal multi-file project command.

This specification covers compiler project tooling only. Vite, React, UI
libraries, bundlers, publishing systems, blog and site generators, hosting,
and development servers are replaceable application validation. They do not
enter the request protocol, command implementation, core dependencies, goals,
acceptance evidence, or maturity credit.

## Compiler-owned Request Protocol

The generated compiler exports `project-request-format`,
`project-request-version`, `project-request`, and `project-configuration`.
Request normalization validates a complete effect-ready request and returns a
frozen version 1 value:

```json
{
  "format": "eliscript-project-request",
  "version": 1,
  "entry": "/project/src/main.eli",
  "outDir": "/project/dist",
  "root": "/project",
  "portableEntries": ["group-by"],
  "useCache": true
}
```

Portable names are non-empty strings, deduplicated, and sorted. Entry and
output paths are non-empty strings, root is a non-empty string or null, and
cache intent is boolean. Invalid requests fail with `ELI-B0001` in the
`project-build` phase.

Configuration normalization accepts the closed version 1 key set from
specification 0106, applies defaults, validates contained relative paths, and
returns a frozen normalized value. Unsupported versions, unknown keys,
duplicate portable names, invalid booleans, and unsafe paths fail with
`ELI-B0002` in the `project-config` phase.

## Host Boundary

`bootstrap/host/project-cli.mjs` owns only host effects and presentation. It:

- parses command-line options without changing historical precedence
- reads and decodes one configuration file
- rejects duplicate JSON object keys, including escaped-equivalent keys
- resolves configuration paths relative to the configuration file
- delegates configuration and build-request semantics to generated `.eli`
  functions
- delegates graph, cache, emission, and report behavior to the self-hosted
  project service
- renders human or versioned JSON diagnostics

No compiler rule depends on Bun-specific APIs. Compiler loading uses standard
URL and path APIs; the same host modules execute under Bun and supported Node
versions.

## Public Routing and Bootstrap

`bin/eliscript-build` selects `ELISCRIPT_JS_RUNTIME`, defaulting to `bun`, and
loads `dist/bootstrap/compiler.mjs` by default. An explicit
`ELISCRIPT_BOOTSTRAP_MODULE_DIR` selects another generated compiler tree. If
the selected compiler is absent, the wrapper invokes the seed bootstrap once
before starting the self-hosted command.

`bin/eliscript-seed-build` is an explicit reference implementation for
bootstrap and differential verification. It is not the normal project command
and is not evidence that self-hosting succeeded.

At completion of this specification, `bin/eliscript` still used the seed
command. Specification 0112 subsequently routes both public commands through a
shared, compiler-owned build-operation boundary while retaining explicit seed
references. Multi-entry project identity remains open.

## Compatibility

Direct flags, versioned configuration, command-line overrides, cache disabling,
portable roots, reports, and structured diagnostics preserve the existing
project command contract. Relative command-line paths retain current-directory
semantics; configuration paths retain configuration-directory semantics.

Cache-free seed, Bun, and Node project commands must produce byte-identical
modules and source maps plus identical public manifest identity. Private cache
compiler digests may differ because seed and generated compilers have distinct
implementation identities.

## Acceptance Evidence

- Pure generated-compiler tests prove request/configuration normalization,
  freezing, defaults, path rejection, and dedicated diagnostic phases.
- The public command passes the existing direct, configured, portable, cache,
  report, and diagnostic CLI suite.
- The public command produces the same project artifacts under Bun and Node.
- The explicit seed reference and self-hosted command agree on generated
  modules, source maps, and public manifest identity.
- A missing generated compiler directory is bootstrapped and then used by the
  Node-hosted public command.
- Bootstrap fixed-point tests prove the request logic remains authored in
  Eliscript.

## Acceptance Criteria

- **SPC-01:** Versioned project request and configuration normalization are
  implemented in `.eli` and return frozen deterministic values.
- **SPC-02:** Invalid requests use `ELI-B0001`; invalid configuration uses
  `ELI-B0002`, including escaped-equivalent duplicate JSON keys.
- **SPC-03:** The public `eliscript-build` command executes the self-hosted
  project service under Bun and Node.
- **SPC-04:** Filesystem, path, JSON, process, and presentation effects remain
  in small host modules and do not define compiler semantics.
- **SPC-05:** A missing generated compiler is bootstrapped without making the
  self-hosted project command circular.
- **SPC-06:** The seed project command remains an explicit differential
  reference and is not the normal public project implementation.
- **SPC-07:** Seed, Bun, and Node agree on cache-free generated artifacts and
  public manifest identity.
- **SPC-08:** This slice does not claim single-file command convergence,
  multi-entry identity, or the M9 exit gate.
- **SPC-09:** Application frameworks, bundlers, publishing, blogs, sites,
  hosting, and development servers remain outside core implementation,
  dependencies, goals, acceptance evidence, and maturity credit.
