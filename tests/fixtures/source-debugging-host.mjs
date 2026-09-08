import { readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { browserEventBoundary } from "../../platform/browser.mjs";
import { sourceMapDescriptor } from "../../runtime/source-mapping.mjs";

const moduleFile = process.env.ELISCRIPT_DEBUG_MODULE;
const sourceMapFile = process.env.ELISCRIPT_DEBUG_SOURCE_MAP;
if (!moduleFile || !sourceMapFile) {
  throw new Error("ELISCRIPT_DEBUG_MODULE and ELISCRIPT_DEBUG_SOURCE_MAP are required");
}

const moduleUrl = pathToFileURL(await realpath(moduleFile));
const sourceMapUrl = pathToFileURL(sourceMapFile);
const rawMap = JSON.parse(await readFile(sourceMapFile, "utf8"));
const sourceMap = sourceMapDescriptor({
  generatedFile: moduleUrl.href,
  sources: rawMap.sources.map((source) => {
    const url = new URL(source, sourceMapUrl);
    return url.protocol === "file:"
      ? resolve(fileURLToPath(url))
      : url.href;
  }),
  mappings: rawMap.mappings,
});
const generated = await import(`${moduleUrl.href}?source-debugging`);
const failures = [];
const target = new EventTarget();

function record(kind) {
  return (failure) => failures.push({ kind, failure });
}

target.addEventListener(
  "sync",
  browserEventBoundary(generated.event_failure, record("browser-event"), [sourceMap]),
);
target.addEventListener(
  "async",
  browserEventBoundary(generated.async_failure, record("async-rejection"), [sourceMap]),
);
target.dispatchEvent(new Event("sync"));
target.dispatchEvent(new Event("async"));
await new Promise((resolve_) => setTimeout(resolve_, 0));

if (failures.length !== 2) {
  throw new Error(`expected two mapped failures, received ${failures.length}`);
}
process.stdout.write(`${JSON.stringify(failures)}\n`);
