import {
  browserCapabilities,
  browserCapabilityDescriptor,
  browserFetch,
  browserNow,
} from "../../platform/browser.mjs";
import {
  workerCapabilities,
  workerCapabilityDescriptor,
  workerProgress,
} from "../../platform/worker.mjs";

const browser = browserCapabilities({
  fetch(input) {
    return { ok: true, input };
  },
  performance: {
    now() {
      return 42.5;
    },
  },
}, ["network", "clock"]);
const progress = [];
const worker = workerCapabilities({
  signal: new AbortController().signal,
  progress(value) {
    progress.push(value);
    return progress.length;
  },
}, ["progress", "cancellation"]);

workerProgress(worker, "indexed");
console.log(JSON.stringify({
  browser: browserCapabilityDescriptor(browser),
  fetch: await browserFetch(browser, "/articles"),
  now: browserNow(browser),
  worker: workerCapabilityDescriptor(worker),
  progress,
}));
