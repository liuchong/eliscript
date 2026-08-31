# 0077: Portable Numeric Foundation

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0003 Implemented Core Language,
  0021 Portable Functions and Dependency Closure,
  0034 Nullish Values

## Summary

This specification defines the first coherent numeric standard-library module
for Eliscript. `stdlib/numeric.eli` builds classification, ordering, bounded
safe-integer arithmetic, integer division, and elementary number-theory
operations entirely from portable Eliscript. It has no imports, raw
JavaScript, `Math` dependency, native container, exception, or mutable runtime
state.

Eliscript numbers are ECMAScript binary64 Number values. The module makes that
host relationship explicit instead of pretending the language has arbitrary
precision integers, exact ratios, decimal arithmetic, or an independent
numeric tower. Source literals remain finite, while runtime arithmetic and
JavaScript interoperation can still produce NaN and positive or negative
infinity; the library classifies those values deterministically.

Operations whose result must be an exact integer are restricted to the safe
integer interval `[-9007199254740991, 9007199254740991]`. They never return a
rounded value that merely looks integral. This is the correctness foundation
for future BigInt and exact-number packages, not a substitute for them.

## Public Surface

The module exports 25 portable functions:

```text
number?          nan?              finite?          infinite?
integer?         safe-integer?     zero?            positive?
negative?        even?             odd?             abs
sign             compare-number    min-number       max-number
clamp            checked-add       checked-subtract checked-multiply
quot             rem               modulo           gcd
lcm
```

Every predicate is total and returns false for a value outside its accepted
domain. A non-predicate operation returns nil when its input type, ordering
domain, divisor, or exact-result bound is invalid. Since no valid operation in
this module produces nil, callers can distinguish failure without host
exceptions. This value-or-nil policy is provisional until the complete M11
standard-library error audit; it must not silently change to coercion or
throwing in the meantime.

## Number Classification

`number?` tests the Number host category and therefore accepts finite values,
NaN, and both infinities. It rejects BigInt, strings, booleans, nil, undefined,
and objects.

The classification predicates are:

- `nan?` is true only when a Number differs from itself
- `finite?` accepts neither NaN nor either infinity
- `infinite?` accepts positive and negative infinity but not NaN
- `integer?` accepts finite Number values with zero remainder modulo one
- `safe-integer?` additionally requires the inclusive safe-integer interval
- `zero?` accepts positive and negative zero
- `positive?` and `negative?` use strict numeric ordering and reject both
  zeros and NaN
- `even?` and `odd?` accept only safe integers, including negative values

Parity deliberately rejects integral Number values outside the safe interval.
Binary64 cannot reliably preserve their least-significant integer bit.

## Scalar Ordering and Bounds

`abs(value)` returns nil for a non-Number, propagates NaN, maps negative
infinity to positive infinity, and normalizes either zero to positive zero.

`sign(value)` returns nil for a non-Number, propagates NaN, returns `-1` or `1`
for ordered nonzero values including infinities, and normalizes either zero to
positive zero.

`compare-number(left, right)` returns `-1`, `0`, or `1` for two ordered Number
values. Positive and negative zero compare as equal. NaN and non-Number inputs
return nil because they do not define a total numeric ordering.

`min-number(first, ...values)` and `max-number(first, ...values)` require at
least one argument and validate every argument as a Number. Any non-Number
causes nil. If every argument is a Number and at least one is NaN, the result
is NaN. Otherwise they return the ordered minimum or maximum and accept
infinities.

`clamp(value, lower, upper)` requires three Number values. A NaN operand is
propagated. An inverted interval where `lower > upper` returns nil. Otherwise
the result is the nearest inclusive bound or the original value.

## Checked Safe-integer Arithmetic

`checked-add`, `checked-subtract`, and `checked-multiply` require two safe
integers. They perform the corresponding Number operation and return the
result only when it is also a safe integer. Invalid operands, overflow beyond
the safe interval, NaN, infinity, BigInt, and fractional values return nil.
Every successful zero result is normalized to positive zero.

These functions provide exactness checks, not machine-word wrapping or
saturation. Portable 32-bit wrapping remains the separate contract in
specification 0052.

## Integer Division

