import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dir, "..");
const stdlibDirectory = resolve(projectDirectory, "stdlib");
const compiler = resolve(projectDirectory, "bin/eliscript");
const bootstrapBuilder = resolve(projectDirectory, "bin/eliscript-bootstrap");
const portableCompiler = resolve(projectDirectory, "bin/eliscript-portable");
const projectBuilder = resolve(projectDirectory, "bin/eliscript-build");
const sources = [
  "bit",
  "identifier",
  "persistent-list",
  "persistent-vector",
  "persistent-map",
  "persistent-set",
  "value",
  "result",
  "json",
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
    throw new Error(
      stderr.trim() || stdout.trim() || `${command[0]} exited with ${exitCode}`,
    );
  }
  return stdout;
}

test("portable JSON values are strict, canonical, bounded, and self-hosted", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-json-"));
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");
  const prunedDirectory = resolve(directory, "pruned");
  const hostFixture = resolve(
    projectDirectory,
    "tests/fixtures/portable-json-host.mjs",
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
      const extension = name === "json" ? "mjs" : "eli";
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
      const extension = name === "json" ? "mjs" : "eli";
      await runSuccessful(
        [
          portableCompiler,
          "--source-map",
          "--output",
          resolve(selfHostedDirectory, `${name}.${extension}`),
          resolve(stdlibDirectory, `${name}.eli`),
        ],
        { ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory },
      );
    }

    for (const name of sources) {
      const extension = name === "json" ? "mjs" : "eli";
      const seed = resolve(seedDirectory, `${name}.${extension}`);
      const selfHosted = resolve(selfHostedDirectory, `${name}.${extension}`);
      expect(await Bun.file(selfHosted).text()).toBe(await Bun.file(seed).text());
      expect(await Bun.file(`${selfHosted}.map`).text()).toBe(
        await Bun.file(`${seed}.map`).text(),
      );
    }

    const reports = [];
    for (const outputDirectory of [seedDirectory, selfHostedDirectory]) {
      const jsonModule = resolve(outputDirectory, "json.mjs");
      reports.push(
        JSON.parse(
          await runSuccessful([
            "bun",
            "--preload",
            bunPreload,
            hostFixture,
            jsonModule,
          ]),
        ),
      );
      reports.push(
        JSON.parse(
          await runSuccessful([
            process.env.NODE ?? "node",
            "--experimental-loader",
            nodeLoader,
            hostFixture,
            jsonModule,
          ]),
        ),
      );
    }
    for (const report of reports) expect(report).toEqual(reports[0]);

    const report = reports[0];
    expect(report.parsing).toEqual({
      ok: true,
      map: true,
      vector: true,
      vectorCount: 3,
      trueValue: true,
      nilValue: true,
      stringValue: "x\n\u263a",
      numberValue: -1250,
    });
    expect(report.strings).toEqual({
      escapedCodes: [34, 92, 47, 8, 12, 10, 13, 9, 65],
      emojiText: '"\\ud83d\\ude00"',
      emojiRoundTrip: true,
      loneSurrogateText: '"\\ud800"',
      loneSurrogateRoundTrip: true,
    });
    expect(report.canonical).toEqual({
      first: '{"a":1,"b":2}',
      sameAcrossInsertionOrder: true,
      nested: '{"a":{"n":-1250},"z":[true,null,"x\\n\u263a"]}',
      negativeZero: "0",
    });
    expect(report.strictness.malformed).toBe(true);
    expect(report.strictness.malformedCount).toBe(14);
    expect(report.strictness.duplicate).toEqual({
      result: true,
      jsonError: true,
      code: "ELI-JSON-DUPLICATE",
      message: "duplicate object key",
      offset: 7,
      path: '$["a"]',
    });
    expect(report.strictness.overflow.code).toBe("ELI-JSON-NUMBER");
    expect(report.strictness.sourceType.code).toBe("ELI-JSON-TYPE");
    expect(report.domain.unsupported).toEqual(
      Array(8).fill("ELI-JSON-UNSUPPORTED"),
    );
    expect(report.domain.badNumberCodes).toEqual(
      Array(3).fill("ELI-JSON-NUMBER"),
    );
    expect(report.domain.badKey.code).toBe("ELI-JSON-KEY");
    expect(report.domain.sharedText).toBe("[[1],[1]]");
    expect(report.domain.cycle.code).toBe("ELI-JSON-CYCLE");
    expect(report.domain.cycle.path).toBe("$[0]");
    expect(report.domain.malformedErrorRejected).toBe(true);

    for (const phase of [report.limits.parse, report.limits.stringify]) {
      expect(phase.options.code).toBe("ELI-JSON-OPTIONS");
      expect(phase.length.code).toBe("ELI-JSON-LENGTH");
      expect(phase.depth.code).toBe("ELI-JSON-DEPTH");
      expect(phase.values.code).toBe("ELI-JSON-VALUES");
    }
    expect(report.limits.parse.optionValues).toEqual(
      Array(3).fill("ELI-JSON-OPTIONS"),
    );
    expect(report.limits.parse.nullOptionsUseDefaults).toBe(true);
    expect(report.properties.generatedRoundTrips).toBe(true);
    expect(report.scale).toEqual({
      ok: true,
      count: 20_000,
      first: 0,
      last: 19_999,
      stable: true,
    });

    await runSuccessful([
      projectBuilder,
      "--root",
      stdlibDirectory,
      "--portable",
      "parse-json",
      "--out-dir",
      prunedDirectory,
      resolve(stdlibDirectory, "json.eli"),
    ]);
    const pruned = await Bun.file(resolve(prunedDirectory, "json.mjs")).text();
    expect(pruned).toContain("function parse_json(");
    expect(pruned).not.toContain("function stringify_json(");
    expect(pruned).not.toContain("function json_encode_node(");
    expect(pruned).not.toContain("function json_sort_entries(");
    expect(pruned).not.toContain("JSON.parse");
    expect(pruned).not.toContain("JSON.stringify");

    const sourceMap = await Bun.file(resolve(seedDirectory, "json.mjs.map")).json();
    expect(sourceMap.sourcesContent).toHaveLength(1);
    expect(sourceMap.sourcesContent[0]).toContain("(defportable parse-json");
    expect(sourceMap.sourcesContent[0]).toContain("(defportable stringify-json");
    const complete = await Bun.file(resolve(seedDirectory, "json.mjs")).text();
    expect(complete).not.toContain("JSON.parse");
    expect(complete).not.toContain("JSON.stringify");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);
