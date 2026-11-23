# 0188: Composable Runtime Schema Validation and Seeded Property Generators

- Status: stable
- Implementation: implemented

## Summary

`stdlib/schema.eli` provides declarative runtime validation, coercion, structured error explanation, and property-based test data generation:

1. **Composable schema combinators**: Supports predicate schemas, `and`, `or`, `keys` (required and optional keys), `coll-of`, `map-of`, `tuple`, regex sequence operators (`cat`, `alt`, `*`, `+`, `?`), `nilable`, `enum`, and function specs (`fdef`).
2. **Validation and explanation**: `valid?`, `conform`, `unform`, `explain`, `explain-data`, and `explain-str` report exact key/element paths, failing predicates, and mismatched sub-values.
3. **Deterministic seeded generation and shrinking**: `gen`, `sample`, and `for-all` generate reproducible random inputs from an explicit seed and automatically shrink failing counterexamples to minimal reproducing values.
