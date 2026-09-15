# 0004: Eliscript Configuration

- Status: Accepted design
- Implementation: Not started
- Depends on: 0001 Product Contract, 0003 Content And Comment Model

## Configuration Source

The canonical configuration file is `dogfood.config.eli`. It is an Eliscript
module exporting one immutable `config` value. There is no handwritten
`site.config.js`.

### Trust Model

`dogfood.config.eli` is checked repository source. It is trusted exactly as far
as the consumer workflow that runs it: anyone who can change the configuration
can already change the workflow and the build source. The configuration
boundary is therefore a schema and reproducibility boundary, not a security
sandbox.

The builder reads the configuration with the packaged closed-data reader. It
never compiles, evaluates, or imports the module, so no capability sandbox and
no code execution are involved at all. The reader accepts only the literal
subset — maps, vectors, strings, numbers, keywords, `t`, `false`, `nil`, and the
module, defconst, and export wrapper — and rejects every other form with a
located failure.

Two rules define the boundary:

1. The configuration module is a closed data module. Its dependency graph is
   empty: it declares constants and exports `config`, and it imports no module,
   local or external.
2. The value bound to `config` is validated against the closed schema below
   before any source is fetched. Any symbol, list, set, queue, function, or
   interop form inside the value is a validation error.

A module that violates either rule fails the build before any network request.
Untrusted input never enters configuration: event payloads, repository
content, provider responses, secrets, and Action inputs cannot contribute
configuration values or executable forms.

## Top-Level Shape

```elisp
(module dogfood.config
  (defconst config
    {:schema-version 1
     :site
     {:title "dogfood"
      :base-url "https://owner.github.io/repository/"
      :language "zh-CN"
      :theme :system}
     :publishing
     {:owner {:login "owner"}
      :coauthors []}
     :sources
     [{:id :local :kind :markdown :enabled t :directory "content/posts"}
      {:id :notes :kind :issues :enabled t
       :repository "owner/repository" :label "blog"}
      {:id :topics :kind :discussions :enabled t
       :repository "owner/repository" :category "Blog"}]
     :identity {:conflict :fail :projections []}
     :comments
     {:presentation :tabs
      :channels
      [{:id :issue-native :kind :issue :enabled t :mode :live}
       {:id :discussion-native :kind :discussion :enabled t :mode :snapshot}
       {:id :utterances :kind :utterances :enabled false :mode :embed}
       {:id :giscus :kind :giscus :enabled false :mode :embed}]}
     :refresh
     {:articles :event
      :comments :runtime
      :snapshot-schedule "37 */6 * * *"
      :no-change :skip}
     :output {:directory "_site"}})
  (export config))
```

This snippet defines the target data shape. The implementation gate must compile
the checked reference configuration before claiming configuration support.

## Source Configuration

Every source has `id`, `kind`, and `enabled`.

Markdown sources configure repository-relative directories, include/exclude
patterns, front-matter defaults, asset roots, and required metadata.

Issue sources configure repository, publication labels, state policy, API page
size, and content failure policy. Author association may be retained as
descriptive metadata or a non-authorizing filter.

Discussion sources configure repository, categories, answer-state policy,
API page size, and content failure policy. Author association may be retained as
descriptive metadata or a non-authorizing filter.

Multiple providers of the same kind are allowed. Provider ids must be unique.

## Identity Configuration

`identity.conflict` is `fail`. `identity.projections` lists declarations that
resolve one canonical id collected from several sources:

```elisp
{:identity
 {:conflict :fail
  :projections
  [{:id "notes/compiler-host"
    :authority :markdown
    :projections
    [{:source :issue :repository "owner/repository" :number 42}]}]}}
```

A declaration names the authority by source kind and names each projected
record by the provider and by the provenance path that provider already
records. A declaration that names an authority no collected record carries, or
a record that was not collected, fails instead of resolving quietly.

The authority supplies the article. A projection contributes its comment
channels and its aliases, and the fields it declares. `fields` may be given
once for the declaration or on one projected record, and a declared field may
differ from the authority.

