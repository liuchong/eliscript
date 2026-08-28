# Org Site

[Examples](../README.md) | [Project README](../../README.md) |
[Specification 0012](../../specs/0012-org-publishing.md)

This example is the M3 publishing vertical slice: authored Org files are
exported by pure Emacs, exposed as a Vite virtual ESM module, and rendered by a
React application written in Eliscript.

```sh
bun run org:export
bun run dev:org-site
bun run build:org-site
```

The site discovers all `.org` files under `content/`, filters drafts, sorts
articles by date, supports hash navigation, and reloads content changes during
development. Its Eliscript application prebuilds an immutable slug index for
direct route lookup. The generated module and production bundle are build
artifacts.
