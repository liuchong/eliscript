# 0186: String, Regex, Math, Bit, Volatile State, and Tap Broadcast Libraries

- Status: stable
- Implementation: implemented

## Summary

Completes core utility, numeric, sequence, and lightweight mutable-cell modules across `stdlib/`:

1. **`stdlib/string.eli` & `stdlib/regex.eli`**: Provides `split`, `split-lines`, `replace`, `replace-first`, `escape`, `upper-case`, `lower-case`, `capitalize`, `triml`, `trimr`, `trim-newline`, `reverse`, `index-of`, `last-index-of`, `includes?`, `re-quote-replacement`, and `re-pattern?`.
2. **`stdlib/math.eli` & `stdlib/bit.eli`**: Exports deterministic constants (`PI`, `E`), trigonometric/hyperbolic/exponential/logarithmic/rounding/`floor-div`/`floor-mod`/`IEEE-remainder`/`copy-sign`/`signum`/`ulp`/`scalb` functions, seeded/sampling helpers (`random`, `rand-int`, `rand-nth`, `shuffle`, `random-sample`), and full bitwise primitives (`bit-and-not`, `bit-test`, `bit-set`, `bit-clear`, `bit-flip`, `bit-shift-left`, unsigned shifts).
3. **`stdlib/seq.eli`, `stdlib/data.eli`, `stdlib/state.eli`, `stdlib/tap.eli`**: Adds eager vector combinators (`mapv`, `filterv`, `removev`, `keepv`, `partitionv`, `partitionv-all`, `splitv-at`), `halt-when`, `keywordize-keys`/`stringify-keys`, scalar parsers (`parse-long`, `parse-double`, `parse-boolean`, `parse-uuid`), unsynchronized single-thread `volatile!`/`volatile?`/`vreset!`/`vswap!`/`vswap-vals!`, `bound-fn` dynamic frame capture, and asynchronous bounded `tap>`/`add-tap`/`remove-tap`.
