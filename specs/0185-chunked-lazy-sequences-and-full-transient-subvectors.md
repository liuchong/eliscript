# 0185: Chunked Lazy Sequences, Flattened Subvectors, and Transient Builders

- Status: stable
- Implementation: implemented

## Summary

Lazy sequences, vector slices, and batch builders avoid redundant allocations and element-by-element boxing:

1. **32-element chunked lazy sequences (`IChunk`, `IChunkedSeq`, `ArrayChunk`, `ChunkBuffer`, `ChunkedCons`)**: `range`, `repeat`, chunk-aware `lazy-map`, `lazy-filter`, `lazy-take`, `lazy-drop`, `into`, and `reduce` realize up to 32 elements per chunk without changing single-step `realized?`, error timing, or non-chunked `lazy-seq` granularity.
2. **Flattened `SubVector` (`O(1)` slicing)**: Taking `subvec` of an existing `SubVector` flattens bounds directly to `[offset + start, offset + end]` over the underlying root vector, avoiding nested wrapper chains, and implements complete `value-equal?` and `value-hash` parity.
3. **`TransientSet` and full-pipeline transients**: `transient` / `persistent!` support `PersistentHashSet` alongside Vectors and Maps, and `into`, `mapv`, `filterv`, `removev`, `group-by`, `frequencies`, and persistent set operations use owner-isolated transients across the entire pipeline with escape checking.
