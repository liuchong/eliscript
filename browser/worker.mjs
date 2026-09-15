// Module worker for the browser compile host.
//
// Compilation runs here so an editor stays responsive, and the host is imported
// by a relative path because a worker realm has no document and therefore no
// import map. The worker returns plain data: the main thread creates the blob
// URLs and executes the entry, so no blob URL crosses a realm boundary.

import { compileProject, compileSource, outputPathFor } from "./host.mjs";

// A function cannot cross the worker boundary, so the caller passes the URL the
// package is served from and the worker builds the resolver. Pointing the
// runtime at a URL rather than an import map is what lets compiled output run
// from blob modules, which have no directory of their own.
function externalResolver(runtimeBase) {
  if (typeof runtimeBase !== "string" || runtimeBase.length === 0) return undefined;
  const base = new URL(runtimeBase);
  return (specifier) => specifier.startsWith("eliscript/")
    ? new URL(specifier.slice("eliscript/".length), base).href
    : undefined;
}

function compile(request) {
  const resolveExternal = externalResolver(request.runtimeBase);
  if (request.mode === "project") {
    return compileProject({
      files: request.files,
      entry: request.entry,
      resolveExternal,
    });
  }
  const options = resolveExternal === undefined ? {} : { resolveExternal };
  const output = outputPathFor(request.filename);
  return {
    plan: { entries: [request.filename], modules: [{ id: request.filename, dependencies: [] }] },
    modules: {
      [output]: {
        id: request.filename,
        source: request.source,
        ...compileSource(request.source, request.filename, options),
      },
    },
  };
}

self.addEventListener("message", (event) => {
  const { id, request } = event.data ?? {};
  try {
    const result = compile(request);
    self.postMessage({ id, ok: true, plan: result.plan, modules: result.modules });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      message: error?.message ?? String(error),
      diagnostics: error?.diagnostics ?? [],
    });
  }
});

self.postMessage({ ready: true });
