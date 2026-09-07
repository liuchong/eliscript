import { expect, test } from "bun:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const fuzzPath = resolve(root, "tools/fuzz/reader-program-fuzz.mjs");

async function runAcceptanceFuzz() {
  const child = Bun.spawn([
    process.execPath,
    fuzzPath,
    "--cases",
    "100000",
    "--seed",
    "0x454c4931",
  ], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 300_000);
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]).finally(() => clearTimeout(timer));
  if (timedOut) throw new Error("reader/program fuzz exceeded 300000 ms");
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `fuzz exited with ${exitCode}`);
  }
  return JSON.parse(stdout);
}

test("100000 deterministic reader and program mutations preserve every invariant", async () => {
  const report = await runAcceptanceFuzz();
  expect(report).toMatchObject({
    schemaVersion: 1,
    format: "eliscript-reader-program-fuzz",
    version: 1,
    verified: true,
    seed: "0x454c4931",
    inputs: 100_000,
    readerInputs: 50_000,
    programInputs: 50_000,
    maximumSourceCharacters: 4_096,
    maximumCorpusBytes: 67_108_864,
    corpusReplayed: true,
    reader: {
      accepted: 46_889,
      rejected: 53_111,
      deterministicResults: 100_000,
      structuredDiagnostics: 53_111,
      spanValidated: 46_889,
      roundTrips: 46_889,
      seedAgreements: 100_000,
      resultDigest: "31961b6ffb8ce276a67db1b7cce2b723cf512b6c1518f8023985606535c69e7e",
    },
    compiler: {
      accepted: 10_171,
      rejected: 39_829,
      structuredDiagnostics: 39_829,
      resultDigest: "66d9e62d42cd2d448093fd375379f576489bcb20aa7311f109a8190a61523851",
    },
    corpusDigest: "4b49f0e21a825e41344fc29387b5298462d17cd1140b2f1f06076a18fe1f8cab",
  });
  expect(report.corpusBytes).toBeGreaterThan(1_000_000);
  expect(report.corpusBytes).toBeLessThanOrEqual(report.maximumCorpusBytes);
  expect(report.reader.accepted + report.reader.rejected).toBe(100_000);
  expect(report.reader.accepted).toBeGreaterThan(10_000);
  expect(report.reader.rejected).toBeGreaterThan(10_000);
  expect(report.reader.spanValidated).toBe(report.reader.accepted);
  expect(report.reader.roundTrips).toBe(report.reader.accepted);
  expect(report.reader.structuredDiagnostics).toBe(report.reader.rejected);
  expect(report.compiler.accepted + report.compiler.rejected).toBe(50_000);
  expect(report.compiler.accepted).toBeGreaterThan(5_000);
  expect(report.compiler.rejected).toBeGreaterThan(20_000);
  expect(report.compiler.structuredDiagnostics).toBe(report.compiler.rejected);
  for (const digest of [
    report.corpusDigest,
    report.reader.resultDigest,
    report.compiler.resultDigest,
  ]) {
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
  }
}, 320_000);