`quot`, `rem`, and `modulo` require two safe integers and a nonzero divisor.
Invalid operands or a zero divisor return nil.

For valid `a` and `b`:

```text
a = quot(a, b) * b + rem(a, b)
abs(rem(a, b)) < abs(b)
```

`quot` truncates toward zero. `rem` has the sign of the dividend when nonzero.
`modulo` has the sign of the divisor when nonzero. Their sign behavior is
therefore:

| Expression | Result |
| --- | ---: |
| `quot(5, 3)` | 1 |
| `quot(-5, 3)` | -1 |
| `rem(-5, 3)` | -2 |
| `modulo(-5, 3)` | 1 |
| `rem(5, -3)` | 2 |
| `modulo(5, -3)` | -1 |

All three operations normalize a zero result to positive zero. This prevents
negative zero from leaking into integer algorithms, serialized values, or
equality-sensitive host probes.

## Greatest Common Divisor and Least Common Multiple

`gcd(left, right)` requires safe integers and applies iterative Euclidean
reduction to their absolute values. It returns a nonnegative safe integer,
defines `gcd(0, 0)` as zero, and is symmetric.

`lcm(left, right)` requires safe integers, returns zero when either operand is
zero, and otherwise computes:

```text
checked-multiply(quot(abs(left), gcd(left, right)), abs(right))
```

Division before multiplication reduces avoidable intermediate growth. The
operation returns nil when the exact least common multiple exceeds the safe
integer interval. For a nonzero pair whose exact product is safe:

```text
gcd(a, b) * lcm(a, b) = abs(a * b)
```

Both algorithms are iterative. Their loop count is logarithmic in operand
magnitude and independent of call-stack depth.

## Portability and Closure Selection

All constants and functions are authored in `numeric.eli`. The module uses
only value inspection, arithmetic, comparisons, conditionals, lexical state,
and bounded loops already defined by the core language. It does not call
`Number.isFinite`, `Number.isSafeInteger`, any `Math` function, or JavaScript
interop.

Seed and self-hosted compilers emit byte-identical ESM and Source Maps. Bun
and Node execute the same report over finite boundaries, NaN, infinities,
negative zero, overflow, signed division, and 50,000 generated safe-integer
pairs.

Portable selection starts from the requested operation and retains only its
transitive helpers. Selecting `gcd`, for example, retains safe-integer
classification, absolute value, and remainder but excludes `lcm`, checked
addition, variadic extrema, and clamping.

This module is provisional during M11. It does not add source syntax, BigInt
arithmetic, exact ratios, decimal values, powers, roots, logarithms,
trigonometry, random generation, statistical aggregation, or protocol-based
numeric extension. Those capabilities require separate contracts and should
not be smuggled into the portable foundation as opaque host calls.

## Acceptance Criteria

- **NML-01:** Classification distinguishes finite, NaN, infinite, integral,
  safe-integral, signed, zero, and parity categories without coercion.
- **NML-02:** Parity and exact integer algorithms reject values outside the
  binary64 safe-integer interval.
- **NML-03:** Absolute value, sign, extrema, clamp, and comparison preserve the
  declared NaN, infinity, invalid-input, interval, and negative-zero behavior.
- **NML-04:** Checked addition, subtraction, and multiplication return exact
  safe results with normalized zero and nil for every operand or result
  boundary violation.
- **NML-05:** All four dividend/divisor sign combinations satisfy the exact
  quotient/remainder identity and the distinct remainder/modulo sign rules.
- **NML-06:** Division by zero, fractional operands, and unsafe integers return
  nil without a host exception.
- **NML-07:** GCD is nonnegative, symmetric, divides both operands, handles
  zero, and terminates iteratively at large safe values.
- **NML-08:** LCM handles signs and zero, satisfies the GCD/LCM product identity
  when representable, and returns nil on safe-integer overflow.
- **NML-09:** Fifty thousand generated safe-integer pairs satisfy division,
  modulo, checked arithmetic, GCD, and LCM invariants under Bun and Node.
- **NML-10:** Seed/self-hosted ESM and Source Maps are byte-identical; portable
  selection prunes unrelated functions; public-surface, compatibility,
  conformance, documentation, build, and complete repository checks include
  the module.
