---
id: notes/hello-dogfood
title: Hello, dogfood
date: 2026-09-06
updated: 2026-09-14
description: The first published article of the dogfood proving ground, and what this slice actually runs.
tags: [design, eliscript]
slug: hello-dogfood
pinned: 1
---

This site is the first **executable slice** of the dogfood project. It reads
repository Markdown, builds the canonical post model, and renders static
documents without touching the GitHub API.

## What runs today

The builder and the renderer are two separate Eliscript programs:

1. The builder owns the filesystem, reads `content/posts/`, validates front
   matter, and writes a staging tree.
2. The renderer takes only the canonical model and returns documents. It has no
   filesystem, environment, or network authority.

Output replacement is atomic: the build writes `_site.staging`, and only after
every route exists does it rename that tree into place.

## What has landed since

Issues and Discussions are article sources now, each with owner-only
publication and carrier classification. Comment channels exist in three
shapes: a native snapshot captured during a build, a live channel that no
build ever fetches, and a mount region for an external provider.

What has not landed is packaging. Those gates arrive in the order recorded by
specification 0009. The static article authority rule holds throughout: every
article is complete HTML and stays readable with JavaScript disabled. Search
and the theme control are enhancements, not requirements, and the
<code>&lt;noscript&gt;</code> note on the search page says so.

> A design is only as good as the smallest slice that proves it.

Here is the renderer boundary in Eliscript:

```elisp
(defun render-site (site posts)
  (let* ((sorted (sort-posts posts))
         (tags (collect-tags sorted)))
    ...))
```

Front matter is the only content metadata. Identity is the explicit `id`
field; a file name never defines identity.
