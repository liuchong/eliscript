import { readFile } from "node:fs/promises";

export async function load(url, context, nextLoad) {
  if (url.endsWith(".eli")) {
    return {
      format: "module",
      shortCircuit: true,
      source: await readFile(new URL(url), "utf8"),
    };
  }
  return nextLoad(url, context);
}
