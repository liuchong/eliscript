# 0009: Delivery And Acceptance

- Status: Accepted design
- Implementation: Not started
- Depends on: 0001 through 0008, 0010 Publishing Authorization,
  0011 Comment Adapters

## Progress Model

Design, implementation, verification, publication, and real site acceptance are
separate tracks. File count, line count, commit count, elapsed time, and an
Action process exit are not completion measures.

Current design status is 11/11 accepted specifications. Executable
implementation is 0/8 gates. Final application acceptance is 0/13 criteria.

## Implementation Order

Gates are delivered as vertical slices, not as a design phase followed by a
build phase. Each slice must leave the previous slice working, and the design
record is corrected by implementation evidence rather than frozen ahead of it.

| Slice | Contents | Gates advanced |
| --- | --- | --- |
| S0 | Specification checker under `tools/`; design consistency enforced mechanically | none (tooling) |
| S1 | Markdown-only static site: one project, one builder entry, one renderer entry, no GitHub API, no comments | I1, I2 |
| S2 | One remote source, Issues first: authorization, carrier classification, pagination | I3 |
| S3 | One native comment channel, then one external adapter | I5 |
| S4 | Production site experience on the working site | I6 |
| S5 | Standalone Action and Pages workflow | I7, I8 |
| S6 | Discussion provider and the full source and comment matrix | I4, matrix evidence |

S0 is complete and is tooling evidence only. It does not advance a gate. S1 is
the next executable increment and is deliberately narrower than I1 and I2 as
written: it omits the compiler capability bundle, the standalone export, and
every remote provider so that configuration loading, canonical identity,
deterministic rendering, the renderer boundary, and atomic output replacement
are proven on the smallest possible surface.

## Implementation Gates

### I1: Standalone Project And Configuration

Create the package, lockfile, `eliscript.json`, reference
`dogfood.config.eli`, closed-schema validator, project-relative path model, and
standalone build commands. Establish separate renderer and builder entries and
prove both compile under seed and self-hosted compilers.

### I2: Canonical Markdown Publication

Implement Markdown discovery, front matter, canonical identity, sanitization,
assets, and normalization in the builder. Implement deterministic route, feed,
sitemap, search, alias, draft, and document rendering in the renderer. Prove the
builder passes only the canonical model across the boundary.

### I3: Issue Provider

Implement authenticated build-time pagination, publication filters, metadata,
owner/coauthor authorization, comment-carrier exclusion, provenance,
edit/delete reconciliation, native flat comments, public live loading, and
Markdown post bindings.

### I4: Discussion Provider

Implement GraphQL pagination, category and author filters, metadata, provenance,
owner/coauthor authorization, comment-carrier exclusion, edit/delete
reconciliation, nested comment snapshots, external authenticated live-channel
bindings, and Markdown post bindings.

### I5: Hybrid Identity And Comment Channels

Implement seven article-source subsets, explicit projections, fail-closed
conflicts, multi-channel presentation, Utterances, Giscus, generic external
adapters, snapshot/live/hybrid policies, and channel-local degraded states.

### I6: Production Site Experience

Implement the complete route map, content-first responsive theme, accessible
navigation, local search, light/dark/system themes, interactive islands, stable
layout, real-browser behavior, and performance baselines.

### I7: Standalone GitHub Action

Compile the builder plus server renderer into the generated Node 24 Action
bundle, compile the browser renderer separately, and implement Action inputs and
outputs, source maps, dependency bundling, deterministic package rebuild,
consumer fixture, and subdirectory-to-root export.

### I8: Pages Workflow And Operational Closure

Implement event classification, scheduled comment reconciliation, fingerprint
skip, cache marker, concurrency, protected Pages deployment template, least
permissions, security corpus, local end-to-end acceptance, and explicitly
authorized live publication acceptance.

## Required Test Matrix

The maintained suite covers:

- all seven non-empty article-source subsets;
- comments disabled;
- native comments only;
- external comments only;
- native and external channels together;
- source-aware Markdown/native bindings;
- static, live, and hybrid comment modes;
- duplicate ids, duplicate slugs, aliases, and explicit projections;
- more than one API page for every GitHub provider and comment topology;
- empty sources, partial provider failure, stale snapshots, and no-change runs;
- public and private source policies;
- owner-only publication, multi-author allowlists, author removal, identity
  mismatch, unauthorized projections, and comment-only users;
