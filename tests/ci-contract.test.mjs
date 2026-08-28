import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkCompatibilityWorkflow,
  CompatibilityMatrixError,
  renderWorkflow,
  validateCompatibilityMatrix,
} from "../tools/ci/render-workflow.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(
  await readFile(path.join(root, "contracts/compatibility-matrix.json"), "utf8"),
);

function copyBaseline() {
  return structuredClone(baseline);
}

function expectMatrixFailure(matrix, pattern) {
  try {
    validateCompatibilityMatrix(matrix);
    throw new Error("expected compatibility matrix validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(CompatibilityMatrixError);
    expect(error.message).toMatch(pattern);
  }
}

describe("compatibility matrix contract", () => {
  test("repository compatibility matrix renders the committed CI workflow", async () => {
    const report = await checkCompatibilityWorkflow({ root });
    expect(report.jobs).toBe(4);
    expect(report.systems.map((system) => system.id)).toEqual(["linux", "macos"]);
    expect(report.emacsVersions).toEqual(["29.4", "30.2"]);
    expect(report.javascriptHost).toEqual({ name: "bun", version: "1.4.0" });
  });

  test("matrix rejects a missing supported operating system", () => {
    const matrix = copyBaseline();
    matrix.operatingSystems = matrix.operatingSystems.slice(0, 1);
    expectMatrixFailure(matrix, /must include linux and macos/);
  });

  test("matrix rejects a missing supported Emacs major version", () => {
    const matrix = copyBaseline();
    matrix.emacsVersions = ["30.2"];
    expectMatrixFailure(matrix, /cover Emacs 29 and Emacs 30/);
  });

  test("matrix rejects mutable action references", () => {
    const matrix = copyBaseline();
    matrix.actions[0].revision = "v6";
    expectMatrixFailure(matrix, /full lowercase commit SHA/);
  });

  test("matrix rejects a weakened command sequence", () => {
    const matrix = copyBaseline();
    matrix.commands = matrix.commands.filter((command) => command !== "make byte-compile");
    expectMatrixFailure(matrix, /commands must be/);
  });

  test("checker rejects manual workflow drift", async () => {
    const workflow = renderWorkflow(baseline).replace(
      "timeout-minutes: 30",
      "timeout-minutes: 60",
    );
    await expect(checkCompatibilityWorkflow({
      root,
      matrix: baseline,
      workflowText: workflow,
    })).rejects.toThrow(/differs from the compatibility matrix/);
  });
});