`slug` and `body` belong to the authority alone. A differing projected slug is
a route disagreement, so it must appear in that record's `aliases` or be
declared; anything else fails and reports both provenances.

## Publishing Authorization

`publishing.owner` is required whenever an Issue or Discussion article source
is enabled. The effective publisher set is exactly the owner plus the entries
in `publishing.coauthors`. The default coauthor list is empty, so only the owner
may publish remote articles.

Each publisher descriptor has a required GitHub user `login` and may pin the
account's immutable provider id. Logins are compared with GitHub's
case-insensitive normalization. When an immutable id is configured, both login
and id must match the API author record. Bot, app, deleted, and unresolved
identities are denied article publication.

Wildcards, source-local grants, repository associations, organization
membership, collaborator status, labels, categories, reactions, and content
metadata cannot expand the publisher set. Removing a coauthor excludes that
author's remote articles on the next successful reconciliation; there is no
implicit grandfathering.

Markdown files are authorized by the checked repository revision and workflow
trust boundary. Front-matter `authors` are display attribution only and do not
grant GitHub publication authority.

## Comment Configuration

Comment channels are independent of article sources. Each channel declares:

- adapter kind and stable id;
- enabled state;
- static, live, hybrid, or embed mode;
- global default binding strategy;
- per-post binding overrides;
- lazy-loading and cache policy;
- display order and presentation;
- failure and privacy policy.

Native comments may derive a binding from the article provenance only when the
article itself came from that provider. Markdown and cross-provider bindings
must be explicit.

External providers implement the declared adapter protocol in
[0011](0011-comment-adapters.md). Initial delivery targets Utterances for
Issue-backed comments, Giscus for Discussion-backed comments, and a generic
script/embed adapter. Additional systems do not require a core or renderer
rewrite.

## Article Refresh Policy

`articles` accepts:

- `:push` for repository content only;
- `:event` for eligible Issue and Discussion content events;
- `:scheduled` for bounded polling;
- `:manual` for workflow dispatch only;
- `:hybrid` for push/events plus scheduled reconciliation.

Article refresh and comment refresh are separate settings.

## Comment Refresh Policy

`comments` accepts:

- `:runtime`: no comment build trigger; load credential-free public comments
  in the browser;
- `:external`: external provider owns freshness; no comment build trigger;
- `:scheduled`: snapshot comments only on the workflow schedule;
- `:manual`: snapshot comments only on explicit dispatch;
- `:hybrid`: serve the snapshot, then refresh public comments in the browser;
- `:event`: opt-in per-comment workflow triggering with a budget warning.

`:runtime` or `:external` is the default. A Discussion channel that needs
live authenticated GraphQL uses an external app/embed adapter rather than a
browser token. `:event` is never generated by the default workflow template.

## Configuration Validation

Validation is closed-schema and fail-fast:

- unknown keys fail;
- all paths must be repository-relative and contained;
- at least one article source must be enabled;
- provider ids, post ids, channel ids, and slugs must be unique;
- publisher logins must be unique after case normalization;
- pinned publisher login and id must match a fetched GitHub user account;
- live GitHub access to private repositories fails configuration validation;
- comment bindings must match adapter requirements;
- snapshot schedules must be represented in the consumer workflow;
- base URLs must be absolute HTTPS URLs for production;
- external scripts require an allowlisted origin and integrity policy;
- a public output containing private source data requires explicit publication
  policy acknowledgement.

## Layered Overrides

Configuration may be overridden by a second checked Eliscript data file for
preview or deployment environment values. Environment variables may select
files and Action paths, but cannot inject executable forms or arbitrary nested
configuration.

Precedence is:

1. canonical configuration;
2. checked environment override;
3. Action input for config path, output path, force, and preview only.

Secrets are Action inputs or environment values consumed by host adapters and
never become configuration values visible to the renderer.

## Canonicalization

Before fetching data, configuration is normalized into a sorted, immutable
plan. The plan has a SHA-256 digest recorded in the build manifest. Equivalent
configuration values produce the same digest regardless of map insertion order.