- external provider Issue/Discussion carriers that overlap article filters;
- Node 24 standalone Action execution without Emacs or Bun;
- Chromium, Firefox, and WebKit desktop and mobile viewports;
- JavaScript-disabled article reading;
- keyboard, reduced-motion, contrast, overflow, and layout checks.

Invalid combinations must have deterministic diagnostics and no output mutation.

## Final Acceptance Standard

Final application acceptance is all-or-nothing. All 13 criteria must pass on
one source identity:

| ID | Criterion | Required evidence |
| --- | --- | --- |
| DF-01 | Eliscript-only authored logic | Source scan, generated-artifact manifest, no handwritten JS |
| DF-02 | Complete source combinations | Seven-subset behavioral matrix |
| DF-03 | Stable identity and conflict safety | Projection, alias, duplicate-id, and duplicate-slug corpus |
| DF-04 | Complete static publication | Per-post HTML, index, archive, tags, feeds, sitemap, 404, assets |
| DF-05 | Comment flexibility | Native, external, combined, disabled, and source-aware modes |
| DF-06 | Comment quota control | 100-event simulations and no-change deployment evidence |
| DF-07 | Security and privacy | Sanitization, secret scan, permissions, and private-source corpus |
| DF-08 | Deterministic reproducibility | Two clean byte-identical site and Action builds |
| DF-09 | Standalone Action portability | Node 24 consumer fixture with no Emacs, Bun, or installed dependencies |
| DF-10 | Browser and accessibility quality | Three-engine desktop/mobile acceptance and accessibility audit |
| DF-11 | Pages operational result | Exact artifact deployment, canonical routes, refresh, and rollback proof |
| DF-12 | Marketplace package result | Public standalone repository, accepted metadata, signed release, live listing |
| DF-13 | Publication authorization | Owner-only default, coauthor allowlist, deny-by-default bypass corpus, and carrier isolation |

DF-11 and DF-12 require explicit authorization and external-state evidence.
Local implementation cannot mark them complete.

## Build Acceptance

A site build passes only when:

- every required provider is complete and fully paginated;
- configuration, posts, routes, assets, and comment bindings validate;
- the staged output contains no draft, secret, private field, or absolute path;
- every internal link and canonical URL resolves;
- generated feeds and sitemap match the route manifest;
- JavaScript-disabled pages contain complete article content;
- output replacement is atomic;
- the build manifest binds configuration, content, renderer, toolchain, and
  generated artifact identities.

## Action Acceptance

The release package passes only when:

- `action.yml` points to an existing generated Node 24 entry;
- the entry starts from a clean consumer checkout;
- all inputs and outputs match metadata;
- the package runs without network access except declared GitHub providers;
- runtime dependencies are bundled;
- source maps resolve to `.eli` source;
- rebuilding produces identical `dist/`;
- a source change without rebuilt `dist/` fails validation;
- a modified generated artifact without source change fails validation.

## Comment Coalescing Acceptance

Counters distinguish event receipt, scan, render, upload, and deployment.

- Runtime and external modes: 100 comment events result in 0 Actions builds.
- Scheduled mode: any number of comment changes in one interval produces at
  most 1 changed artifact and 1 deployment.
- No-change reconciliation: 1 scan, 0 renders, 0 uploads, 0 deployments.
- Superseded content runs: only the final source fingerprint reaches deployment.
- Provider failure: the prior static article remains available.

## Documentation Acceptance

The standalone project documents:

- every configuration key and default;
- all valid source and comment combinations;
- token permissions and private-source boundaries;
- local build, preview, test, export, and package commands;
- Markdown, Issue, and Discussion authoring;
- comment provisioning and external adapters;
- trigger costs and freshness tradeoffs;
- Pages installation and rollback;
- Marketplace consumer usage pinned by commit digest;
- generated versus handwritten file policy.

Every local link and checked command is executable in the exported repository.

## Completion Reporting

Progress reports use the eight implementation gates and thirteen final criteria
as denominators. They report completed, remaining, blocked, and externally gated
units separately. Core Eliscript progress remains unchanged by dogfood work.
