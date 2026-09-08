import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SOURCE = resolve(ROOT, "tests/fixtures/language-equality.eli");
const HOST = resolve(ROOT, "tests/fixtures/language-equality-host.mjs");
const SEED = resolve(ROOT, "bin/eliscript");
const BUILD_BOOTSTRAP = resolve(ROOT, "bin/eliscript-bootstrap");
const SELF_HOSTED = resolve(ROOT, "bin/eliscript-portable");
const BUN = process.execPath;
const NODE = process.env.NODE_BINARY ?? "node";

async function run(command, environment = {}) {
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
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() ||
      `${command[0]} exited with ${exitCode}`);
  }
  return { stdout, stderr };
}

async function compile(compiler, source, output, environment = {}) {
  await mkdir(resolve(output, ".."), { recursive: true });
  await run([
    compiler,
    "--source-map",
    "--output",
    output,
    source,
  ], environment);
}

async function execute(host, modulePath) {
  const result = await run([host, HOST, modulePath]);
  return JSON.parse(result.stdout);
}

test("language equal uses value semantics across compilers and local hosts", async () => {
  const directory = await mkdtemp(resolve(ROOT, ".eliscript-equality-"));
  const bootstrap = resolve(directory, "bootstrap");
  const seedOutput = resolve(directory, "seed/module.mjs");
  const selfOutput = resolve(directory, "self/module.mjs");

  try {
    await run([BUILD_BOOTSTRAP], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrap,
    });
    await compile(SEED, SOURCE, seedOutput);
    await compile(SELF_HOSTED, SOURCE, selfOutput, {
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrap,
    });

    const seed = await readFile(seedOutput, "utf8");
    expect(await readFile(selfOutput, "utf8")).toBe(seed);
    expect(await readFile(`${selfOutput}.map`, "utf8"))
      .toBe(await readFile(`${seedOutput}.map`, "utf8"));
    expect(seed.match(/runtime\/core\/value\.mjs/g)).toHaveLength(1);
    expect(seed).toContain("__eliscript_equal(");
    expect(seed).toContain("left === right");

    const expected = {
      persistent: true,
      persistentIdentity: false,
      sameIdentity: true,
      nativeDistinct: false,
      nativeSame: true,
      nan: true,
      signedZero: true,
      mapOrder: true,
      setOrder: true,
    };
    expect(await execute(BUN, seedOutput)).toEqual(expected);
    expect(await execute(NODE, selfOutput)).toEqual(expected);

    const identitySource = resolve(directory, "identity-only.eli");
    const identitySeed = resolve(directory, "seed/identity.mjs");
    const identitySelf = resolve(directory, "self/identity.mjs");
    await Bun.write(
      identitySource,
      "(defun same-object (left right) (eq left right))\n" +
        "(export same-object)\n",
    );
    await compile(SEED, identitySource, identitySeed);
    await compile(SELF_HOSTED, identitySource, identitySelf, {
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrap,
    });
    const identity = await readFile(identitySeed, "utf8");
    expect(await readFile(identitySelf, "utf8")).toBe(identity);
    expect(identity).not.toContain("runtime/core/value.mjs");
    expect(identity).toContain("left === right");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
