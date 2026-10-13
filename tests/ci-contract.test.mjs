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
import {
  checkBrowserCompatibilityWorkflow,
  renderBrowserWorkflow,
  validateBrowserCompatibility,
} from "../tools/ci/render-browser-workflow.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(
  await readFile(path.join(root, "contracts/compatibility-matrix.json"), "utf8"),
);
const browserContract = JSON.parse(await readFile(path.join(root, "contracts/browser-compatibility.json"), "utf8"));

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
    expect(report.acceptanceJobs).toBe(2);
    expect(report.systems.map((system) => system.id)).toEqual(["linux", "macos"]);
    expect(report.acceptanceSystems.map((system) => system.id)).toEqual(["macos"]);
    expect(report.emacsVersions).toEqual(["29.4", "30.2"]);
    expect(report.javascriptHost).toEqual({ name: "bun", version: "1.4.0" });
    expect(report.nodeHost).toEqual({ name: "node", version: "24.20.0" });
    expect(report.localEvidenceDirectory).toBe("acceptance/matrix");
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

  test("matrix rejects an empty or unknown acceptance operating system", () => {
    const empty = copyBaseline();
    empty.acceptanceOperatingSystems = [];
    expectMatrixFailure(empty, /must be a non-empty string array/);

    const unknown = copyBaseline();
    unknown.acceptanceOperatingSystems = ["windows"];
    expectMatrixFailure(unknown, /must exist in operatingSystems/);
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

  test("matrix rejects incomplete local evidence settings", () => {
    const matrix = copyBaseline();
    matrix.localEvidence.nodeHost.version = "current";
    delete matrix.localEvidence.timeoutsMs["make byte-compile"];
    expectMatrixFailure(matrix, /exact Node version/);
    expectMatrixFailure(matrix, /timeoutsMs must cover every command/);
  });

  test("CI installs and verifies the contracted Node host before testing", () => {
    const workflow = renderWorkflow(baseline);
    expect(workflow).toContain(`node_version=${baseline.localEvidence.nodeHost.version}`);
    expect(workflow).toContain("https://nodejs.org/dist/v$node_version/$node_archive");
    expect(workflow).toContain("shasum -a 256 -c node.sha256");
    expect(workflow).toContain(`test "$(node --version)" = "v${baseline.localEvidence.nodeHost.version}"`);
    expect(workflow.indexOf("name: Install Node")).toBeLessThan(
      workflow.indexOf("name: Run complete test suite"),
    );
    const unsupported = copyBaseline();
    unsupported.localEvidence.nodeHost.version = "22.23.2";
    expectMatrixFailure(unsupported, /exact Node version >=24/);
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

  test("CI provisions the locked Chromium browser before the mandatory browser test", () => {
    const workflow = renderWorkflow(baseline);
    const dependencies = workflow.indexOf("name: Install locked dependencies");
    const browser = workflow.indexOf("name: Install Chromium");
    const tests = workflow.indexOf("name: Run complete test suite");
    expect(browser).toBeGreaterThan(dependencies);
    expect(browser).toBeLessThan(tests);
    expect(workflow).toContain("bun node_modules/playwright-core/cli.js install --with-deps chromium");
  });
});

describe("browser compatibility matrix", () => {
  test("all three real engines run on both supported operating systems", async () => {
    const report = await checkBrowserCompatibilityWorkflow({ root });
    expect(report.jobs).toBe(6);
    expect(report.browserEngines).toEqual(["chromium", "firefox", "webkit"]);
    const workflow = renderBrowserWorkflow(browserContract, baseline);
    for (const system of baseline.operatingSystems) for (const browser of report.browserEngines) {
      expect(workflow).toContain(`name: ${system.id}-${browser}`);
    }
    expect(workflow).toContain('install --with-deps "${{ matrix.browser }}"');
    expect(workflow).toContain("ELISCRIPT_TEST_BROWSER: ${{ matrix.browser }}");
    expect(workflow).toContain("bun test tests/direct-wasm-backend.test.mjs 2>&1 | tee");
    expect(workflow).toContain("set -o pipefail");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain(`actions/upload-artifact@${browserContract.artifactAction.revision}`);
  });

  test("browser coverage cannot omit, duplicate or silently rename an engine", () => {
    for (const browserEngines of [[], ["chromium"], ["chromium", "chromium", "webkit"], ["chromium", "safari", "webkit"], ["webkit", "firefox", "chromium"]]) {
      expect(() => validateBrowserCompatibility({ ...browserContract, browserEngines }, baseline)).toThrow(/browserEngines/);
    }
  });

  test("browser gate rejects filtering, skipped execution and mutable artifact actions", () => {
    for (const testCommand of ["true", `${browserContract.testCommand} || true`, `${browserContract.testCommand} --test-name-pattern browser`]) {
      expect(() => validateBrowserCompatibility({ ...browserContract, testCommand }, baseline)).toThrow(/complete direct WASM/);
    }
    expect(() => validateBrowserCompatibility({ ...browserContract,
      artifactAction: { ...browserContract.artifactAction, revision: "v4" } }, baseline)).toThrow(/full commit SHA/);
  });

  test("browser checker rejects a swallowed failure or removed evidence step", async () => {
    const workflow = renderBrowserWorkflow(browserContract, baseline);
    for (const drift of [workflow.replace("set -o pipefail", "true"), workflow.replace("if: always()", "if: success()")]) {
      await expect(checkBrowserCompatibilityWorkflow({ contract: browserContract, matrix: baseline, workflowText: drift })).rejects.toThrow(/differs/);
    }
  });
});
