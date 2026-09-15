# 0007: Action And Marketplace Package

- Status: Accepted design
- Implementation: Not started
- Depends on: 0002 System Architecture, 0005 Actions And Comment Coalescing

## Package Objective

`examples/dogfood/` is the canonical project root. It must support:

1. local development inside the Eliscript repository;
2. repository action use through a subdirectory reference;
3. deterministic export of this directory as a standalone repository root;
4. later Marketplace publication without moving or rewriting source files.

Marketplace publication is a separate, explicitly authorized release operation.
The current private repository and design scaffold are not publication evidence.

## Action Metadata

The implementation gate adds exactly one `action.yml` at the dogfood project
root. Its runtime contract is:

```yaml
runs:
  using: node24
  main: dist/action/index.js
```

The generated JavaScript bundle and all runtime dependencies are committed for
release. The consumer runner requires only the JavaScript runtime supplied by
GitHub Actions.

## Inputs

| Input | Required | Default | Meaning |
| --- | --- | --- | --- |
| `config-file` | no | `dogfood.config.eli` | Repository-relative Eliscript configuration |
| `output-directory` | no | `_site` | Staged static output destination |
| `github-token` | conditional | none | Build-time access for enabled GitHub sources |
| `event-file` | no | host event path | Event classification input |
| `force` | no | `false` | Bypass no-change build skip |
| `preview` | no | `false` | Include preview routes under no-index policy |
| `previous-manifest` | no | none | Optional verified prior public build manifest |

`github-token` is consumed as a secret and never becomes part of normalized
configuration.

## Outputs

| Output | Meaning |
| --- | --- |
| `built` | Whether a new site tree was produced |
| `reason` | `changed`, `no-change`, `forced`, or `deferred` |
| `content-fingerprint` | Canonical publishable input digest |
| `output-directory` | Validated site artifact path |
| `post-count` | Published canonical post count |
| `comment-snapshot-count` | Included comment snapshot count |
| `manifest` | Path to the redacted build manifest |

The Action builds and validates only. It does not call the Pages deployment API.

## Consumer Workflow

The standalone package includes a workflow template that:

1. checks out the consumer repository;
2. invokes the dogfood Action pinned to a full commit digest;
3. skips upload when `built=false`;
4. uploads `_site` with the maintained Pages artifact action;
5. deploys in a separate job and protected `github-pages` environment;
6. grants only `contents: read`, required Issue/Discussion read permissions,
   `pages: write`, and `id-token: write`;
7. uses one build concurrency group and one deployment environment.

Workflow event filters implement specification 0005. Config cannot dynamically
add workflow triggers, so schedule and event-policy changes require an explicit
workflow edit and validation.

## Packaging Pipeline

The packaging command performs:

1. compile the builder and server renderer from `.eli` source;
2. bundle both into the generated Action entry for Node 24;
3. compile the browser renderer from `.eli` source;
4. package the generated browser renderer as a site asset;
5. strip development-only code and absolute paths;
6. produce source maps whose sources point to project-relative `.eli` files;
7. generate an artifact manifest with source and toolchain digests;
8. execute the Action bundle under Node 24 without Emacs, Bun, or installed
   packages;
9. rebuild and compare byte-identical release artifacts.

No handwritten `.js`, `.mjs`, `.cjs`, or `.ts` file may enter the
standalone package.

### Implementation Status

The maintained packaging tool is [`tools/package.eli`](../tools/package.eli),
an Eliscript program. It compiles the Eliscript sources, bundles one CommonJS
Node 24 entry, rejects credential shapes and absolute host paths, and writes a
source-bound artifact manifest. Two packaging units remain open: the browser
renderer bundle, which needs the interactive islands of gate I6, and the
exported `toolchain/` capability that makes the standalone repository
rebuildable without the monorepo.

## Toolchain Export

The monorepo build uses public Eliscript commands from the repository root. The
standalone export contains a generated, source-bound compiler capability under
`toolchain/` sufficient to rebuild both programs without private repository
paths.

The export verifier reconstructs `dist/action/index.js` from:

- dogfood `.eli` source;
- the generated compiler capability;
- the lockfile;
- declared application dependencies.

Compiler source may not be copied and privately patched inside dogfood.

## Marketplace Shape

The standalone repository must contain only files needed to build, test, use,
document, and license dogfood. `action.yml` is at its root and is the only root
Action metadata file. Its display name is `dogfood` unless a release-time
uniqueness check requires a user-approved change.

The root project GPL-3.0 license remains applicable. A standalone export includes
the corresponding license and complete preferred source for generated object
code.

## Publication Gate

No Marketplace publication is complete until all of these are independently
verified:

- the standalone repository is public;
- Action metadata validation passes;
- the display name is accepted;
- generated `dist/` is committed and reproducible;
- a commit-pinned consumer workflow builds a fixture site;
- Pages deploys the exact uploaded artifact;
- the release tag points to the accepted signed commit;
- the Marketplace listing resolves to that release.

Creating files or tags locally does not satisfy this gate.

## External Host Contracts

The implementation follows the official GitHub contracts:

- https://docs.github.com/en/actions/tutorials/create-actions/create-a-javascript-action
- https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

Host behavior is rechecked when Action implementation or publication begins.
