# 0003: Content And Comment Model

- Status: Accepted design
- Implementation: Not started
- Depends on: 0001 Product Contract, 0002 System Architecture

## Canonical Post

Every provider produces the same immutable application value:

| Field | Meaning |
| --- | --- |
| `id` | Explicit global identity, such as `notes/compiler-host` |
| `slug` | Canonical route segment |
| `title` | Display title |
| `summary` | Plain-text or sanitized summary |
| `body` | Sanitized rendered body |
| `source-body` | Optional source Markdown retained only during build |
| `published-at` | Original publication instant |
| `updated-at` | Last content update instant |
| `authors` | Stable author records |
| `tags` | Normalized ordered tag set |
| `cover` | Optional validated asset reference |
| `draft` | Publication state |
| `pinned-weight` | Explicit ordering weight |
| `provenance` | Provider, repository, number/path, URL, revision |
| `comment-channels` | Ordered channel descriptors |
| `aliases` | Previous canonical URLs |

Provider-specific records may retain additional namespaced metadata, but theme
components cannot branch on raw GitHub payloads.

## Provider Mapping

### Markdown

Markdown files use YAML front matter only as content metadata. Required fields
are `id`, `title`, and `date`. Optional fields include `slug`, `updated`,
`description`, `tags`, `cover`, `draft`, `pinned`, `aliases`, and
`comments`.

The configured repository-relative path is provenance. The source commit is the
revision. File names do not define identity.

### Issues

An Issue is eligible when it belongs to the configured repository, carries the
configured publication label, is not a pull request, and satisfies the author
or association policy. The Issue number is provenance, not the cross-source id.

Metadata is read from a fenced `dogfood` header or a machine marker at the top
of the Issue body. Required canonical metadata is validated before the remaining
body is rendered. Labels may project to tags only through configuration.

### Discussions

A Discussion is eligible when it belongs to the configured repository, matches
an allowed category, and satisfies the author or association policy. The
Discussion number and category are provenance.

Metadata uses the same body header as Issues. Answer state, reactions, and
category data remain namespaced provider metadata and cannot silently change
canonical ordering.

## Identity And Conflict Resolution

Identity resolution uses `id`, never title or generated slug.

The default conflict policy is `fail`. Two independent records with the same
id stop the build and report both provenances.

An explicit projection can declare that several sources describe one post:

```elisp
{:id "notes/compiler-host"
 :authority :markdown
 :projections
 [{:source :issue :repository "owner/repository" :number 42}
  {:source :discussion :repository "owner/repository" :number 17}]}
```

The authority supplies article fields. Projections may supply comment channels,
aliases, or declared metadata fields. Undeclared field disagreement fails.

Source order controls display tie-breaking only. It is not a deduplication rule.

## Slugs And Routes

Slugs are normalized once and validated for path safety. Duplicate slugs fail
even when canonical ids differ. A changed slug requires the prior slug in
`aliases`; the generator emits redirect pages without client-side dependence.

Canonical routes use `posts/<slug>/`. Provider URLs remain visible source links
and never replace the canonical route.

## Canonical Comment Channel

A post owns zero or more ordered channels:

| Field | Meaning |
| --- | --- |
| `id` | Stable channel identity within the post |
| `kind` | `issue`, `discussion`, or external adapter id |
| `mode` | `snapshot`, `live`, `hybrid`, or `embed` |
| `binding` | Repository and number, term, mapping, or provider key |
| `count` | Optional snapshot count |
| `updated-at` | Optional snapshot freshness |
| `items` | Optional normalized snapshot |
| `capabilities` | Read, reply, nested replies, reactions, moderation |

Issue comments form a flat ordered stream. Discussion comments preserve replies
as a tree. External providers own their native topology. The UI may present
channels as tabs or sections, but the model never merges them into a fabricated
reply graph.

## Markdown Comment Binding

A Markdown post may bind to:

- one or more existing Issues;
- one or more existing Discussions;
- one or more external provider mappings;
- no comment channel.

Creation of an Issue or Discussion is an explicit provisioning command, never a
side effect of a read-only site build.

## Ordering

Default post ordering is:

1. descending `pinned-weight`;
2. descending `published-at`;
3. ascending canonical `id`.

Comments retain provider ordering. Cross-channel display order follows
configuration.

## Deletion And Drafts

A deleted, closed, locked, converted, or transferred GitHub record follows an
explicit source policy. No state implies another. Closing an Issue does not
unpublish it unless configured.

Draft records are excluded from production output, feeds, search data, and
sitemaps. Preview builds may include them under non-canonical, no-index routes.

## Pagination And Reconciliation

Providers must traverse every page until the API cursor is exhausted. A build
records total records, page count, and terminal cursor digest. Partial pagination
is a failed provider result.

Reconciliation detects edits, deletions, label/category changes, and comment
count changes by normalized content fingerprint rather than API response order.
