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

## Deliberate omissions

This slice has no Issues provider, no Discussions provider, no comment
channels, and no packaging. Those gates arrive in the order recorded by
specification 0009. The static article authority rule already holds: every
article is complete HTML and stays readable with JavaScript disabled.

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
