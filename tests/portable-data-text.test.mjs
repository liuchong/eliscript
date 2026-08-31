import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { keyword as runtimeKeyword } from "../runtime/core/identifier.mjs";
import { persistentHashMap } from "../runtime/core/map.mjs";
import { withMeta as runtimeWithMeta } from "../runtime/core/metadata.mjs";
import { persistentHashSet } from "../runtime/core/set.mjs";
import { printValue as runtimePrintValue } from "../runtime/core/data-text.mjs";
import { persistentVector } from "../runtime/core/vector.mjs";

const projectDirectory = resolve(import.meta.dir, "..");
const stdlibDirectory = resolve(projectDirectory, "stdlib");
const compiler = resolve(projectDirectory, "bin/eliscript");
const bootstrapBuilder = resolve(projectDirectory, "bin/eliscript-bootstrap");
const portableCompiler = resolve(projectDirectory, "bin/eliscript-portable");
const sources = [
  "bit",
  "identifier",
  "persistent-list",
  "persistent-vector",
  "persistent-map",
  "persistent-set",
  "value",
  "metadata",
  "data-text",
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

async function runFixture(command, fixture, modulePath, loader) {
  return JSON.parse(await runSuccessful([
    command,
    ...loader,
    fixture,
    modulePath,
  ]));
}

test("portable canonical data text is byte-identical and host-independent", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-data-text-"));
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");
  const fixture = resolve(
    projectDirectory,
    "tests/fixtures/portable-data-text-host.mjs",
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
      const extension = name === "data-text" ? "mjs" : "eli";
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
      const extension = name === "data-text" ? "mjs" : "eli";
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
      const extension = name === "data-text" ? "mjs" : "eli";
      const seed = resolve(seedDirectory, `${name}.${extension}`);
      const selfHosted = resolve(selfHostedDirectory, `${name}.${extension}`);
      expect(await Bun.file(selfHosted).text()).toBe(await Bun.file(seed).text());
      expect(await Bun.file(`${selfHosted}.map`).text())
        .toBe(await Bun.file(`${seed}.map`).text());
    }

    const reports = [];
    for (const outputDirectory of [seedDirectory, selfHostedDirectory]) {
      const modulePath = resolve(outputDirectory, "data-text.mjs");
      reports.push(await runFixture(
        "/Users/liu/.bun/bin/bun",
        fixture,
        modulePath,
        ["--preload", bunPreload],
      ));
      reports.push(await runFixture(
        process.env.NODE ?? "node",
        fixture,
        modulePath,
        ["--experimental-loader", nodeLoader],
      ));
    }
    for (const report of reports) expect(report).toEqual(reports[0]);

    expect(reports[0]).toEqual({
      canonical: {
        root:
          '({:a ^{:line 7 :source "portable"} ' +
          '[nil undefined true ##NaN ##Inf 42N "Unicode 值\\n" ' +
          ':article/title article/title ' +
          '#eliscript/symbol [nil "space name"]] :z #{1 2 3}} [1 2 3])',
        map:
          '{:a ^{:line 7 :source "portable"} ' +
          '[nil undefined true ##NaN ##Inf 42N "Unicode 值\\n" ' +
          ':article/title article/title ' +
          '#eliscript/symbol [nil "space name"]] :z #{1 2 3}}',
        insertionIndependent: true,
        unsafeIdentifier: '#eliscript/symbol [nil "space name"]',
        common: '^{:source "parity"} [:a {:a 1 :b 2} #{1 2 3}]',
      },
      roundTrip: {
        rootEqual: true,
        fixedPoint: true,
        metadataSource: null,
        nestedMetadataSource: "portable",
        generatedEqual: true,
        generatedFixedPoint: true,
      },
      values: {
        ok: true,
        count: 3,
        first: 1,
        keyword: "two",
        listCount: 2,
        undefinedPreserved: true,
      },
      errors: {
        duplicateMap: "duplicate map key at 1:7",
        duplicateSet: "duplicate set value at 1:5",
        located: { offset: 6, line: 3, column: 1, sourceLength: 7 },
        limited: "data text exceeds maxValues 2",
      },
      edges: {
        decodedString: "Unicode 值\n\t\\\"",
        taggedSymbol: "article/title",
        ignored: [1, 2, 3],
        depthLimited: "data text exceeds maxDepth 2 at 1:4",
        lengthLimited: "data text exceeds maxLength 4 at 1:1",
        valueLimited: "data text exceeds maxValues 2 at 1:4",
        invalidOptions: "invalid data text options at 1:1",
        invalidEscape: "invalid string escape at 1:2",
        oddMap: "map requires a value for every key at 1:7",
        unknownDispatch: "unknown dispatch #unknown at 1:1",
        trailing: "trailing data after value at 1:5",
        emptyValues: 0,
        negativeZero: "0",
      },
      shape: { mapCount: 2, setCount: 3, generatedCount: 2_000 },
    });

    const runtimeMetadata = persistentHashMap([runtimeKeyword("source"), "parity"]);
    const runtimeCommon = runtimeWithMeta(persistentVector(
      runtimeKeyword("a"),
      persistentHashMap(
        [runtimeKeyword("b"), 2],
        [runtimeKeyword("a"), 1],
      ),
      persistentHashSet(3, 1, 2),
    ), runtimeMetadata);
    expect(reports[0].canonical.common).toBe(runtimePrintValue(runtimeCommon));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);
