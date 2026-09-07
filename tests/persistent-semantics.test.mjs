import { expect, test } from "bun:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const corpusPath = resolve(root, "tools/collections/persistent-semantics.mjs");

async function runCorpus(command, ...arguments_) {
  const child = Bun.spawn([command, corpusPath, ...arguments_], {
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
  if (timedOut) throw new Error("persistent semantics corpus exceeded 300000 ms");
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `corpus exited with ${exitCode}`);
  }
  return JSON.parse(stdout);
}

test("400000 generated persistent collection sequences preserve semantics and history", async () => {
  const [report, nodeReport] = await Promise.all([
    runCorpus(process.execPath),
    runCorpus(process.env.NODE_BINARY ?? "node"),
  ]);
  expect(nodeReport).toEqual(report);
  expect(report).toMatchObject({
    schemaVersion: 1,
    format: "eliscript-persistent-semantics-corpus",
    version: 1,
    verified: true,
    acceptanceEligible: true,
    seed: "0x50443031",
    sequencesPerFamily: 100_000,
    updatesPerSequence: 8,
    totalSequences: 400_000,
    totalUpdates: 3_200_000,
    digest: "7399e57850b30051c93216d1ad85390de1ead7d86853a5c97d929f6006991bb9",
  });
  expect(report.families).toEqual({
    list: {
      sequences: 100_000,
      updates: 800_000,
      rejectedUpdates: 92_008,
      previousVersionsChecked: 3_600_000,
      operations: {
        conj: 199_585,
        count: 800_000,
        size: 800_000,
        isEmpty: 800_000,
        toArray: 800_000,
        iterator: 800_000,
        first: 800_000,
        peek: 800_000,
        nth: 981_679,
        "nth-not-found": 800_000,
        reduce: 800_000,
        cons: 199_779,
        pop: 200_580,
        rest: 200_056,
      },
      digest: "d91f9122800b989707dfd75edabb2a7b69a2061d4af61d44ba33bf23aa0b7185",
    },
    vector: {
      sequences: 100_000,
      updates: 800_000,
      rejectedUpdates: 51_611,
      previousVersionsChecked: 3_600_000,
      operations: {
        "assoc-append": 199_331,
        count: 800_000,
        size: 800_000,
        toArray: 800_000,
        iterator: 800_000,
        peek: 800_000,
        nth: 1_553_719,
        "nth-not-found": 800_000,
        reduce: 800_000,
        assoc: 200_163,
        pop: 200_519,
        conj: 199_987,
      },
      digest: "a6907f86489049e5430d4cd3f738db0a25236f81a251385d0d01c56251d5e26b",
    },
    map: {
      sequences: 100_000,
      updates: 800_000,
      rejectedUpdates: 0,
      previousVersionsChecked: 3_600_000,
      operations: {
        assoc: 533_773,
        count: 800_000,
        size: 800_000,
        has: 10_874_023,
        get: 10_874_023,
        entries: 800_000,
        iterator: 800_000,
        keys: 800_000,
        values: 800_000,
        toMap: 800_000,
        reduce: 800_000,
        dissoc: 266_227,
      },
      digest: "db555364b6f8e7af72d0cb951498e189e729a273fb4224fc134e4f97b40ab911",
    },
    set: {
      sequences: 100_000,
      updates: 800_000,
      rejectedUpdates: 0,
      previousVersionsChecked: 3_600_000,
      operations: {
        union: 160_199,
        count: 800_000,
        size: 800_000,
        has: 13_096_560,
        values: 800_000,
        keys: 800_000,
        iterator: 800_000,
        entries: 800_000,
        toSet: 800_000,
        reduce: 800_000,
        isSubsetOf: 800_000,
        isSupersetOf: 800_000,
        isDisjointFrom: 800_000,
        disj: 160_186,
        difference: 159_763,
        conj: 160_029,
        intersection: 159_823,
      },
      digest: "7e72dc7c20e73f85daa236da70ead86f417fd7530158ce71418a70b3557e7572",
    },
  });
  for (const [family, familyReport] of Object.entries(report.families)) {
    expect(familyReport.sequences).toBe(100_000);
    expect(familyReport.updates).toBe(800_000);
    expect(familyReport.previousVersionsChecked).toBe(3_600_000);
    expect(familyReport.digest).toMatch(/^[0-9a-f]{64}$/u);
    for (const [operation, count] of Object.entries(familyReport.operations)) {
      expect(operation.length).toBeGreaterThan(0);
      expect(count).toBeGreaterThan(0);
    }
    expect(Object.keys(familyReport.operations).length, family).toBeGreaterThan(8);
  }
}, 320_000);

test("one persistent sequence can be replayed independently", async () => {
  const left = await runCorpus(
    process.execPath,
    "--family", "map", "--sequence", "731", "--sequences", "1000",
  );
  const right = await runCorpus(
    process.execPath,
    "--family", "map", "--sequence", "731", "--sequences", "1000",
  );
  expect(right).toEqual(left);
  expect(left).toMatchObject({
    verified: true,
    acceptanceEligible: false,
    sequencesPerFamily: 1_000,
    totalSequences: 1,
    totalUpdates: 8,
    families: {
      map: {
        sequences: 1,
        updates: 8,
        previousVersionsChecked: 36,
      },
    },
  });
});
