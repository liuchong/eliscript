# 0182: Standard Library Domain Layout and Core Barrel Entrypoint

- Status: stable
- Implementation: implemented

## Summary

Eliscript organizes its standard library and managed runtime layers into clean, orthogonal domains without duplicate legacy shims:

1. **Managed runtime separation (`runtime/managed/`)**: Internal managed-memory and VM runtime support modules reside under `runtime/managed/` rather than inside public `stdlib/`.
2. **Domain modules (`stdlib/`)**: Public standard-library modules are organized directly under `stdlib/` by concern (`collection`, `seq`, `transducer`, `transient`, `data`, `set`, `sorted`, `walk`, `zipper`, `diff`, `persistent-*`, `protocol`, `record`, `type`, `multimethod`, `hierarchy`, `order`, `fn`, `identifier`, `meta`, `value`, `string`, `regex`, `math`, `bit`, `numeric`, `data-text`, `pprint`, `json`, `time`, `uuid`, `state`, `tap`, `result`, `schema`, `async`, `test`, `devtools`), with zero-runtime portable subsets isolated in `stdlib/portable/`, wire protocols in `stdlib/wire/`, and host interop in `stdlib/interop/`.
3. **Curated aggregate barrel (`stdlib/core.eli` / `eliscript/core`)**: Re-exports high-frequency core primitives, persistent collection constructors and operations, sequence algorithms, transducers, formatting, schema, and async entrypoints through static re-export bindings compatible with export-level tree-shaking.
4. **Package subpaths (`package.json`)**: Maps `"./core"` to `"./dist/stdlib/core.mjs"` and `"./<domain>"` to `"./dist/stdlib/<domain>.mjs"` while retaining `"./*"` for internal/runtime compatibility.
5. **Dual-host parity**: `editor/eliscript-runtime.el` and `editor/eliscript-data.el` align GNU Emacs runtime behavior with standalone `.eli` module semantics.
