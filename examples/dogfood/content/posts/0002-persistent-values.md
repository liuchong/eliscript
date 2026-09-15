---
id: notes/persistent-values
title: Persistent values from the first line
date: 2026-09-09
description: Why the canonical post model is a record, and why collections are persistent rather than mutable.
tags: [eliscript, data]
slug: persistent-values
---

The canonical model is an immutable value. Posts are records, collections are
persistent Vectors and Maps, and no build step mutates a value in place.

## Records for domain values

A canonical post has a fixed field set, so the model declares it once:

```elisp
(defrecord Post
  [id slug title summary body published-at updated-at authors tags cover draft
   pinned-weight provenance aliases comment-channels])
```

Reading a field is direct keyword lookup, and the type has an exact predicate.
Cross-source identity is the `id` field, never a title or a derived path.

## Persistent collections

Lists, vectors, maps, and sets share structure instead of copying. The builder
folds over a vector to accumulate documents, which is ordinary Lisp-style code:

- `Collection/get` reads a key with a fallback,
- `Collection/assoc` returns a new map,
- `Collection/conj` returns a new vector,
- `Order/sort` returns a new vector without mutating its input.

That last property is what makes the build deterministic. Sorting cannot
observe or disturb the module-level constants it consumes.

## Why this matters for a blog

A build is a pure function from normalized input to output. When the input and
the renderer identity are equal, the output bytes are equal too. Determinism is
a property of the value model, not a promise layered on top of it.
