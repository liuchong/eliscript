---
id: notes/comment-channels
title: Comments are channels, not one lossy list
date: 2026-09-12
description: The comment model this site will adopt once the Issues and Discussions providers land.
tags: [design, comments]
slug: comment-channels
aliases: [one-lossy-list]
---

A post owns zero or more ordered comment channels. Each channel keeps its own
provider, topology, and freshness, because flattening them loses information
that readers and moderators both rely on.

## Topology is preserved

- Issue comments form a flat ordered stream.
- Discussion comments preserve replies as a tree.
- External providers own their own native structure.

The interface may present channels as tabs or as adjacent sections. The model
never fabricates a reply graph by merging two providers.

## Freshness is explicit

A channel declares `snapshot`, `live`, `hybrid`, or `embed` mode. The page
shows when a snapshot was captured, and a failed live request keeps the
snapshot and reports a non-blocking provider status.

## Carriers are classified first

An Issue or Discussion provisioned by a widget is a comment carrier. Carrier
classification runs before article selection, so a provider-created record
cannot become an article through a publication label, and its body can never
override canonical fields.
