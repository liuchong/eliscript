# 0183: Native Callee-Saved Register Allocation and Local Frame Optimization

- Status: stable
- Implementation: implemented

## Summary

The AAPCS64 native memory backend (`bootstrap/backends/native.eli`) optimizes hot local variable access via frequency-weighted register allocation:

1. **`allocate-memory-registers`**: Counts loop-weighted integer and Val64 local references per function and pins the hottest locals into up to nine callee-saved registers (`x20–x28` / `w20–w28`), spilling only excess cold locals to frame-pointer relative stack slots.
2. **Prologue and epilogue preservation**: Functions using callee-saved registers save and restore the allocated `x20–x28` subset around the frame body and retain zero-growth branch relaxation and direct operand comparison encodings.
3. **WASM equivalence**: Every native program using allocated registers produces byte-identical results and error semantics to the reference WASM backend and passes seed fixed-point verification.
