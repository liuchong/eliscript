# Tools

[Project README](../README.md) | [Specifications](../specs/README.md) |
[Tests](../tests/README.md)

Optional integrations and development checks belong here. Nothing in this
directory is required by the compiler core.

| Path | Responsibility |
| --- | --- |
| [`vite/`](vite/README.md) | `.eli` transforms, source-map handoff, and React Fast Refresh |
| [`org/`](org/README.md) | Pure Emacs Org-to-ESM export and Vite virtual modules |
| [`worker/`](worker/README.md) | Emacs operation service, worker lifecycle, indexing adapter, and measurement probe |
| [`collections/`](collections/) | Bun, Node, and browser HAMT layout measurements |
| [`fuzz/`](fuzz/) | Deterministic reader and complete-program robustness corpus |
| [`project/`](project/README.md) | Project scale, invalidation, resource, and clean-equivalence evidence |
| [`conformance/`](conformance/) | Specification registry and evidence validation |
| [`surface/`](surface/) | Public-surface and compatibility-baseline validation |
| [`ci/`](ci/) | Deterministic compatibility workflow generation |

Generated reports and workflows are contract outputs. Their source registries
and generators should be changed together.
