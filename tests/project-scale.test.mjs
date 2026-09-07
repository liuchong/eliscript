import { expect, test } from "bun:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const scalePath = resolve(root, "tools/project/scale-invalidation.mjs");

async function runProjectScale() {
  const child = Bun.spawn([process.execPath, scalePath], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, 660_000);
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]).finally(() => clearTimeout(timer));
  if (timedOut) throw new Error("project scale suite exceeded 660000 ms");
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `scale suite exited with ${exitCode}`);
  }
  return JSON.parse(stdout);
}

test("1000-module graph has exact incremental invalidation and clean equivalence", async () => {
  const report = await runProjectScale();
  expect(report).toMatchObject({
    schemaVersion: 1,
    format: "eliscript-project-scale-invalidation",
    version: 1,
    verified: true,
    graph: {
      modules: 1_000,
      edges: 1_357,
      rootFanout: 360,
      chainModules: 399,
      diamonds: 50,
      diamondModules: 200,
      cycles: 10,
      cycleModules: 100,
      sharedImporters: 299,
      leaf: "m0399.eli",
      sharedDependency: "m0700.eli",
      topologyDigest: "1a0edcb5c8ef1d11694db02db48d1f0b04c6a56733e8defa4ceb5109813e89f4",
    },
    limits: {
      commandTimeoutMs: 120_000,
      maximumCapturedBytes: 16_777_216,
      maximumSourceBytes: 8_388_608,
      maximumArtifactBytes: 67_108_864,
      maximumTemporaryBytes: 142_606_336,
      maximumBuildRssBytes: 536_870_912,
    },
    phases: {
      initial: { counts: { modules: 1_000, compiled: 1_000, reused: 0 } },
      noOp: { counts: { modules: 1_000, compiled: 0, reused: 1_000 } },
      leaf: { counts: { modules: 1_000, compiled: 1, reused: 999 } },
      leafClean: { counts: { modules: 1_000, compiled: 1_000, reused: 0 } },
      shared: { counts: { modules: 1_000, compiled: 1, reused: 999 } },
      sharedClean: { counts: { modules: 1_000, compiled: 1_000, reused: 0 } },
    },
    semantics: {
      baseline: {
        chainHead: 79_800,
        fanout: {
          count: 299,
          first: 1_401,
          last: 1_699,
          digest: "61976a8ef1fc1fed44f9becbeddbbd1bef928bc9046656831fc8c898f23b7d7f",
        },
      },
      leaf: {
        chainHead: 179_800,
        fanout: {
          count: 299,
          first: 1_401,
          last: 1_699,
          digest: "61976a8ef1fc1fed44f9becbeddbbd1bef928bc9046656831fc8c898f23b7d7f",
        },
      },
      shared: {
        chainHead: 179_800,
        fanout: {
          count: 299,
          first: 201_401,
          last: 201_699,
          digest: "f59cf917b887cbcea791dd2803059ba4aace1768d63851d60147c64a98061627",
        },
      },
    },
    equivalence: {
      noOpArtifacts: true,
      leafArtifacts: true,
      leafGraph: true,
      leafBehavior: true,
      sharedArtifacts: true,
      sharedGraph: true,
      sharedBehavior: true,
    },
  });

  expect(report.sources).toEqual({
    initial: {
      files: 1_000,
      bytes: 136_131,
      digest: "9c91f6a9420046d8e54c604ed275daab11ccfe4d8a89b5fb9d18bc329a094847",
    },
    leaf: {
      files: 1_000,
      bytes: 136_134,
      digest: "4281fe87d15237b7084b83e95a36471b73817805ad4dfc28e3c49830513bca35",
    },
    shared: {
      files: 1_000,
      bytes: 136_137,
      digest: "ad25f607f9bc3ef41bccde1deaf6e79be202587f33ae90a3dad6b4da2b72a039",
    },
  });
  for (const source of Object.values(report.sources)) {
    expect(source.bytes).toBeLessThanOrEqual(report.limits.maximumSourceBytes);
  }
  expect(report.temporary.files).toBe(5_003);
  expect(report.temporary.bytes).toBeLessThanOrEqual(report.limits.maximumTemporaryBytes);
  expect(report.temporary.digest).toMatch(/^[0-9a-f]{64}$/u);
  expect(report.phases.noOp.compiledSources).toEqual([]);
  expect(report.phases.leaf.compiledSources).toEqual(["m0399.eli"]);
  expect(report.phases.shared.compiledSources).toEqual(["m0700.eli"]);
  expect(report.phases.noOp.reasons).toEqual({ verified: 1_000 });
  expect(report.phases.leaf.reasons).toEqual({
    "source-changed": 1,
    verified: 999,
  });
  expect(report.phases.shared.reasons).toEqual({
    "source-changed": 1,
    verified: 999,
  });
  for (const semantics of Object.values(report.semantics)) {
    expect(semantics.fanout.digest).toMatch(/^[0-9a-f]{64}$/u);
  }

  for (const phase of Object.values(report.phases)) {
    expect(phase.wallMs).toBeLessThanOrEqual(report.limits.commandTimeoutMs);
    expect(phase.maxRssBytes).toBeGreaterThan(0);
    expect(phase.maxRssBytes).toBeLessThanOrEqual(report.limits.maximumBuildRssBytes);
    expect(phase.graphDigest).toMatch(/^[0-9a-f]{64}$/u);
  }
  for (const artifact of Object.values(report.artifacts)) {
    expect(artifact.files).toBe(2_001);
    expect(artifact.bytes).toBeLessThanOrEqual(report.limits.maximumArtifactBytes);
    expect(artifact.digest).toMatch(/^[0-9a-f]{64}$/u);
  }
}, 680_000);
