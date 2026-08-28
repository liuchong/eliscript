# Tools

Optional integrations belong here. Initial candidates are a Vite adapter, an
Org publishing adapter, and developer commands for inspecting compiler phases.
Nothing in this directory should be required by the compiler core.

`vite/` contains the implemented `.eli` transform adapter. It invokes the
public compiler, returns JavaScript and Source Map v3 data to Vite, and composes
with the official React plugin for Fast Refresh.

`org/` contains the pure Emacs Org-to-ESM publisher and its Vite virtual-module
adapter. Org remains the content source; generated modules are build artifacts.

`worker/` contains the resilient Emacs client for the long-lived JavaScript
compute worker, an end-to-end benchmark, and a representative document indexing
adapter. It keeps editor state in Emacs while moving explicit JSON-compatible
computations across a measured process boundary.

`collections/` contains the versioned HAMT node-layout benchmark. It executes
equivalent bitmap-indexed and dense roots through the real runtime paths under
Bun, Node, and headless Chrome, owns bounded browser/server cleanup, and emits
source-digested reports used to review internal representation thresholds.

`conformance/` contains the dependency-free specification and evidence checker.
It verifies `specs/index.json`, the numbered specification headers, and
`tests/conformance/manifest.json` before the default test suite runs.
