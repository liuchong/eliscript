import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "bun:test";

import {
  checkLocalMatrixEvidence,
  expectedMatrixCells,
  LocalCompatibilityMatrixError,
  validateLocalMatrixReport,
} from "../tools/compatibility/matrix.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");
const matrixBytes = await readFile(
  path.join(ROOT, "contracts/compatibility-matrix.json"),
);
const matrix = JSON.parse(matrixBytes.toString("utf8"));
const matrixSha256 = createHash("sha256").update(matrixBytes).digest("hex");

function report(cell = expectedMatrixCells(matrix)[0]) {
  const commands = matrix.commands.map((command) => ({
    id: command.replaceAll(/[^a-z0-9]+/giu, "-").replaceAll(/^-|-$/gu, ""),
    command,
    timeoutMs: matrix.localEvidence.timeoutsMs[command],
    status: "pass",
    exitCode: 0,
    timedOut: false,
    durationMs: 1,
    stdoutSha256: EMPTY_SHA256,
    stderrSha256: EMPTY_SHA256,
    summary: "passed",
  }));
  return {
    schemaVersion: 1,
    format: "eliscript-local-compatibility-cell",
    version: 1,
    generatedAt: "2026-09-09T00:00:00.000Z",
    matrixSha256,
    source: {
      commit: "1".repeat(40),
      tree: "2".repeat(40),
      cleanBefore: true,
      cleanAfter: true,
    },
    execution: { provider: "local", cell: cell.id },
    cell,
    environment: {
      provider: "local",
      operatingSystem: cell.operatingSystem,
      operatingSystemRelease: "test",
      architecture: cell.architecture,
      emacsVersion: cell.emacsVersion,
      bunVersion: matrix.javascriptHost.version,
      nodeVersion: matrix.localEvidence.nodeHost.version,
    },
    commands,
    summary: {
      required: commands.length,
      passed: commands.length,
      failed: 0,
      notRun: 0,
      complete: true,
    },
  };
}

const validationOptions = {
  root: ROOT,
  matrix,
  matrixSha256,
  resolveTree: async () => "2".repeat(40),
};

test("local compatibility evidence derives all real machine cells", () => {
  expect(expectedMatrixCells(matrix)).toEqual([
    {
      id: "linux-x64-emacs-29.4",
      operatingSystem: "linux",
      architecture: "x64",
      emacsVersion: "29.4",
    },
    {
      id: "linux-x64-emacs-30.2",
      operatingSystem: "linux",
      architecture: "x64",
      emacsVersion: "30.2",
    },
    {
      id: "macos-arm64-emacs-29.4",
      operatingSystem: "macos",
      architecture: "arm64",
      emacsVersion: "29.4",
    },
    {
      id: "macos-arm64-emacs-30.2",
      operatingSystem: "macos",
      architecture: "arm64",
      emacsVersion: "30.2",
    },
  ]);
});

test("one direct local report remains an explicitly incomplete matrix", async () => {
  const value = report();
  expect(await validateLocalMatrixReport(value, validationOptions)).toEqual({
    cell: value.cell,
    source: value.source,
    commands: 3,
  });
  expect(await checkLocalMatrixEvidence({
    ...validationOptions,
    reports: [value],
    sourceMatches: async () => true,
  })).toEqual({
    schemaVersion: 1,
    required: 4,
    retained: 1,
    completed: 1,
    missing: [
      "linux-x64-emacs-30.2",
      "macos-arm64-emacs-29.4",
      "macos-arm64-emacs-30.2",
    ],
    stale: [],
    currentSource: true,
    complete: false,
    sourceIdentity: `${value.source.commit}:${value.source.tree}`,
  });
});

test("historical reports do not count for changed source", async () => {
  const value = report();
  expect(await checkLocalMatrixEvidence({
    ...validationOptions,
    reports: [value],
    sourceMatches: async () => false,
  })).toMatchObject({
    required: 4,
    retained: 1,
    completed: 0,
    stale: [value.cell.id],
    currentSource: false,
    complete: false,
  });
});

test("local matrix evidence rejects host drift and forged completion", async () => {
  const value = report();
  value.environment.nodeVersion = "99.0.0";
  value.commands[1].status = "fail";
  value.commands[1].exitCode = 1;

  try {
    await validateLocalMatrixReport(value, validationOptions);
    throw new Error("expected local matrix validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(LocalCompatibilityMatrixError);
    expect(error.errors).toContain(
      "environment must match the cell and exact Bun/Node hosts",
    );
    expect(error.errors).toContain(
      "summary must be derived from command and checkout results",
    );
    expect(error.errors).toContain(
      `matrix report ${value.cell.id} did not pass`,
    );
  }
});

test("local matrix aggregation rejects duplicate cells", async () => {
  const value = report();
  await expect(checkLocalMatrixEvidence({
    ...validationOptions,
    reports: [value, structuredClone(value)],
    sourceMatches: async () => true,
  })).rejects.toThrow(/duplicate matrix cell/u);
});
