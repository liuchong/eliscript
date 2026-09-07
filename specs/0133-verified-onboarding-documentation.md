# 0133: Verified Installation and Daily Development Guide

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-08
- Depends on: 0106 Versioned Project Request Configuration,
  0114 Deterministic Concrete-syntax Formatter,
  0115 Emacs Major Mode Foundation,
  0116 Read-only Project Check and Emacs Diagnostics,
  0117 Virtual-source Builds and Emacs Compilation Commands,
  0119 Self-hosted Persistent Evaluation,
  0120 Interactive Terminal REPL,
  0121 Host-neutral Project Watch Events,
  0132 Repository Dependency and Generated-artifact Audits

## Summary

Eliscript maintains one continuous, framework-neutral guide from a source
checkout to daily development. It documents the supported environment, locked
dependency setup, command discovery, versioned project creation, canonical
formatting, read-only checking, self-hosted building, Bun and Node execution,
unsaved-source diagnostics, terminal evaluation, Emacs configuration, source
watching, troubleshooting, and verification boundaries.

Required workflow stages, command text, and repository entry points are owned
by `contracts/documentation.json` and checked by the default contract gate. A
separate end-to-end test creates a temporary real project and executes the
documented compiler, host, REPL, and editor paths. Documentation coverage and
behavioral execution are therefore independent evidence.

This specification completes the M10 installation and troubleshooting
documentation implementation unit. It does not claim the separate M13 clean
machine exercise, final compatibility matrix, or complete documentation and
acceptance audit.

## Guide Contract

`docs/getting-started.md` is the authoritative onboarding guide. Its required
sections follow the reader's actual workflow order:

1. supported environment
2. installation from a checkout
3. project creation
4. format, check, build, and run
5. unsaved source and diagnostics
6. terminal REPL
7. Emacs setup
8. project watch
9. troubleshooting
10. verification boundaries

The contract requires literal public commands for dependency setup, all daily
project operations, both explicit Emacs watch commands, warning-as-error byte
compilation, contract checks, repository-integrity checks, and the complete
suite. It also requires discoverable links from the project and editor guides.
A missing section, reordered section, removed command, unreadable guide, or
missing entry point fails before tests proceed.

## Executable Workflow

The onboarding test creates a temporary version 2 project with two real
Eliscript modules. It then:

- proves both documented sources are already canonical and pass format-check
- checks the complete configured graph without producing build artifacts
- builds through the public self-hosted project command and executes `42`
- repeats a cache-free build under the Node host and executes the same result
- overlays an invalid unsaved source and verifies structured `ELI-A0001`
- evaluates `(+ 20 22)` through the one-shot persistent-evaluation host
- retains a definition across two terminal REPL requests and exits cleanly
- loads the maintained Emacs package in batch mode and proves `.eli` selects
  `eliscript-mode`
- removes the complete temporary source and artifact tree in all outcomes

The test invokes public commands by absolute checkout path, matching the guide's
warning that individual launcher scripts must not be symlinked away from their
repository-relative compiler home.

## Troubleshooting Scope

The guide gives a concrete check and recovery for command discovery, GUI Emacs
environment differences, bootstrap artifacts, contained configuration paths,
format drift, unresolved bindings, cache decisions, virtual-source identity,
alternate-host differences, and process shutdown. Recovery never recommends
hand-editing generated modules, Source Maps, manifests, or generated API files.

Every troubleshooting instruction points to a maintained command or explicit
lifecycle operation. It does not hide an unresolved failure by deleting source,
weakening root containment, disabling diagnostics, or switching to an
application framework.

## Commands

```sh
bun run check:docs
bun test tests/onboarding-docs.test.mjs
make check-contracts
```

The first command validates the versioned documentation contract. The second
runs contract rejection and the real temporary-project workflow. The third
includes documentation validation in the default repository contract gate.

## Acceptance Criteria

- **VOD-01:** One linked guide covers the continuous path from a source
  checkout through project execution and editor use.
- **VOD-02:** Requirements, frozen dependency installation, command-home
  behavior, `PATH`, and GUI Emacs differences are explicit.
- **VOD-03:** A version 2 framework-neutral project request and complete
  canonical two-module source are provided.
- **VOD-04:** Documented format, graph check, build, Bun run, Node-host build,
  and Node run commands correspond to public interfaces.
- **VOD-05:** Unsaved source identity and structured diagnostic behavior are
  documented without implying file or artifact mutation.
- **VOD-06:** Persistent terminal REPL state, multiline input, load, reload,
  reset, help, and clean exit are documented.
- **VOD-07:** Emacs setup covers checkout loading, absolute command paths,
  project discovery, formatting, Flymake, builds, navigation, evaluation, and
  explicit session cleanup.
- **VOD-08:** Terminal and Emacs watch startup, shared ownership, event meaning,
  and explicit shutdown are documented.
- **VOD-09:** Troubleshooting covers every maintained installation, project,
  compiler, editor, cache, host, and lifecycle failure class named above.
- **VOD-10:** A versioned contract rejects missing or reordered sections,
  missing command text, unreadable documents, and missing entry points.
- **VOD-11:** A real temporary project executes the documented format, check,
  build, Bun, Node, diagnostic, evaluation, REPL, and Emacs mode path.
- **VOD-12:** Documentation completion contributes no application-framework
  evidence and does not claim the separate clean-machine, matrix, stability,
  or final acceptance gates.
