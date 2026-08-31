import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SOURCE = resolve(ROOT, "tests/fixtures/literal-runtime.eli");
const HOST = resolve(ROOT, "tests/fixtures/literal-runtime-host.mjs");
const SEED = resolve(ROOT, "bin/eliscript");
const BUILD_BOOTSTRAP = resolve(ROOT, "bin/eliscript-bootstrap");
const SELF_HOSTED = resolve(ROOT, "bin/eliscript-portable");
const BUN = process.execPath;
const NODE = process.env.NODE_BINARY ?? "node";

async function run(command, environment = {}, allowFailure = false) {
  const child = Bun.spawn(command, {
    cwd: ROOT,
    env: {
      ...process.env,
      BUN,
      EMACS: process.env.EMACS ?? "emacs",
      ...environment,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0 && !allowFailure) {
    throw new Error(stderr.trim() || stdout.trim() ||
      `${command[0]} exited with ${exitCode}`);
  }
  return { exitCode, stdout, stderr };
}

async function compile(
  compiler,
  output,
  environment = {},
  source = SOURCE,
  extraArguments = [],
) {
  await mkdir(resolve(output, ".."), { recursive: true });
  await run([
    compiler,
    "--source-map",
    "--output",
    output,
    ...extraArguments,
    source,
  ], environment);
}

async function execute(host, modulePath) {
  const result = await run([host, HOST, modulePath]);
  return JSON.parse(result.stdout);
}

test("square literals, persistent constructors, and host containers are distinct", async () => {
  const directory = await mkdtemp(resolve(ROOT, ".eliscript-literals-"));
  const bootstrap = resolve(directory, "bootstrap");
  const seedOutput = resolve(directory, "seed/module.mjs");
  const selfOutput = resolve(directory, "self/module.mjs");

  try {
    await run([BUILD_BOOTSTRAP], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrap,
    });
    await compile(SEED, seedOutput);
    await compile(SELF_HOSTED, selfOutput, {
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrap,
    });

    expect(await readFile(selfOutput, "utf8"))
      .toBe(await readFile(seedOutput, "utf8"));
    expect(await readFile(`${selfOutput}.map`, "utf8"))
      .toBe(await readFile(`${seedOutput}.map`, "utf8"));

    const javascript = await readFile(seedOutput, "utf8");
    expect(javascript.match(/eliscript\/runtime\/literals/g)).toHaveLength(1);
    expect(javascript.match(/runtime\/core\/collection\.mjs/g)).toHaveLength(1);
    expect(javascript).toContain("__eliscript_vector(");
    expect(javascript).toContain("__eliscript_hash_map(");
    expect(javascript).not.toContain("vite");
    expect(javascript).not.toContain("react");

    const bunReport = await execute(BUN, seedOutput);
    const nodeReport = await execute(NODE, selfOutput);
    expect(nodeReport).toEqual(bunReport);
    expect(bunReport).toEqual({
      vector: {
        persistent: true,
        count: 3,
        languageCount: 3,
        first: 1,
        values: [1, 2, {}],
        nestedPersistent: true,
      },
      map: {
        persistent: true,
        count: 2,
        name: "Eliscript",
        valueKey: [5, 6],
      },
      mapLiteral: {
        persistent: true,
        count: 4,
        name: "source",
        valueKey: [7, 8],
        nestedPersistent: true,
        nestedReady: true,
        duplicate: 2,
      },
      host: {
        array: true,
        languageCount: 3,
        second: 2,
        object: true,
        objectValue: { name: "host", count: 2 },
      },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

test("hash-map rejects incomplete pairs in both compilers", async () => {
  const directory = await mkdtemp(resolve(ROOT, ".eliscript-literals-bad-"));
  const bootstrap = resolve(directory, "bootstrap");
  const source = resolve(directory, "invalid.eli");
  await Bun.write(source, "(hash-map \"key\")\n");

  try {
    await run([BUILD_BOOTSTRAP], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrap,
    });
    const seed = await run([SEED, source], {}, true);
    const selfHosted = await run([SELF_HOSTED, source], {
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrap,
    }, true);
    expect(seed.exitCode).not.toBe(0);
    expect(selfHosted.exitCode).not.toBe(0);
    expect(seed.stderr).toContain("hash-map expects complete key/value pairs");
    expect(selfHosted.stderr).toContain(
      "hash-map expects complete key/value pairs",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

test("explicit host-only modules do not link the persistent runtime", async () => {
  const directory = await mkdtemp(resolve(ROOT, ".eliscript-host-values-"));
  const bootstrap = resolve(directory, "bootstrap");
  const source = resolve(directory, "host-only.eli");
  const seedOutput = resolve(directory, "seed/module.mjs");
  const selfOutput = resolve(directory, "self/module.mjs");
  await Bun.write(
    source,
    "(defconst values (js-array 1 2))\n" +
      "(defconst first (js-nth 0 values))\n" +
      "(defconst count (js-length values))\n" +
      "(defconst options (js-object :ready t))\n" +
      "(defconst quoted '(vector 1))\n" +
      "(export values first count options quoted)\n",
  );

  try {
    await run([BUILD_BOOTSTRAP], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrap,
    });
    await compile(SEED, seedOutput, {}, source);
    await compile(SELF_HOSTED, selfOutput, {
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrap,
    }, source);
    const seed = await readFile(seedOutput, "utf8");
    expect(await readFile(selfOutput, "utf8")).toBe(seed);
    expect(seed).not.toContain("eliscript/runtime/literals");
    expect(seed).not.toContain("runtime/core/collection.mjs");
    expect(seed).toContain("const values = [1, 2]");
    expect(seed).toContain("const first = ((((values) ?? [])[0]) ?? null)");
    expect(seed).toContain("const count = ((values) ?? []).length");
    expect(seed).toContain('const options = ({"ready": true})');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

test("portable closures reject persistent constructors and collection literals", async () => {
  const directory = await mkdtemp(resolve(ROOT, ".eliscript-portable-values-"));
  const bootstrap = resolve(directory, "bootstrap");
  const source = resolve(directory, "portable.eli");
  try {
    await run([BUILD_BOOTSTRAP], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrap,
    });
    for (const expression of [
      "(vector 1 2)",
      "[1 2]",
      "(hash-map :ready t)",
      "{:ready t}",
    ]) {
      await Bun.write(
        source,
        `(defportable build () ${expression})\n(export build)\n`,
      );
      const seed = await run([SEED, "--portable", "build", source], {}, true);
      const selfHosted = await run([
        SELF_HOSTED,
        "--portable",
        "build",
        source,
      ], {
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrap,
      }, true);
      for (const result of [seed, selfHosted]) {
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("persistent runtime values");
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
