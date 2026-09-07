# Platform Packages

[Project README](../README.md) | [Runtime](../runtime/README.md) |
[Specifications](../specs/README.md)

Platform packages expose concrete JavaScript host facilities without adding
them to the portable language core. They never select a browser or worker
global implicitly. Applications pass a host object and an explicit grant list,
then pass the resulting frozen token only to code that needs that authority.

## Browser

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

```js
import {
  workerCancelled,
  workerProgress,
} from "eliscript/platform/worker.mjs";

export function index(values, context) {
  if (workerCancelled(context.capabilities)) return null;
  workerProgress(context.capabilities, { stage: "indexing" });
  return values.length;
}
```

The same package re-exports the canonical worker value-codec and chunk-stream
APIs. Exact semantics and limitations are specified in
[0126](../specs/0126-explicit-host-capability-packages.md).
