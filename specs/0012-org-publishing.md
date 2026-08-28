# 0012: Org Publishing

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-28

## Summary

Eliscript provides an optional publishing adapter that uses the Org libraries
bundled with Emacs to compile trusted `.org` articles into a deterministic ESM
data module. A Vite adapter exposes that module to applications, while the
included site proves that a complete publishing interface can be written in
Eliscript and React without adopting a blog framework.

The adapter lives under `tools/org/`; the language compiler does not depend on
Org, Vite, React, Bun, or the example site.

## Article Contract

Every article must define these keywords:

- `#+TITLE`: non-empty display title
- `#+DATE`: a real calendar date in `YYYY-MM-DD` form

These keywords are optional:

- `#+SLUG`: URL identity; defaults to the source filename without `.org`
- `#+DESCRIPTION`: short summary
- `#+FILETAGS`: colon- or comma-separated tags
- `#+DRAFT`: `true`, `yes`, `t`, or `1` marks a draft

Slugs may contain Unicode, but cannot be empty or contain whitespace, `/`,
`?`, or `#`. Duplicate slugs are rejected across the complete content set,
including drafts, so enabling drafts cannot silently change identity.

Published articles are sorted by descending date and then by slug. Tags are
deduplicated and sorted. Drafts are excluded unless the caller explicitly
requests them.

## HTML Export

The adapter exports each Org body through `ox-html` with a body-only template.
It runs in an isolated temporary buffer and does not modify article files.

Headings without an explicit `CUSTOM_ID` receive deterministic IDs in the form
`<slug>-section-<number>`. Existing custom IDs are preserved. These IDs keep
in-page links stable across repeated builds and make article HTML predictable
for applications and tests.

Exported HTML is trusted build output. Applications render it with React's
`dangerouslySetInnerHTML`; untrusted user input must not enter this pipeline
without a separate sanitization boundary.

## ESM Output

`eliscript-org-publish-directory` and `bin/eliscript-org` emit one ESM module:

```sh
./bin/eliscript-org --output dist/articles.mjs content/
```

The module exports the `articles` array as both a named and default export.
Each entry contains `slug`, `title`, `date`, `description`, `tags`, `draft`,
`source`, and `html`. JSON serialization supplies deterministic escaping and
keeps the result directly consumable by JavaScript tooling.

`--include-drafts` changes only filtering. It does not alter parsing,
validation, ordering, or output shape.

## Vite Adapter

`tools/org/vite-plugin.mjs` exports `eliscriptOrg(options)` and the lower-level
`compileOrgDirectory` function. The plugin resolves
`virtual:eliscript-org`, invokes the public Org CLI, and watches every `.org`
file below the configured content directory.

During development, an Org file change invalidates the virtual module and
requests a module update. Vite remains an optional consumer; direct ESM export
requires only Emacs.

## Custom Site

`examples/org-site/` combines the Org adapter, the Eliscript Vite adapter, and
the official React plugin. Its application entry is entirely `.eli` code and
implements article selection, hash navigation, tags, responsive layout, and
trusted HTML rendering. Draft content is absent from the production bundle.

Supported commands:

```sh
bun run org:export
bun run dev:org-site
bun run build:org-site
bun run preview:org-site
```

## Acceptance Evidence

- ERT tests cover metadata extraction, real-date validation, Unicode slugs,
  deterministic ordering, tags, drafts, duplicate slugs, HTML export, and
  stable or explicit heading IDs.
- Bun tests cover deterministic compilation, virtual-module resolution,
  recursive file watching, HMR invalidation, and required configuration.
- The CLI integration test compares repeated exports, imports the generated
  module, verifies draft exclusion and ordering, and builds the site.
- Browser validation covers desktop and 390-pixel layouts, hash navigation,
  article switching, content updates, draft exclusion, and an empty console.

## Deferred Work

Per-article HTML pre-rendering, feeds, sitemaps, syntax highlighting, and asset
dependency tracking may be added as publishing features. They are not required
by the deterministic content-module contract.
