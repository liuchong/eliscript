# 0025: Portable Text Standard Library

- Status: Implemented
- Date: 2026-08-28
- Depends on: 0003 Implemented Core Language,
  0021 Portable Functions and Dependency Closure,
  0024 Multi-file Project Builds

## Summary

`stdlib/text.eli` provides reusable string operations written entirely in
Eliscript. It uses only portable control flow, numeric operations, `length`,
`nth`, and `str`; it does not depend on host method calls, regular expressions,
or JavaScript global objects.

```elisp
(import "../../stdlib/text.eli" contains? strip-prefix trim)

(strip-prefix "#" "#article")
(trim "  Eliscript\n")
```

The module is suitable for ordinary ESM imports, Vite source imports, and
closure-only worker builds.

## Indexing Model

Text indices follow ECMAScript string indexing and therefore address UTF-16
code units. This matches generated ESM and source-map column behavior. The
library does not claim grapheme-cluster or locale-aware semantics.

`slice(start, end, text)` uses an end-exclusive interval. A negative start is
treated as zero and an end beyond the text length is treated as the text
length. Any empty or reversed interval returns an empty string.

## Operations

The module exports thirteen `defportable` functions:

- `empty?(text)` tests whether length is zero
- `slice(start, end, text)` reconstructs an end-exclusive interval
- `starts-at?(prefix, offset, text)` matches at a non-negative offset
- `starts-with?(prefix, text)` and `ends-with?(suffix, text)` match boundaries
- `contains?(needle, text)` performs a literal scan; an empty needle matches
- `strip-prefix(prefix, text)` and `strip-suffix(suffix, text)` remove one
  matching boundary and otherwise return the original text
- `whitespace?(character)` recognizes space, tab, line feed, and carriage
  return
- `trim(text)` removes those four whitespace characters from both boundaries
- `blank?(text)` tests whether `trim` is empty
- `join(separator, values)` joins values using Eliscript `str` conversion
- `repeat(count, text)` repeats text for a non-negative integer count; a
  negative count returns an empty string

Search is deliberately a straightforward `O(text-length * needle-length)`
portable implementation. A faster primitive should be considered only after
profiling real workloads and preserving these semantics.

## Dependency Closure

Every declaration uses `defportable`. Selecting `blank?` includes `empty?`,
`slice`, `whitespace?`, and `trim`, while unrelated functions such as `join`
and `repeat` remain absent. The generated worker manifest keeps the source
names containing `?` while ECMAScript identifiers remain safely munged.

## Application Integration

The standard-library CLI example imports both `sequence.eli` and `text.eli`.
The pure Emacs project builder emits a three-module ESM graph with adjacent
source maps and rewrites both source imports.

The Org React site imports `strip-prefix`, `map`, and `find` from Eliscript
source. Hash parsing, article lookup, and list rendering therefore exercise the
portable libraries inside a real Vite production bundle instead of equivalent
host string and array methods.

## Acceptance Evidence

- A Bun test executes boundary cases for all thirteen exports and inspects the
  generated text source map.
- ERT proves closure-only compilation of `blank?` and exclusion of unrelated
  text functions.
- The fixed-point compiler test compares complete seed and self-hosted output
  for `text.eli`.
- The project CLI emits and runs sequence, text, and application modules.
- The Org production source map retains both standard-library source files.

## Next Slice

M6 can proceed to immutable object helpers. The first step should establish the
smallest portable primitives needed for key enumeration and non-mutating
updates, because the current core can read object properties but cannot
discover or copy arbitrary keys without host interop.
