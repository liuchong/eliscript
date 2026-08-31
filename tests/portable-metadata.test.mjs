import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dir, "..");
const stdlibDirectory = resolve(projectDirectory, "stdlib");
const compiler = resolve(projectDirectory, "bin/eliscript");
const bootstrapBuilder = resolve(projectDirectory, "bin/eliscript-bootstrap");
const portableCompiler = resolve(projectDirectory, "bin/eliscript-portable");
const sources = [
  "bit",
  "persistent-list",
  "persistent-vector",
  "persistent-map",
  "persistent-set",
  "value",
  "metadata",
];
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

test("Eliscript-authored metadata is byte-identical and portable", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-metadata-"));
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");
  const hostFixture = resolve(
    projectDirectory,
    "tests/fixtures/portable-metadata-host.mjs",
  );
  const bunPreload = resolve(
    projectDirectory,
    "tests/fixtures/compiled-eli-bun-preload.mjs",
  );
  const nodeLoader = resolve(
    projectDirectory,
    "tests/fixtures/compiled-eli-node-loader.mjs",
  );

  try {
    await Promise.all([
      mkdir(seedDirectory, { recursive: true }),
      mkdir(selfHostedDirectory, { recursive: true }),
    ]);
    for (const name of sources) {
      const extension = name === "metadata" ? "mjs" : "eli";
      await runSuccessful([
        compiler,
        "--source-map",
        "--output",
        resolve(seedDirectory, `${name}.${extension}`),
        resolve(stdlibDirectory, `${name}.eli`),
      ]);
    }
    await runSuccessful([bootstrapBuilder], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrapDirectory,
    });
    for (const name of sources) {
      const extension = name === "metadata" ? "mjs" : "eli";
      await runSuccessful([
        portableCompiler,
        "--source-map",
        "--output",
        resolve(selfHostedDirectory, `${name}.${extension}`),
        resolve(stdlibDirectory, `${name}.eli`),
      ], {
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory,
      });
    }

    for (const name of sources) {
      const extension = name === "metadata" ? "mjs" : "eli";
      const seed = resolve(seedDirectory, `${name}.${extension}`);
      const selfHosted = resolve(selfHostedDirectory, `${name}.${extension}`);
      expect(await Bun.file(selfHosted).text()).toBe(await Bun.file(seed).text());
      expect(await Bun.file(`${selfHosted}.map`).text())
        .toBe(await Bun.file(`${seed}.map`).text());
    }

    const reports = [];
    for (const outputDirectory of [seedDirectory, selfHostedDirectory]) {
      const metadataModule = resolve(outputDirectory, "metadata.mjs");
      reports.push(JSON.parse(await runSuccessful([
        "bun",
        "--preload",
        bunPreload,
        hostFixture,
        metadataModule,
      ])));
      reports.push(JSON.parse(await runSuccessful([
        process.env.NODE ?? "node",
        "--experimental-loader",
        nodeLoader,
        hostFixture,
        metadataModule,
      ])));
    }
    for (const report of reports) expect(report).toEqual(reports[0]);
    expect(reports[0]).toEqual({
      support: { list: true, vector: true, map: true, set: true, host: false },
      metadata: {
        valid: true,
        invalid: false,
        unsupported: null,
        invalidAttachment: null,
        source: "portable",
        variedLine: 9,
      },
      semantics: {
        equal: true,
        hashEqual: true,
        childMetadata: null,
      },
      sharing: { list: true, vector: true, map: true, set: true },
      updates: { list: true, vector: true, map: true, set: true },
      hostValues: {
        list: [1, 2, 3],
        vector: [1, 2, 3],
        mapCount: 2,
        setCount: 3,
      },
    });

    const sourceMap = await Bun.file(resolve(seedDirectory, "metadata.mjs.map"))
      .json();
    expect(sourceMap.sourcesContent).toHaveLength(1);
    expect(sourceMap.sourcesContent[0]).toContain("(defportable with-meta");
    expect(sourceMap.sourcesContent[0]).toContain("(defportable vary-meta");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 90_000);
