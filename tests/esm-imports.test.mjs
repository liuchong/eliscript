import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectDirectory = resolve(import.meta.dir, "..");
const bootstrapPath = resolve(projectDirectory, "bin/eliscript-bootstrap");
const seedPath = resolve(projectDirectory, "bin/eliscript-seed");
const selfHostedPath = resolve(projectDirectory, "bin/eliscript-portable");
const emacs = process.env.EMACS ?? "emacs";

async function run(command, options = {}) {
  const child = Bun.spawn(command, {
    cwd: projectDirectory,
    stdout: "pipe",
    stderr: "pipe",
    ...options,
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      stderr.trim() || stdout.trim() || `${command[0]} exited with ${exitCode}`,
    );
  }
  return stdout;
}

async function execute(runtime, modulePath) {
  const output = await run([
    runtime,
    "--eval",
    `const module = await import(${JSON.stringify(pathToFileURL(modulePath).href)}); ` +
      "console.log(JSON.stringify(module.report()));",
  ]);
  return JSON.parse(output.trim().split("\n").at(-1));
}

test("complete ESM imports are identical and executable across compilers and hosts", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-esm-imports-"));
  try {
    const compilerDirectory = resolve(directory, "compiler");
    const sourcePath = resolve(directory, "imports.eli");
    const seedDirectory = resolve(directory, "seed");
    const selfHostedDirectory = resolve(directory, "self-hosted");
    const seedOutput = resolve(seedDirectory, "imports.mjs");
    const selfHostedOutput = resolve(selfHostedDirectory, "imports.mjs");
    const provider = [
      "globalThis.__eliscript_import_effects =",
      "  (globalThis.__eliscript_import_effects ?? 0) + 1;",
      "export default 11;",
      "export const named_value = 22;",
      "export const namespace_value = 33;",
      "export const effect_count = () => globalThis.__eliscript_import_effects;",
      "",
    ].join("\n");
    const source = [
      '(import "./provider.mjs")',
      '(import "./provider.mjs" :default default-value effect-count named-value)',
      '(import "./provider.mjs" :default namespace-default :as Provider)',
      "(defun report ()",
      "  (js-array default-value",
      "            named-value",
      "            namespace-default",
      '            (get Provider "namespace_value")',
      "            (effect-count)))",
      "(export report)",
      "",
    ].join("\n");

    await Promise.all([
      mkdir(seedDirectory, { recursive: true }),
      mkdir(selfHostedDirectory, { recursive: true }),
      writeFile(sourcePath, source),
    ]);
    await run([bootstrapPath], {
      env: {
        ...process.env,
        EMACS: emacs,
        ELISCRIPT_BOOTSTRAP_OUT_DIR: compilerDirectory,
      },
    });
    await run([
      seedPath,
      "--source-map",
      "--output",
      seedOutput,
      sourcePath,
    ], { env: { ...process.env, EMACS: emacs } });
    await run([
      selfHostedPath,
      "--source-map",
      "--output",
      selfHostedOutput,
      sourcePath,
    ], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: compilerDirectory,
      },
    });
    await Promise.all([
      writeFile(resolve(seedDirectory, "provider.mjs"), provider),
      writeFile(resolve(selfHostedDirectory, "provider.mjs"), provider),
    ]);

    const seedJavaScript = await Bun.file(seedOutput).text();
    expect(await Bun.file(selfHostedOutput).text()).toBe(seedJavaScript);
    expect(await Bun.file(`${selfHostedOutput}.map`).text())
      .toBe(await Bun.file(`${seedOutput}.map`).text());
    expect(seedJavaScript).toContain('import "./provider.mjs";');
    expect(seedJavaScript).toContain(
      'import default_value, {effect_count, named_value} from "./provider.mjs";',
    );
    expect(seedJavaScript).toContain(
      'import namespace_default, * as Provider from "./provider.mjs";',
    );

    const expected = [11, 22, 11, 33, 1];
    expect(await execute(process.execPath, seedOutput)).toEqual(expected);
    expect(await execute("node", seedOutput)).toEqual(expected);
    expect(await execute(process.execPath, selfHostedOutput)).toEqual(expected);
    expect(await execute("node", selfHostedOutput)).toEqual(expected);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
