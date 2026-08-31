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

test("portable numeric functions preserve exact Number and safe-integer contracts", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-numeric-"));
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");
  const prunedDirectory = resolve(directory, "pruned");
  const hostFixture = resolve(
    projectDirectory,
    "tests/fixtures/portable-numeric-host.mjs",
  );

  try {
    await Promise.all([
      mkdir(seedDirectory, { recursive: true }),
      mkdir(selfHostedDirectory, { recursive: true }),
    ]);
    await runSuccessful([
      compiler,
      "--source-map",
      "--output",
      resolve(seedDirectory, "numeric.mjs"),
      resolve(stdlibDirectory, "numeric.eli"),
    ]);
    await runSuccessful([bootstrapBuilder], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrapDirectory,
    });
    await runSuccessful(
      [
        portableCompiler,
        "--source-map",
        "--output",
        resolve(selfHostedDirectory, "numeric.mjs"),
        resolve(stdlibDirectory, "numeric.eli"),
      ],
      { ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory },
    );

    const seed = resolve(seedDirectory, "numeric.mjs");
    const selfHosted = resolve(selfHostedDirectory, "numeric.mjs");
    expect(await Bun.file(selfHosted).text()).toBe(await Bun.file(seed).text());
    expect(await Bun.file(`${selfHosted}.map`).text()).toBe(
      await Bun.file(`${seed}.map`).text(),
    );

    const reports = [];
    for (const modulePath of [seed, selfHosted]) {
      reports.push(
        JSON.parse(await runSuccessful(["bun", hostFixture, modulePath])),
      );
      reports.push(
        JSON.parse(
          await runSuccessful([
            process.env.NODE ?? "node",
            hostFixture,
            modulePath,
          ]),
        ),
      );
    }
    for (const report of reports) expect(report).toEqual(reports[0]);
    const report = reports[0];

    expect(report.classification).toEqual({
      number: [true, true, false, false],
      finite: [true, true, false, false],
      nan: [true, false, false],
      infinite: [true, true, false],
      integer: [true, true, false, false],
      safeInteger: [true, true, false, false],
      zero: [true, true, false],
      positive: [true, true, false, false],
      negative: [true, true, false, false],
      parity: [true, true, true, true, false, false],
    });
    expect(report.scalar).toEqual({
      abs: [9, 4, true, null],
      absNan: true,
      absInfinity: true,
      sign: [-1, -1, 0, 1, 1, null],
      signNan: true,
      compare: [-1, 0, 1, null, null],
      minimum: -3,
      maximum: 12,
      minInfinity: true,
      maxInfinity: true,
      minNan: true,
      maxNan: true,
      minInvalid: null,
      maxInvalid: null,
      clamp: [5, 0, 10, null, null],
      clampNan: true,
    });
    expect(report.checked).toEqual({
      add: [42, Number.MAX_SAFE_INTEGER, null],
      subtract: [-2, -Number.MAX_SAFE_INTEGER, null],
      multiply: [42, 0, null],
      invalid: [null, null, null],
      normalizedZeros: [true, true, true],
    });
    expect(report.division).toEqual({
      cases: [
        { dividend: 5, divisor: 3, quot: 1, rem: 2, modulo: 2 },
        { dividend: -5, divisor: 3, quot: -1, rem: -2, modulo: 1 },
        { dividend: 5, divisor: -3, quot: -1, rem: 2, modulo: -1 },
        { dividend: -5, divisor: -3, quot: 1, rem: -2, modulo: -2 },
        { dividend: 6, divisor: -3, quot: -2, rem: 0, modulo: 0 },
      ],
      invalid: [null, null, null],
      normalizedZeros: [true, true, true],
    });
    expect(report.integerAlgorithms).toEqual({
      gcd: [6, 6, 0, Number.MAX_SAFE_INTEGER],
      lcm: [42, 42, 0, Number.MAX_SAFE_INTEGER],
      invalid: [null, null, null],
      fibonacciGcd: 2,
    });
    expect(report.properties).toEqual({ generatedInvariant: true, cases: 50_000 });

    await runSuccessful([
      projectBuilder,
      "--root",
      stdlibDirectory,
      "--portable",
      "gcd",
      "--out-dir",
      prunedDirectory,
      resolve(stdlibDirectory, "numeric.eli"),
    ]);
    const pruned = await Bun.file(resolve(prunedDirectory, "numeric.mjs")).text();
    expect(pruned).toContain("function gcd(");
    expect(pruned).toContain("function rem(");
    expect(pruned).toContain("function safe_integer_QMARK_(");
    expect(pruned).not.toContain("function lcm(");
    expect(pruned).not.toContain("function checked_add(");
    expect(pruned).not.toContain("function min_number(");
    expect(pruned).not.toContain("function clamp(");
    expect(pruned).not.toContain("Math.");

    const sourceMap = await Bun.file(`${seed}.map`).json();
    expect(sourceMap.sourcesContent).toHaveLength(1);
    expect(sourceMap.sourcesContent[0]).toContain("(defportable gcd");
    expect(sourceMap.sourcesContent[0]).toContain("(defportable lcm");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 90_000);
