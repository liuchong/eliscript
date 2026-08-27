# Tools

Optional integrations belong here. Initial candidates are a Vite adapter, an
Org publishing adapter, and developer commands for inspecting compiler phases.
Nothing in this directory should be required by the compiler core.

`vite/` contains the implemented `.eli` transform adapter. It invokes the
public compiler, returns JavaScript and Source Map v3 data to Vite, and composes
with the official React plugin for Fast Refresh.
