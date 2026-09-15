# 0006: Site Experience

- Status: Accepted design
- Implementation: In progress
- Depends on: 0001 Product Contract, 0003 Content And Comment Model

## Experience Direction

dogfood is an editorial tool, not a product landing page. The first viewport
shows the publication name, navigation, and actual recent writing. It has no
marketing hero, decorative feature cards, gradient illustration, or instruction
panel.

The visual direction combines:

- near-black and paper-white structural surfaces;
- restrained green for source and success states;
- amber for freshness and degraded-provider states;
- red only for errors or destructive actions;
- a modern sans-serif interface face;
- a readable serif article face;
- monospace metadata for source, revision, and code.

Letter spacing remains zero. Cards are used only for repeated post results or
dialogs, with a maximum 8px radius. Article sections remain unframed.

## Information Architecture

Primary routes are:

- home with recent and pinned posts;
- archive ordered by publication date;
- tags and one route per tag;
- one static route per post;
- search results;
- source and comment provenance details;
- 404 and provider-degraded states.

The header contains the `dogfood` wordmark, archive, tags, search, theme, and
feed actions. On mobile, secondary navigation moves into an accessible menu
without hiding the publication identity.

## Post Presentation

Every post page includes:

- title, summary, date, updated time, authors, and tags;
- source provenance with a link to the Issue, Discussion, or repository file;
- optional cover media that shows article subject matter;
- sanitized article body with code, tables, task lists, quotes, and footnotes;
- previous and next navigation;
- configured comment channels;
- snapshot freshness and a direct provider link when relevant.

Source badges are compact metadata, not competing visual categories. The same
typography and body renderer apply to every source.

## Comment Presentation

One channel is displayed directly. Multiple channels use a segmented control or
clearly labeled sections according to configuration. Each channel shows its
provider, count, freshness, reply capability, and link for posting.

Issue comments remain flat. Discussion replies remain nested with bounded visual
indentation. External providers mount inside one isolated region and cannot
shift the article layout before activation.

Comments are lazy-loaded after the article and never block first content paint.

## Search

The static build emits a compact search index containing canonical id, slug,
title, summary, tags, authors, and plain text. Search runs locally in the browser
and does not require a service. Drafts and private unpublished fields are absent.

## Responsive And Accessible Behavior

- Content remains readable from 320px through wide desktop layouts.
- Article line length is constrained independently of viewport width.
- No control label or long source name overflows its container.
- All icon controls use familiar symbols with accessible names and tooltips.
- Keyboard navigation, visible focus, skip links, reduced motion, landmarks,
  heading hierarchy, and contrast are mandatory.
- Theme selection supports light, dark, and system modes without a flash of the
  wrong theme.
- Comment embeds have explicit height behavior and failure fallbacks.

## Performance Budgets

The acceptance target for a representative article without an activated comment
embed is:

- complete static article HTML in the initial response;
- no GitHub API request on the home page;
- no comment-provider code before comment activation;
- one shared browser enhancement bundle;
- no layout shift from late source or comment metadata;
- images with stable dimensions and responsive sources;
- deterministic asset hashing and immutable caching.

Numeric transfer and browser metric budgets are established from the first
working reference build and then become source-bound acceptance thresholds.

## Degraded States

Provider failure never produces a blank page. Static content remains visible,
with a concise status beside the affected source or comment channel. The site
does not expose stack traces, tokens, API payloads, or internal paths.
