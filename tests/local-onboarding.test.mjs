import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkOnboarding,
  OnboardingValidationError,
} from "../tools/onboarding/check.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function contract() {
  return JSON.parse(await readFile(
    path.join(ROOT, "contracts/local-onboarding.json"),
    "utf8",
  ));
}

async function validationErrors(candidate) {
  try {
    await checkOnboarding({ root: ROOT, contract: candidate });
  } catch (error) {
    expect(error).toBeInstanceOf(OnboardingValidationError);
    return error.errors;
  }
  throw new Error("expected onboarding validation to fail");
}

test("local onboarding contract binds the core-only validation run", async () => {
  const report = await checkOnboarding({ root: ROOT });
  expect(report).toMatchObject({
    schemaVersion: 1,
    format: "eliscript-local-onboarding-contract-report",
    version: 1,
    steps: 6,
    activeSteps: 5,
    sourceFiles: 12,
    maximumActiveDurationMs: 900_000,
    environment: {
      provider: "local",
      requiredCommands: ["git", "bun", "emacs", "make"],
    },
  });
});

test("local onboarding contract rejects missing prerequisite documentation", async () => {
  const candidate = await contract();
  candidate.requiredDocumentation[0] = "missing prerequisite command";
  expect(await validationErrors(candidate)).toContain(
    "docs/getting-started.md is missing required text: missing prerequisite command",
  );
});

test("local onboarding contract rejects application tests in the core exercise", async () => {
  const candidate = await contract();
  candidate.steps.at(-1).argv = ["make", "test-applications"];
  const errors = await validationErrors(candidate);
  expect(errors).toContain("steps[5] leaks application validation into onboarding");
  expect(errors).toContain("core-suite must execute make test-core");
});

test("local onboarding contract rejects a weakened compiler-build step", async () => {
  const candidate = await contract();
  candidate.steps[2].argv = ["true"];
  expect(await validationErrors(candidate)).toContain(
    "steps[2] must match the version 1 compiler-build step",
  );
});

test("local onboarding contract rejects an unsupported provider", async () => {
  const candidate = await contract();
  candidate.environment.provider = "remote";
  expect(await validationErrors(candidate)).toContain(
    "environment must match the version 1 local inventory",
  );
});
