import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function targetSource(makefile, name) {
  const lines = makefile.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`${name}:`));
  if (start === -1) throw new Error(`missing Make target: ${name}`);
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[A-Za-z0-9_.-]+:/.test(line)) break;
    body.push(line);
  }
  return `${lines[start]}\n${body.join("\n")}`;
}

test("default tests retain explicit core and application partitions", async () => {
  const makefile = await readFile(path.join(ROOT, "Makefile"), "utf8");
  const packageJson = JSON.parse(await readFile(
    path.join(ROOT, "package.json"),
    "utf8",
  ));
  const aggregate = targetSource(makefile, "test");
  const core = targetSource(makefile, "test-core");
  const applications = targetSource(makefile, "test-applications");

  expect(aggregate.split("\n", 1)[0]).toBe("test: test-core test-applications");
  expect(packageJson.scripts.test).toBe("make test");
  expect(packageJson.scripts["test:core"]).toBe("make test-core");
  expect(packageJson.scripts["test:applications"]).toBe("make test-applications");

  for (const applicationTest of [
    "tests/eliscript-org-tests.el",
    "tests/vite-plugin.test.mjs",
    "tests/org-vite-plugin.test.mjs",
    "tests/application-cli-test.sh",
  ]) {
    expect(core).not.toContain(applicationTest);
    expect(applications).toContain(applicationTest);
  }
  expect(core).toContain("tests/cli-test.sh");
  expect(applications).not.toContain("tests/cli-test.sh");
});
