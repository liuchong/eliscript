import { mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Every fixture gets a fresh Emacs seed and all compiler modules. The separate
// bootstrap test compares these outputs against the public per-file CLI.
export async function seedCompilerFixture(directory, { emacs = process.env.EMACS ?? "emacs" } = {}) {
  const modules = (await readdir(resolve(root, "bootstrap/compiler")))
    .filter(name => /^[a-z][a-z-]*[.]eli$/.test(name)).sort()
    .map(name => name.slice(0, -4));
  if (!modules.includes("compiler")) throw new Error("bootstrap compiler module is missing");
  const output = resolve(directory);
  await mkdir(output, { recursive: true });
  const child = Bun.spawn([
    emacs, "--batch", "-Q", "--script", resolve(root, "tools/bootstrap-seed.el"),
    "--", root, output, ...modules,
  ], { cwd: root, env: { ...process.env }, stdout: "pipe", stderr: "pipe" });
  const [status, stdout, stderr] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
  ]);
  if (status !== 0) {
    const error = new Error(stderr.trim() || stdout.trim() || `Emacs seed exited with ${status}`);
    error.exitCode = status;
    throw error;
  }
  return output;
}
