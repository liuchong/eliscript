# 0005: Actions And Comment Coalescing

- Status: Accepted design
- Implementation: In progress
- Depends on: 0002 System Architecture, 0004 Eliscript Configuration

## Problem

A workflow run that sleeps for 30 seconds has already started and consumes
runner capacity. Concurrency can cancel obsolete pending or running work, but it
does not prevent comment events from creating workflow runs.

dogfood therefore separates article publication from comment freshness and
prevents comment events from entering the default build workflow.

## Default Trigger Policy

The default Pages workflow responds to:

- `push` for Markdown, assets, configuration, and dogfood source;
- `issues` types `labeled`, `unlabeled`, `edited`, `closed`, `reopened`, and
  `transferred`;
- `discussion` types `edited`, `labeled`, `unlabeled`, `closed`, `reopened`,
  `answered`, and `unanswered`;
- a bounded `schedule` for reconciliation and optional comment snapshots;
- `workflow_dispatch` for an explicit forced rebuild.

It does not subscribe to `issue_comment` or `discussion_comment`.

### Creation Events Are Opt-In

`issues.opened` and `discussion.created` are excluded from the default
template. Neither can be author-filtered before a runner starts, so subscribing
to them lets any user who can open a record consume runner capacity at will.
Authoring still reaches the site without them:

- a new remote article becomes eligible when a trusted actor applies the
  publication label or category, which emits `labeled` or `edited`;
- a new record that already matches is picked up by the bounded schedule;
- `workflow_dispatch` forces immediate pickup.

A consumer may opt in to creation events. The generated template then states
that every created record starts a runner, and that the skip decisions below
are observable but not free.

### Skip Decisions Are Not Zero Runs

Issue and Discussion events are classified from trusted API records before a
full build. Events for unauthorized article authors or records classified as
comment carriers produce a skipped decision with no render, upload, or deploy.
Every subscribed event has already started a workflow, so these skips are
reported separately from the zero-build guarantee for comment events and they
are counted as runner starts in the quota evidence.

Issue comments may use credential-free browser REST loading for public
repositories. Native Discussion comments use scheduled static snapshots unless
an external app/embed adapter owns live authentication. External providers own
their own freshness.

## Coalescing Layers

### Layer 1: Trigger Elimination

Comment creation, edit, deletion, reaction, and reply events start zero default
build runs. This is the primary quota control.

### Layer 2: Bounded Reconciliation

When snapshots are enabled, one scheduled run collects every comment change
since the last published fingerprint. The default template uses a six-hour
cadence at a non-zero minute. Users may change the cadence with an explicit
workflow edit.

The shortest supported schedule may be constrained by the host platform and is
not promised as real-time delivery.

### Layer 3: Publishable Fingerprint

The scan phase computes a canonical SHA-256 over:

- normalized article records;
- enabled static comment snapshots;
- publishable site configuration;
- theme and renderer identity;
- public asset digests.

API ordering, request ids, fetch timestamps, rate-limit counters, and transient
headers do not affect the fingerprint.

An unchanged fingerprint produces `built=false`, `reason=no-change`, and no
render, artifact upload, or Pages deployment.

### Layer 4: Immutable Published Marker

The consumer workflow records a small cache marker keyed by the exact published
fingerprint. Cache absence may cause a redundant build but can never suppress a
changed build. The generated site manifest provides an independently inspectable
published fingerprint.

### Layer 5: Concurrency

All build and deploy runs use one repository-and-site concurrency group. A newer
content run may cancel an obsolete build before deployment. Deployment itself
must not be interrupted after it enters the protected Pages environment.

Concurrency is queue protection, not the debounce mechanism.

## Optional Event Mode

Users may explicitly enable comment event workflows. This mode:

- starts a lightweight scan for each event;
- rejects pull-request Issue comments;
- checks provider eligibility before fetching content;
- computes the publishable fingerprint before rendering;
- cancels obsolete scans through concurrency;
- enforces a configured minimum successful-deployment interval;
- emits an Actions quota warning in its generated documentation.

Event mode cannot guarantee zero Action usage per comment and is never described
as free debounce.

## Build State Machine

```text
trigger
  -> classify
  -> acquire source metadata
  -> compute normalized fingerprint
  -> already published? -> skip
  -> inside minimum interval? -> defer to scheduled reconciliation
  -> fetch required bodies and snapshots
  -> build and validate
  -> upload
  -> deploy
  -> record published fingerprint
```

The minimum interval applies only to automatic comment-driven updates. Markdown
pushes, article edits, and manual force runs remain eligible for immediate build.

## Quota Acceptance

The comment policy must pass deterministic simulations:

1. One hundred comment events in runtime mode produce zero build requests.
2. One hundred comment changes between two scheduled snapshots produce at most
   one changed artifact and one deployment.
3. An unchanged scheduled scan produces no artifact upload or deployment.
4. Ten article events superseded before deployment produce one final published
   source fingerprint.
5. A manual force run builds even when the content fingerprint is unchanged and
   records `reason=forced`.
6. One hundred Issue or Discussion article-shaped records from unauthorized
   authors produce zero renders, uploads, or deployments, and the evidence
   reports the runner starts they did consume.
7. A comment-provider-created Issue with an article label remains a comment
   carrier and produces zero article routes.
8. One hundred `issue_comment` or `discussion_comment` events produce zero
   workflow runs in the default template.
9. One hundred creation events of the excluded types produce zero workflow runs
   in the default template.

Tests count event receipt, runner start, scan, render, upload, and deploy
separately.

## Freshness Contract

The UI exposes snapshot freshness when static comments are shown. Hybrid mode
renders the snapshot immediately and replaces it only after a successful live
load. A failed live request keeps the snapshot and displays a non-blocking
provider status.

No freshness promise may be stronger than the selected policy.

## External Host Contracts

- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency
- https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api

The implementation rechecks event, schedule, concurrency, and rate-limit
behavior before generating consumer workflows.
