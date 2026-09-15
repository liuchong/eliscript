# 0001: Product Contract

- Status: Accepted design
- Implementation: In progress
- Scope: `examples/dogfood/`

## Product

dogfood is a content-first static blog that uses GitHub as an optional authoring
and discussion system. Any non-empty subset of three article sources must work
without requiring the others:

1. Repository Markdown files.
2. GitHub Issues selected by repository and label.
3. GitHub Discussions selected by repository and category.

Comment channels are independent of article sources, and none of them is
required:

1. Issue comments attached to Issue posts or explicitly bound Markdown posts.
2. Discussion comments and replies attached to Discussion posts or explicitly
   bound Markdown posts.
3. External comment providers attached globally or per post.

Any non-empty subset of the three article sources is valid. Native comments,
external comments, both, or no comments are valid when their required bindings
are satisfied.

Issue and Discussion articles are owner-only by default. Configuration may add
an explicit list of coauthors. GitHub users outside that effective publisher
set can participate through comments on an existing article channel or through
a configured external provider that provisions a post-specific Issue or
Discussion as a comment carrier. Such carriers are comments infrastructure and
never article candidates.

## Two Programs

dogfood is implemented by two executable Eliscript programs:

- the renderer converts a normalized blog model into static documents and an
  optional browser interface;
- the builder runs in GitHub Actions, converts configured sources into that
  normalized model, and invokes the renderer.

Both are compiled to JavaScript for execution. The builder owns source I/O and
GitHub API access. The renderer owns presentation and has no source-provider
authority.

## Audience

The primary audience is a technical author who wants Git-native archives,
GitHub-native conversations, a modern static site, and complete control over the
theme and rendering source. The product is intentionally not a hosted blogging
service or a generic CMS.

## Non-Goals

- Defining new Eliscript syntax or runtime behavior.
- Adding React, GitHub, Markdown, or Pages dependencies to Eliscript core.
- Providing a browser OAuth service or exposing a repository token.
- Treating title similarity as content identity.
- Mirroring private comments into a public artifact without explicit policy.
- Running one complete Pages build for every comment event.
- Treating repository membership, collaborator association, labels, categories,
  or article-shaped metadata as publication authority.
- Treating an arbitrary new Issue or Discussion as a comment without an
  explicit post binding or configured external-provider binding.
- Owning Pages deployment inside the build Action.
- Claiming Marketplace publication while the canonical repository is private.

## Publishing Modes

### Static

All selected article sources and configured comment snapshots are fetched at
build time. The output contains complete article HTML and requires no GitHub API
request for reading.

### Live

The build still emits a static article fallback. Public Issue or Discussion
content and comments may be refreshed only when the provider supports
credential-free access or an external app owns authentication. Posting is
performed on GitHub or through the external provider.

### Hybrid

Article bodies are pre-rendered. GitHub-native or external comments load on
demand. Scheduled reconciliation periodically refreshes optional static comment
snapshots. This is the default production mode.

## Source Combinations

The implementation must verify all seven non-empty article-source subsets:

| Markdown | Issues | Discussions | Valid |
| --- | --- | --- | --- |
| on | off | off | yes |
| off | on | off | yes |
| off | off | on | yes |
| on | on | off | yes |
| on | off | on | yes |
| off | on | on | yes |
| on | on | on | yes |

Disabling all sources is a configuration error. An enabled source that returns
zero posts is valid and produces an empty-state site.

## Product Invariants

- Every published post has one canonical id, one canonical URL, and recorded
  source provenance.
- Every generated URL is stable across source ordering and API pagination.
- Every article is readable without client JavaScript.
- A live enhancement failure leaves the static article intact.
- Comment provider failure does not make article content unavailable.
- Configuration errors fail before output replacement.
- Remote article publication requires the original record author to be in the
  effective publisher set at build time.
- Users outside the publisher set can contribute comments but cannot create or
  replace canonical article content.
- Comment carriers are classified before article filters and never enter the
  canonical post collection.
- Build output is deterministic for identical normalized inputs.
- Generated files never contain a GitHub token or private API response outside
  the explicitly publishable fields.

## Naming

The project, directory, default Action display name, package basename, generated
manifest namespace, and CSS root namespace use `dogfood`. Marketplace name
availability is checked only when publication is explicitly authorized.
