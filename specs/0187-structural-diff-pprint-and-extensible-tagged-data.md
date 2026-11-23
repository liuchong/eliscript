# 0187: Structural Diff, Pretty Printer, Extensible Tagged Data, UUID, and Time

- Status: stable
- Implementation: implemented

## Summary

Provides canonical structural diagnostics, layout formatting, and extensible persistent scalar types:

1. **Structural diff (`stdlib/diff.eli`)**: `diff` recursively compares persistent Maps, Sets, Vectors, Lists, Queues, and Records to return a 3-element tuple `[only-in-a only-in-b in-both]`.
2. **Pretty printer (`stdlib/pprint.eli`)**: Width-aware Wadler-Lindig layout formatter exporting `pprint`, `pprint-str`, `pp`, and `print-table` with cycle detection and configurable length/depth bounds.
3. **Extensible tagged data (`stdlib/data-text.eli`)**: Supports `*data-readers*`, `with-data-readers`, configurable fallback `defaultReader`, `TaggedLiteral` preservation, and default `#inst`, `#uuid`, `#queue` round-trips.
4. **Immutable `uuid` and `time` (`stdlib/uuid.eli`, `stdlib/time.eli`)**: Provides immutable RFC UUIDv4 and monotonic UUIDv7 values alongside UTC `Instant` and `Duration` values with ISO-8601 parsing, total ordering, arithmetic, value hashing, and canonical tagged serialization.
