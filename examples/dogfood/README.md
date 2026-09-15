# dogfood

[Design specifications](specs/README.md) | [Specification check](tools/README.md)

dogfood is a GitHub-native static blog and the production application proving
ground for Eliscript. It is designed to combine repository Markdown, GitHub
Issues, and GitHub Discussions as independently enabled article sources, then
attach native or external comment channels in any valid combination.

The system has two executable programs:

1. **Renderer:** Eliscript rendering logic compiled to JavaScript. It transforms
   one normalized blog model into static HTML and the optional browser runtime.
2. **Builder:** an Eliscript build program compiled to JavaScript and executed
   by GitHub Actions. It converts Markdown, Issues, Discussions, and comments
   into the normalized model, then calls the renderer.

Packaged JavaScript under `dist/` is compiler output, not handwritten source.

## Current Status

| Track | Complete | Remaining | Evidence |
| --- | ---: | ---: | --- |
| Product and architecture design | 11/11 (100%) | 0/11 (0%) | [Specification index](specs/README.md) |
| Executable implementation gates | 0/8 (0%) | 8/8 (100%) | [Delivery plan](specs/0009-delivery-and-acceptance.md) |
| Final application acceptance | 0/13 (0%) | 13/13 (100%) | [Acceptance standard](specs/0009-delivery-and-acceptance.md#final-acceptance-standard) |

The design set is complete and the Markdown static slice builds a working local
site. No `action.yml`, generated Action bundle, release tag, Pages deployment,
or Marketplace listing is claimed in this state.

## Local Development

The first executable slice renders repository Markdown into a static site. From
the repository root:

```sh
bun run dogfood                 # compile, then build _site
bun run check:dogfood          # validate this design set
```

The compiled builder writes `examples/dogfood/_site` and reports the route
count, the published post count, and a content fingerprint. Because every route
is relative, the site opens directly from disk:

```text
examples/dogfood/_site/index.html
```

To inspect the pieces separately:

```sh
bun run build:dogfood                                                  # compile only
bun examples/dogfood/dist/src/builder/main.mjs --root examples/dogfood --output _preview
```

Two clean builds from identical input are byte-equal; the fingerprint in
`_site/_dogfood/build.json` is computed over the rendered documents.

### Delivered Slices

Each slice is verified by a maintained suite; the gates above stay open until
their full wording is met.

| Slice | What runs today | Test |
| --- | --- | --- |
| S0 | The design set is checked for internal consistency | `tests/dogfood-specs.test.mjs` |
| S1 | Repository Markdown becomes a static site: routes, tags, archive, feed, sitemap, search, aliases, drafts, atomic output | `tests/dogfood-site.test.mjs` |
| S2 | Issues are authorized, classified as carriers, paginated, and normalized | `tests/dogfood-issues.test.mjs` |
| S3 | Comment channels: a native channel captured as a snapshot or declared live, and external adapters declared as mount regions | `tests/dogfood-comments.test.mjs` |
| Packaging | The Action builds a consumer repository on Node 24 with no Emacs, Bun, or installed package | `tests/dogfood-action.test.mjs` |

Comments are deliberately not fetched during a build unless the configuration
asks for a snapshot, and a live channel is never fetched at all: a comment event
must not become a build. An external adapter's mount region is declared, but
this build does not script a third-party origin; loading it belongs to the
browser bundle of gate I6.

### Executable Status

The [specification checker](tools/README.md) is development tooling and does not
advance an implementation gate. The Markdown static slice is the first product
code: it delivers the observable behavior of gates I1 and I2 but is not yet a
completed gate, because gate completion also requires the focused local test
suite and the clean standalone-package check defined by
[specification 0009](specs/0009-delivery-and-acceptance.md). No gate is claimed
complete in this state.

## GitHub Action

The packaged Action is a single generated CommonJS file that runs on the Node 24
runtime supplied by GitHub Actions. No Emacs, Bun, or installed package is
required at consumer run time.

Build the package locally:

```sh
bun run package:dogfood
```

That command compiles the Eliscript sources, bundles
`dist/action/index.js`, and writes `dist/action/artifact.json`, which binds the
entry digest and every source digest. Rebuilding from unchanged sources is
byte-identical.

### Inputs And Outputs

| Input | Active | Meaning |
| --- | --- | --- |
| `config-file` | yes | Repository-relative configuration, default `dogfood.config.eli` |
| `output-directory` | yes | Output destination, default `_site` |
| `force` | yes | Report `reason=forced` |
| `github-token` | reserved | Issues and Discussions providers |
| `event-file` | reserved | Event classification |
| `preview` | reserved | Preview routes |
| `previous-manifest` | reserved | Previous-manifest verification |

Outputs are `built`, `reason`, `content-fingerprint`, `output-directory`,
`post-count`, `comment-snapshot-count`, and `manifest`. They are written to
`GITHUB_OUTPUT` when the runner sets it. A reserved input is accepted but not
read, and its description says so.

The bundled entry runs anywhere Node runs:

```sh
cd examples/dogfood/_demo
node ../dist/action/index.js
```

The `_demo` directory is a consumer project with its own configuration,
Chinese content, and a draft. It builds `_demo/_site` and proves the Action
reads the consumer's configuration rather than an embedded one.

### Not Published

`dist/action/index.js` is generated and not committed. There is no release tag,
no Pages deployment, and no Marketplace listing; publication is a separate,
explicitly authorized operation.

## Required Capabilities

- Enable Markdown, Issues, and Discussions independently or together.
- Publish Issue and Discussion articles only for the owner and configured
  coauthors; all other GitHub users remain comment-only participants.
- Use Issue comments and Discussion comments/replies as native comment channels.
- Bind Markdown posts to Issue or Discussion comment threads explicitly.
- Treat externally provisioned post-specific Issues or Discussions as comment
  carriers, never as articles.
- Mount one or more external comment providers beside native channels.
- Pre-render every article with a static fallback and add optional live
  enhancement in the browser.
- Coalesce comment changes without starting one full build per comment.
- Build a standalone Node 24 JavaScript Action entirely from Eliscript source.
- Export this directory as a repository root suitable for a later Marketplace
  release.

## Design Decisions

1. **Static article authority.** Every published post receives a deterministic
   HTML page. Live GitHub data may refresh the page, but it never removes the
   static fallback.
2. **Explicit identity.** Cross-source duplicates use a configured canonical id.
   Similar titles never imply that two posts are the same.
3. **Comment channels, not one lossy list.** Issue comments, Discussion threads,
   and external providers remain separately attributable and may be displayed
   as tabs or adjacent sections.
4. **No credential in the browser.** Private GitHub content can be snapshotted
   during a build; it cannot be fetched by shipping a token to visitors.
5. **No comment-triggered build by default.** Live comments use browser loading
   or an external provider. Static comment snapshots are reconciled on a bounded
   schedule or manually.
6. **Two-program boundary.** The builder owns GitHub and filesystem effects; the
   renderer owns deterministic presentation and cannot fetch source data.
7. **Build and deploy are separate.** The Marketplace Action generates a site
   artifact and evidence manifest. The consumer workflow owns Pages deployment.
8. **Application isolation.** GitHub, React, Markdown, and hosting integrations
   stay below this directory and contribute no Eliscript core maturity credit.
9. **Owner-first publication authority.** The owner is the only remote article
   publisher by default. A checked allowlist may add coauthors; labels,
   categories, repository roles, and comment-provider records do not grant
   article publication authority.

## Planned Standalone Layout

```text
dogfood/
  action.yml
  package.json
  bun.lock
  dogfood.config.eli
  AGENTS.md
  README.md
  content/posts/
  assets/
  src/builder/main.eli
  src/builder/config/
  src/builder/content/
  src/builder/comments/
  src/builder/state/
  src/renderer/server.eli
  src/renderer/browser.eli
  src/renderer/components/
  src/renderer/theme/
  templates/workflows/
  tools/
  tests/
  specs/
  toolchain/
  dist/action/index.js
  dist/site/browser.js
```

`action.yml`, `dist/action/index.js`, and `dist/site/browser.js` will be added
together when the Action gate is executable. The Action entry contains the
compiled builder and server renderer. The site bundle contains the compiled
browser renderer. A consumer runner does not need Emacs or Bun.

## Specification Map

| Specification | Decision |
| --- | --- |
| [0001](specs/0001-product-contract.md) | Product scope, modes, and boundaries |
| [0002](specs/0002-system-architecture.md) | Static and live engines, modules, and build flow |
| [0003](specs/0003-content-and-comment-model.md) | Canonical posts, provenance, conflicts, and comments |
| [0004](specs/0004-eliscript-configuration.md) | Eliscript configuration schema and validation |
| [0005](specs/0005-actions-and-comment-coalescing.md) | Trigger policy, comment coalescing, and quota bounds |
| [0006](specs/0006-site-experience.md) | Information architecture and visual behavior |
| [0007](specs/0007-action-and-marketplace-package.md) | Action contract and standalone publication shape |
| [0008](specs/0008-security-and-privacy.md) | Trust, permissions, sanitization, and private data |
| [0009](specs/0009-delivery-and-acceptance.md) | Implementation gates and final acceptance standard |
| [0010](specs/0010-publishing-authorization.md) | Owner, coauthor, comment-only, and carrier authorization |
| [0011](specs/0011-comment-adapters.md) | Comment adapter protocol, carrier binding, and discovery |
