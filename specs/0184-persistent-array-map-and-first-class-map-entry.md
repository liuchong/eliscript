# 0184: Persistent Array Map and First-Class Map Entry Values

- Status: stable
- Implementation: implemented

## Summary

Small persistent maps and map key-value entries share full value semantics without unnecessary trie allocations:

1. **`PersistentArrayMap` (`ARRAY_MAP_THRESHOLD = 8`)**: Stores up to 8 key-value pairs in a compact flat frozen entry slice (`entries`, `count`, `meta`, `hashCache`) with zero HAMT node allocation for `EMPTY_MAP`, map literals `<= 8` entries, `assoc`, `dissoc`, and `TransientArrayMap` mutations.
2. **Automatic promotion**: Associating a 9th distinct key into a `PersistentArrayMap` or `TransientArrayMap` promotes seamlessly to a 32-way HAMT `PersistentHashMap` (or `TransientHashMap`) preserving `-0`, `NaN`, metadata, and value equality.
3. **First-class `MapEntry` (`IMapEntry`)**: Exposes `map-entry`, `map-entry?`, `key`, and `val` (plus Emacs runtime `entry-key` / `entry-val`). `PersistentMapEntry` implements indexed 2-element access (`nth 0`/`1`), vector destructuring, collection protocols, and symmetric `value-equal?` / `value-hash` equivalence with 2-element `PersistentVector`.
