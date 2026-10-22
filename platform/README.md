# Platform Packages

[Project README](../README.md) | [Runtime](../runtime/README.md) |
[Specifications](../specs/README.md)

Platform packages expose concrete JavaScript host facilities without adding
them to the portable language core. They never select a browser or worker
global implicitly. Applications pass a host object and an explicit grant list,
then pass the resulting frozen token only to code that needs that authority.

All platform modules in this directory (`browser.eli`, `http.eli`, and
`worker.eli`, alongside the host runtime adapters `bun.mjs`, `node.mjs`, and
`deno.mjs`) are maintained as `.eli` sources in Git and materialized/compiled to
`.mjs` during `make bootstrap-backends` (with zero tracked `.mjs` files in the
repository). Both extensionless package subpath imports
(`(import "eliscript/platform/browser" ...)`) and explicit `.mjs` specifiers are
supported.

## Browser

From Eliscript (extensionless or `.mjs` subpath):

```elisp
(import "eliscript/platform/browser"
        browserCapabilities browserDocument browserFetch)

(let* ((capabilities (browserCapabilities globalThis ["document" "network"]))
       (root (js-call (browserDocument capabilities) :querySelector "#app"))
       (response (await (browserFetch capabilities "/articles.json"))))
  response)
```

Or from JavaScript ESM:

```js
import {
  browserCapabilities,
  browserDocument,
  browserFetch,
} from "eliscript/platform/browser.mjs";

const capabilities = browserCapabilities(globalThis, ["document", "network"]);
const root = browserDocument(capabilities).querySelector("#app");
const response = await browserFetch(capabilities, "/articles.json");
```

Available grants are `clock`, `document`, `network`, `randomness`, and
`timers`. Omit a grant and its operation fails with `missing-capability`.

## Worker

The reference Emacs compute worker appends a request context whose
`capabilities` field grants only `progress` and `cancellation`:

```elisp
(import "eliscript/platform/worker" workerCancelled workerProgress)

(defun index (values context)
  (if (workerCancelled (get context :capabilities))
    nil
    (progn
      (workerProgress (get context :capabilities) {:stage "indexing"})
      (length values))))
(export index)
```

The same package re-exports the canonical worker value-codec and chunk-stream
APIs (`worker.eli`). Exact semantics and limitations are specified in
[0126](../specs/0126-explicit-host-capability-packages.md).
