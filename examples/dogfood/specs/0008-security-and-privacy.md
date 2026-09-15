# 0008: Security And Privacy

- Status: Accepted design
- Implementation: Not started
- Depends on: 0002 System Architecture, 0003 Content And Comment Model

## Trust Zones

dogfood separates:

1. checked application and configuration source;
2. repository Markdown content;
3. remote Issue, Discussion, and comment content;
4. build-time credentials and API responses;
5. generated public site output;
6. browser-loaded public data and external embeds.

Crossing a zone requires explicit validation and projection. Raw GitHub payloads
and configuration evaluation objects are never renderer inputs.

## Credentials

- Use the shortest-lived repository-scoped token available.
- Request read permissions only for enabled sources.
- Never place a token in a URL, command argument, generated module, source map,
  cache key, Action output, annotation, or diagnostic.
- Redact authorization headers and secret-shaped values before logging.
- Browser bundles contain no token path or credential fallback.
- A private repository source can use static snapshots only unless an external
  authenticated service is explicitly configured.

## Untrusted Content

Markdown and GitHub bodies are parsed as untrusted input. Raw HTML is disabled
by default. When enabled, a strict allowlist removes scripts, event attributes,
unsafe URLs, active embeds, style injection, and DOM-clobbering names.

The sanitizer runs after Markdown rendering and before route generation. The
same sanitizer policy applies to article bodies and static comment snapshots.

Code highlighting must escape source text before markup insertion.

### Markdown And Sanitization Boundary

Markdown rendering and sanitization run in the builder, before the normalized
model crosses to the renderer. The renderer receives sanitized bodies and never
parses untrusted Markdown itself, so one boundary owns the policy and the
renderer keeps no sanitizer dependency.

Rendering and sanitization are reached through explicit Eliscript imports of
pinned application packages, and they are bundled into the Action. They are
never a hand-written JavaScript glue file, and no unpublished fork is patched
into the project. Because the builder runs on Node without a DOM, a sanitizer
that requires one is paired with a pinned DOM implementation in the same
declared dependency set; a DOM-free sanitizer is preferred.

One module declares the allowlist, URL scheme policy, and raw-HTML switch. Both
article bodies and comment snapshots pass through that one declaration. A
second sanitizer path would be a configuration error rather than a fallback.

## External Comment Providers

Each external adapter declares:

- script and frame origins;
- required public configuration fields;
- whether cookies or cross-site storage are used;
- content-security-policy additions;
- lazy-load behavior;
- failure fallback;
- an integrity, version pinning, or origin allowlist policy. A provider that
  publishes no subresource integrity metadata must be pinned by version and
  origin instead.

Unknown script URLs fail configuration validation. An adapter cannot receive
the article body or build token unless its protocol explicitly requires and
permits the field.

## GitHub Workflow Security

- Never build untrusted pull-request content with a privileged token.
- `pull_request_target` is forbidden for publication builds.
- Third-party Actions in generated templates are pinned to full commit digests.
- Workflow permissions are explicit and minimal.
- Pages deployment is isolated in the `github-pages` environment.
- Repository writes, Issue creation, and Discussion creation are excluded from
  the default build Action.
- Event payload fields are untrusted and never interpolated into shell source.

## Publication Authorization

Remote article authorization is deny-by-default. The original Issue or
Discussion author must match the configured owner or one explicit coauthor.
`authorAssociation`, repository permissions, organization membership, labels,
categories, reactions, assignees, and article metadata are never authorization
evidence.

Unauthorized article candidates are excluded with a bounded, redacted
diagnostic instead of failing the build, so untrusted users cannot deny service
by creating article-shaped records. A trusted configuration projection that
points to an unauthorized article source fails closed because it contradicts
the publication policy.

Comment authorization is independent. By default, GitHub or the configured
external provider decides who may comment and moderate. Commenters do not enter
the publisher set, and no comment body, carrier body, provider mapping, or
external script may mutate canonical article fields.

Externally provisioned Issue or Discussion carriers require a configured
adapter binding to an existing canonical post. Carrier classification takes
precedence over article selection, preventing a carrier from becoming a post
through a publication label, category, or authorized creator.

## Privacy Policies

The configuration must declare whether GitHub source repositories are public and
whether comment snapshots may be published. A build fails when private input
would cross into public output without explicit acknowledgement.

Deleted comments and posts disappear on the next successful reconciliation.
Prior immutable deployments may still exist in host retention; documentation
must not promise erasure beyond the generated current site.

## Abuse And Resource Bounds

Providers enforce limits for:

- page count and total records;
- maximum article and comment bytes;
- nesting depth;
- rendered HTML size;
- image and attachment schemes;
- request retries and backoff;
- total build duration and memory;
- search-index size.

Exceeding a required-source limit fails closed with source provenance.

## Security Acceptance

Tests include script injection, malformed Markdown, unsafe links, HTML
clobbering, oversized bodies, pagination loops, forged cursors, private-data
projection, token-like output, hostile Action inputs, and external provider
origin changes. Authorization tests cover owner-only defaults, coauthor
allowlists, case normalization, immutable-id mismatch, bot/app identity,
deleted identities, association bypass attempts, unauthorized projections, and
carrier/article confusion.

The final site tree and Action bundle receive a secret scan and absolute-path
scan before publication.
