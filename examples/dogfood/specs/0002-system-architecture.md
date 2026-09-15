# 0002: System Architecture

- Status: Accepted design
- Implementation: In progress
- Depends on: 0001 Product Contract

## Boundary

dogfood is a standalone Eliscript application project. All product modules are
written in `.eli` and compile through public Eliscript interfaces. React,
Markdown, GitHub APIs, bundlers, and GitHub Actions are replaceable application
dependencies.

## Two-Program Architecture

### Renderer Program

The renderer is an Eliscript program with no GitHub, filesystem, environment,
secret, cache, or Actions authority. It accepts only the canonical model from
specification 0003 and produces:

- complete static HTML documents;
- feed, sitemap, search, and public-data projections;
- the browser renderer entry for interactive islands;
- deterministic asset references and route metadata.

Its server entry compiles to JavaScript imported by the builder. Its browser
entry compiles to a separate JavaScript bundle shipped in the generated site.
Shared components and theme logic remain Eliscript modules.

The same normalized input, renderer identity, and asset identity must produce
byte-identical output.

### Builder Program

The builder is an Eliscript program compiled to the JavaScript Action entry. It
owns reliable publication and host effects:

1. Load and validate `dogfood.config.eli`.
2. Read Markdown posts from configured repository paths.
3. Fetch selected Issues and Discussions with complete pagination.
4. Resolve configured publisher identities and classify comment carriers.
5. Authorize remote article candidates before parsing article metadata.
6. Fetch comments only when a static snapshot policy requests them.
7. Normalize authorized sources into canonical post and comment values.
8. Resolve explicit projections, aliases, ordering, and conflicts.
9. Render Markdown through a sanitized GitHub Flavored Markdown pipeline.
10. Compute the canonical publishable model and fingerprint.
11. Call the compiled renderer with that model.
12. Write into a staging directory and atomically replace the output only after
    every check passes.

The builder never owns visual layout or emits ad hoc page fragments. It may emit
the build manifest and host diagnostics, but all public site presentation comes
from the renderer.

### Compiled Browser Renderer

The compiled browser renderer owns optional freshness and interaction:

- hydrate only interactive islands such as search, theme, and comments;
- lazily load comments only on a post page and only when visible or requested;
- use memory, IndexedDB or localStorage metadata, and HTTP validators where the
  provider permits them;
- render stale static snapshots immediately while attempting a public refresh;
- preserve provider identity and reply structure;
- never contain a repository credential.

The browser renderer is not an alternative source converter. It cannot fetch
private source data, construct canonical article identity, or be the only path
to the article body.

## Module Layout

| Module | Responsibility |
| --- | --- |
| `src/builder/main.eli` | Action lifecycle and complete source-to-site orchestration |
| `src/builder/config/` | Load, validate, and canonicalize configuration |
| `src/builder/content/` | Markdown, Issue, and Discussion article providers |
| `src/builder/comments/` | Native and external comment source adapters |
| `src/builder/state/` | Pagination, fingerprints, cache decisions, output transaction |
| `src/renderer/server.eli` | Deterministic static document renderer |
| `src/renderer/browser.eli` | Search, theme, live refresh, and channel mounting |
| `src/renderer/components/` | Static and browser components |
| `src/renderer/theme/` | Tokens and layout rules written in Eliscript |

Provider and renderer protocols are application protocols implemented in
Eliscript. No provider may call another provider directly. The renderer accepts
no provider implementation or raw provider record.

## Data Flow

```text
config
  -> source plans
  -> paginated raw records
  -> comment-carrier classification
  -> remote article author authorization
  -> normalized posts and comment channels
  -> explicit identity resolution
  -> publishable content fingerprint
  -> compiled renderer
  -> static routes and compiled browser data
  -> staged output validation
  -> atomic output
  -> Action outputs
```

Raw API records never reach rendering components. Renderers consume only the
normalized model from specification 0003.

Publication authorization is a builder capability and is never delegated to
the renderer or browser. Markdown publication authority comes from the trusted
repository revision and workflow boundary. Issue and Discussion publication
authority comes from the global owner-plus-coauthor policy in specification
0010.

## GitHub API Boundary

The builder uses REST endpoints for Issues and Issue comments, and the GraphQL
API for Discussions, comments, and replies. It authenticates at build time,
paginates serially, uses conditional requests where supported, and stops on
rate-limit instructions instead of retrying in a tight loop.

Because carrier classification and publication authorization precede article
metadata parsing, a provider cannot fetch bodies first. Every provider runs in
two phases:

1. **Metadata scan.** Paginate list endpoints for every enabled source, reading
   only record identity, author, labels or category, state, timestamps, and
   counts.
2. **Expansion.** Fetch bodies, comment snapshots, and reply topology only for
   records that survived authorization and carrier classification.

Both phases enforce the page, record, byte, and duration bounds of
specification 0008. A required source that exceeds a bound fails closed; an
optional source follows its configured failure policy. Carrier discovery is
part of the metadata scan, so a carrier provisioned by an external adapter
between two builds is classified before any article filter runs.

Unauthenticated browser REST access is limited to public data and a small lazy
request budget. Direct browser GraphQL access is not used because Discussion
queries require authentication. Live Discussion interaction is supplied by an
explicit external GitHub App or embed adapter, while the builder supplies the
native static snapshot.

## Static Output

```text
_site/
  index.html
  archive/index.html
  tags/index.html
  tags/<tag>/index.html
  posts/<slug>/index.html
  404.html
  feed.xml
  sitemap.xml
  robots.txt
  assets/
  _dogfood/build.json
  _dogfood/posts.json
```

`build.json` records public provenance, input fingerprints, generator source
identity, route count, and redacted provider statistics. It contains no token,
authorization header, private raw record, or local absolute path.

## Runtime Hosts

Local development may use the repository's maintained Bun toolchain. Packaging
compiles the builder, server renderer, and browser renderer from Eliscript. The
packaged GitHub Action then runs the generated builder and server renderer on
Node 24. It must not require Emacs, Bun, a globally installed Eliscript compiler,
or `node_modules` at consumer runtime.

The restricted reader for `dogfood.config.eli` is a bundled builder library,
not a third executable program and not general configuration code execution.
The Action and browser bundles remain reproducible from checked Eliscript
sources.

## Build Transaction

The build writes only to a unique staging directory. Validation checks every
route, asset reference, canonical URL, manifest entry, and forbidden secret
pattern. A successful build renames the staged tree to the requested output.
Failure leaves the previous output untouched.

## Failure Model

Errors are structured by phase, provider, repository, cursor, source identity,
and recoverability. A provider failure has one configured policy:

- `fail`: abort the transaction;
- `stale`: use a verified prior snapshot and mark it in the manifest;
- `omit`: omit that optional provider and emit a visible build warning.

`stale` and `omit` are forbidden for a source marked required. Silent partial
publication is never allowed.
