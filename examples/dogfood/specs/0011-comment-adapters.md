# 0011: Comment Adapters

- Status: Accepted design
- Implementation: In progress
- Depends on: 0001 Product Contract, 0003 Content And Comment Model,
  0004 Eliscript Configuration, 0008 Security And Privacy,
  0010 Publishing Authorization

## Purpose

Comment channels come from native GitHub records and from external providers.
Specification 0003 defines the canonical channel value. Specification 0010
defines why a record used as a comment carrier is never an article. This
specification defines the single adapter protocol both paths implement, so a
new provider does not require a builder, renderer, or core rewrite.

## Adapter Descriptor

Every adapter is a checked declaration in `dogfood.config.eli`. It declares:

| Field | Meaning |
| --- | --- |
| `id` | Stable channel kind used in the canonical model |
| `carrier-kind` | `issue`, `discussion`, `external`, or `none` |
| `mode` | `snapshot`, `live`, `hybrid`, or `embed` |
| `binding` | The binding evidence the adapter verifies |
| `origins` | Allowed script and frame origins |
| `capabilities` | Read, reply, nested replies, reactions, moderation |

An adapter with `carrier-kind` `none` or `external` mounts only in the browser
and holds no builder-side record. An adapter with `carrier-kind` `issue` or
`discussion` adopts or provisions one native record per post.

Adapter ids are unique. An adapter that declares a native carrier kind must
declare how that carrier is identified, and an adapter that declares an unknown
carrier kind fails configuration validation.

## Binding Verification

A carrier is bound to a canonical post only when the adapter verifies all of:

1. **Provider principal.** The record author or acting app is the principal the
   adapter declares.
2. **Carrier kind.** The record type equals the declared `carrier-kind`.
3. **Explicit post identity.** The record carries the canonical post id or the
   canonical URL, and that value equals a post in the current build.

Title similarity, pathname similarity, labels, categories, and arbitrary body
text never bind on their own. Where a provider's only durable signal is a body
marker — for example an issue body containing the canonical page URL — that
marker is admissible only together with the provider principal from rule 1, and
it is extracted by the adapter's declared rule rather than by unanchored
substring matching.

This is the resolution of the apparent conflict with specification 0003: a body
marker alone is never sufficient, and it is never the whole binding. Utterances
is the Issue-backed adapter and Giscus is the Discussion-backed adapter; both
follow this rule.

## Discovery And Persistence

The builder does not rely on remembering a mapping across builds:

- a carrier adopted through trusted configuration uses the configured
  repository and number, or a configured adapter key;
- a carrier provisioned lazily by a browser widget is rediscovered on the next
  metadata scan, because the adapter declares which principal and which marker
  identify it.

Carrier classification runs before article filters on every build. Because
discovery is derived from the record itself, a lost cache cannot orphan a
carrier, and a lost mapping cannot promote a carrier into an article.

## Native Channels

`issue` and `discussion` channels reuse the normalized comment topology of
specification 0003. Issue comments remain flat and Discussion replies remain
nested. The adapter contributes binding and capability data only; it never
flattens one provider's topology into another's.

## Failure And Degraded Behavior

An adapter failure follows the provider failure policy of specification 0002.
The article stays readable, and the affected channel reports a non-blocking
status. An adapter cannot receive the article body, a build token, or any
credential unless its declared protocol explicitly requires and permits that
field.

## Acceptance Cases

Comment adapters are complete only when deterministic fixtures prove:

1. An Utterances-provisioned Issue is classified as a carrier on the next build
   even though the builder never created it.
2. A carrier whose body marker is removed stops being bound and is neither an
   article nor a comment channel.
3. A record whose marker matches but whose author is not the provider principal
   is not bound.
4. A record whose author is the provider principal but whose marker does not
   equal a post in the build is not bound.
5. A configured adapter with an unknown `carrier-kind` fails configuration
   validation.
6. An adapter with `carrier-kind` `none` or `external` creates no
   builder-side record and no article route.
7. Removing an adapter declaration removes only its channel and leaves article
   routes unchanged.
