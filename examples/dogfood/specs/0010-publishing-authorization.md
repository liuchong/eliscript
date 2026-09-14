# 0010: Publishing Authorization

- Status: Accepted design
- Implementation: Not started
- Depends on: 0001 Product Contract, 0002 System Architecture, 0003 Content And
  Comment Model, 0004 Eliscript Configuration, 0008 Security And Privacy

## Purpose

dogfood separates the authority to publish an article from the ability to
participate in its conversation. By default, only the configured site owner may
turn an Issue or Discussion into a blog post. Configuration may add named
coauthors. Every other GitHub user is a comment-only participant.

This policy applies to remote article sources. Markdown publication is already
controlled by write access to the checked repository revision and protected
workflow.

## Publisher Set

The effective publisher set contains:

1. exactly one configured owner;
2. zero or more explicitly configured coauthors.

There is no wildcard, source-local grant, implicit collaborator, organization
member, repository owner, `authorAssociation`, label, category, assignee,
reaction, or metadata grant.

Publisher descriptors identify a GitHub user by normalized login and optional
pinned immutable provider id. If an id is pinned, the configured and fetched
identity must agree. Bot, app, deleted, and unresolved identities are denied
article publication. Duplicate normalized identities fail configuration
validation.

The original creator of an Issue or Discussion is the authorization principal.
Later edits, transfers, moderation actions, or reactions do not transfer article
authority. Removing a coauthor removes that principal's remote posts on the
next successful reconciliation unless the trusted configuration changes their
source authority explicitly.

## Authorization Pipeline

The builder applies this order to every remote record:

1. verify repository, record type, and immutable source identity;
2. reject pull requests and unsupported record states;
3. classify explicit or adapter-provisioned comment carriers;
4. apply article label or category selectors;
5. resolve the original author to a GitHub principal;
6. require membership in the effective publisher set;
7. only then parse article metadata and normalize a canonical post.

An unauthorized record is excluded and counted in a redacted diagnostic. It
does not fail the provider, because an untrusted user must not be able to stop
publication by creating an article-shaped record. A trusted explicit projection
to an unauthorized record does fail closed.

Authorization decisions are part of the publishable input fingerprint. Adding
or removing a coauthor therefore causes deterministic reconciliation even when
the remote records themselves did not change.

## Comment-Only Participation

A user outside the publisher set may:

- comment on an existing Issue-backed article;
- comment or reply on an existing Discussion-backed article;
- use an enabled external comment provider;
- participate in a post-specific Issue or Discussion provisioned through that
  provider.

Comment moderation remains with GitHub or the configured provider unless a
separate comment policy narrows participation. The article publisher allowlist
does not filter ordinary comments.

Comments cannot supply article ids, slugs, titles, tags, aliases, publication
dates, article bodies, or source authority. A comment edit can change only its
own normalized comment value.

## Issue And Discussion Comment Carriers

An external system may create a new Issue or Discussion as the conversation
container for one canonical post. A carrier is accepted only when one of these
bindings succeeds:

- trusted configuration names its repository and number explicitly; or
- a configured adapter verifies its own stable mapping, provider identity, and
  canonical post id or canonical URL.

Title or pathname similarity alone is never sufficient. An arbitrary Issue or
Discussion created by a visitor is neither a blog post nor a comment channel
until a configured binding validates it.

Utterances is the initial Issue-backed adapter: the Issue it provisions for a
canonical post is a comment carrier. Giscus is the initial Discussion-backed
adapter and follows the same classification rule. Provider-created carrier
labels are routing metadata, not publication grants.

Carrier classification is terminal for article selection. The same record
cannot also become an article, even when it has the publication label or
category, contains a valid article header, or was created by the owner. Its body
is provider metadata or introductory comment content according to the adapter;
it never overwrites the canonical post.

## Configuration Contract

The reference shape is:

```elisp
:publishing
{:owner {:login "owner"}
 :coauthors
 [{:login "writer-one"}
  {:login "writer-two" :id "U_stable-provider-id"}]}
```

`:coauthors` defaults to an empty vector. The same effective set applies to
every enabled Issue and Discussion article source. The closed-schema validator
rejects duplicate logins, wildcards, non-user principals, and immutable-id
mismatches.

## Event Behavior

The consumer workflow may receive Issue or Discussion events that cannot be
filtered by author before a runner starts. The compiled builder performs a
metadata-only authorization classification first:

- authorized article change: continue to the normal content plan;
- unauthorized article-shaped record: skip render, upload, and deploy;
- comment carrier: follow the configured comment freshness policy;
- ambiguous or forged binding: exclude and emit a bounded diagnostic;
- trusted configuration contradiction: fail closed without replacing output.

These classifications are observable Action decisions and are tested
separately from the comment-event zero-build policy.

## Acceptance Cases

Publication authorization is complete only when deterministic fixtures prove:

1. with no coauthors, only the owner can publish Issue and Discussion posts;
2. each listed coauthor can publish, while an unlisted collaborator cannot;
3. repository association, labels, categories, assignees, and valid article
   metadata cannot bypass the allowlist;
4. case-normalized logins match, while a pinned immutable-id mismatch or a
   non-user principal is denied;
5. removing a coauthor removes that author's remote articles on reconciliation;
6. source-local fields cannot widen the global publisher set;
7. unauthorized users' comments remain visible under the selected comment
   policy;
8. an explicit projection to an unauthorized article source fails closed;
9. an externally provisioned carrier with an article label creates no post;
10. an arbitrary unbound Issue or Discussion creates neither post nor comment
    channel;
11. a carrier created by the owner remains only a carrier;
12. one hundred unauthorized article-shaped events produce zero renders,
    uploads, or deployments.

All cases must pass for both seed-compiled and self-hosted builder artifacts
where the exercised logic is shared.
