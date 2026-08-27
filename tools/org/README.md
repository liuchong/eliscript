# Org Publishing Adapter

The adapter uses the Org library bundled with Emacs to turn trusted `.org`
articles into a deterministic ESM data module. It extracts metadata, exports the
body to HTML, assigns stable heading ids, filters drafts, validates duplicate
slugs, and sorts published articles by date.

```sh
./bin/eliscript-org --output dist/articles.mjs content/
```

Each article requires `#+TITLE` and an ISO `#+DATE`. `#+SLUG`,
`#+DESCRIPTION`, `#+FILETAGS`, and `#+DRAFT` are optional. The filename supplies
the slug when `#+SLUG` is absent.

The generated module exports `articles` as both a named and default export. It
contains `slug`, `title`, `date`, `description`, `tags`, `draft`, `source`, and
trusted exported `html` for each article.

For Vite applications, `vite-plugin.mjs` exposes the same data through
`virtual:eliscript-org` and watches the content directory:

```js
import { eliscriptOrg } from "./tools/org/vite-plugin.mjs";

export default {
  plugins: [eliscriptOrg({ contentDirectory: "content" })],
};
```
