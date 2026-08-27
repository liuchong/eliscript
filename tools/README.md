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
