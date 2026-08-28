import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dir, "..");
const compiler = resolve(projectDirectory, "bin/eliscript");
const bootstrapBuilder = resolve(projectDirectory, "bin/eliscript-bootstrap");
const portableCompiler = resolve(projectDirectory, "bin/eliscript-portable");
const emacs = process.env.EMACS ?? "emacs";

async function runSuccessful(command, extraEnvironment = {}) {
  const child = Bun.spawn(command, {
    cwd: projectDirectory,
    env: { ...process.env, EMACS: emacs, ...extraEnvironment },
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
  return stdout;
}

test("portable 32-bit operations and algorithms agree under Bun and Node", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-bit-"));
  const bitSource = resolve(projectDirectory, "stdlib/bit.eli");
  const usageSource = resolve(projectDirectory, "tests/fixtures/bit-usage.eli");
  const hostFixture = resolve(projectDirectory, "tests/fixtures/bit-host.mjs");
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const bitModule = resolve(seedDirectory, "bit.mjs");
  const selfHostedBitModule = resolve(selfHostedDirectory, "bit.mjs");
  const usageModule = resolve(seedDirectory, "bit-usage.mjs");

  try {
    await Promise.all([
      mkdir(seedDirectory, { recursive: true }),
      mkdir(selfHostedDirectory, { recursive: true }),
    ]);
    for (const [source, output] of [
      [bitSource, bitModule],
      [usageSource, usageModule],
    ]) {
      await runSuccessful([
        compiler,
        "--source-map",
        "--output",
        output,
        source,
      ]);
    }
    await runSuccessful([bootstrapBuilder], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrapDirectory,
    });
    await runSuccessful([
      portableCompiler,
      "--source-map",
      "--output",
      selfHostedBitModule,
      bitSource,
    ], {
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory,
    });

    expect(await Bun.file(selfHostedBitModule).text())
      .toBe(await Bun.file(bitModule).text());
    expect(await Bun.file(`${selfHostedBitModule}.map`).text())
      .toBe(await Bun.file(`${bitModule}.map`).text());

    const expected = {
      intrinsics: {
        int32: -1,
        "int32-fraction": 3,
        "int32-negative-fraction": -3,
        "int32-nan": 0,
        uint32: 4_294_967_295,
        "uint32-infinity": 0,
        "uint32-wrap": 1,
        imul32: -5,
        "bit-and": 15,
        "bit-or": 3_855,
        "bit-xor": 85,
        "bit-not": -1,
        "shift-left": -2_147_483_648,
        "shift-mask": 3,
        "shift-right": -1,
        "unsigned-shift-right": 1,
      },
      evaluation: { result: 3, order: ["left", "right"] },
      library: {
        zero: 0,
        all: 32,
        alternating: 16,
        high: 1,
        rotateLeft: 878_082_066,
        rotateRight: 2_014_458_966,
        rotateIdentity: 305_419_896,
        rotateMasked: 878_082_066,
      },
    };

    for (const host of ["bun", "node"]) {
      for (const compiledBitModule of [bitModule, selfHostedBitModule]) {
        const output = await runSuccessful([
          host,
          hostFixture,
          usageModule,
          compiledBitModule,
        ]);
        expect(JSON.parse(output)).toEqual(expected);
      }
    }

    const sourceMap = await Bun.file(`${bitModule}.map`).json();
    expect(sourceMap.sourcesContent).toHaveLength(1);
    expect(sourceMap.sourcesContent[0]).toContain("(defportable bit-count");
    expect(sourceMap.mappings.length).toBeGreaterThan(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
