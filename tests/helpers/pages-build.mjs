import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
let build;

// Every Pages consumer needs the whole published tree, including generated
// assets. Rebuild from current sources once per suite instead of relying on
// artifacts left by another test or a previous checkout.
export function buildPagesInputs() {
  return build ??= (async () => {
    for (const script of [
      "build:browser-playground", "build:browser", "build:docs-site", "dogfood",
    ]) {
      const child = Bun.spawn(["bun", "run", script], {
        cwd: ROOT, stdout: "pipe", stderr: "pipe",
      });
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      if (exitCode !== 0) {
        throw new Error(`${script} failed: ${stderr.trim() || stdout.trim()}`);
      }
    }
  })();
}
