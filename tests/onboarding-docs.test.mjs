import { expect, test } from "bun:test";
import {
  cp,
  mkdtemp,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  checkDocumentation,
  DocumentationValidationError,
} from "../tools/documentation/check.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLE = path.join(ROOT, "examples/getting-started");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

async function documentationErrors(contract) {
  try {
    await checkDocumentation({ root: ROOT, contract });
  } catch (error) {
    expect(error).toBeInstanceOf(DocumentationValidationError);
    return error.errors;
  }
  throw new Error("expected documentation validation to fail");
}

async function run(command, options = {}) {
  const child = Bun.spawn(command, {
    cwd: options.cwd ?? ROOT,
    env: options.env ?? process.env,
    stdin: options.stdin === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  let forceKillTimer;
  const timer = setTimeout(() => {
    child.kill("SIGTERM");
    forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
  }, options.timeoutMs ?? 15_000);
  if (options.stdin !== undefined) {
    child.stdin.write(options.stdin);
    child.stdin.end();
  }
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    const result = { exitCode, stdout, stderr };
    if (!options.allowFailure && exitCode !== 0) {
      throw new Error(stderr.trim() || stdout.trim() ||
        `${command[0]} exited with ${exitCode}`);
    }
    return result;
  } finally {
    clearTimeout(timer);
    clearTimeout(forceKillTimer);
  }
}

test("onboarding guide covers every maintained workflow and failure class", async () => {
  const report = await checkDocumentation({ root: ROOT });
  expect(report).toEqual({
    schemaVersion: 1,
    format: "eliscript-documentation-report",
    version: 2,
    documents: 11,
    sections: 72,
    requiredLiterals: 59,
    localLinks: 47,
    snippets: 5,
    executions: 8,
    entryPoints: 12,
    applicationsContribute: false,
  });

  const guide = await readFile(path.join(ROOT, "docs/getting-started.md"), "utf8");
  for (const [file, language] of [
    ["eliscript.json", "json"],
    ["src/math.eli", "elisp"],
    ["src/main.eli", "elisp"],
  ]) {
    const source = await readFile(path.join(EXAMPLE, file), "utf8");
    expect(guide).toContain(`\`\`\`${language}\n${source}\`\`\``);
  }

  const contract = await readJson("contracts/documentation.json");
  const missingSection = structuredClone(contract);
  missingSection.documents[0].requiredSections[0] = "Missing installation stage";
  expect(await documentationErrors(missingSection)).toContain(
    "docs/getting-started.md is missing section: Missing installation stage",
  );

  const reorderedSections = structuredClone(contract);
  [reorderedSections.documents[0].requiredSections[0],
    reorderedSections.documents[0].requiredSections[1]] =
    [reorderedSections.documents[0].requiredSections[1],
      reorderedSections.documents[0].requiredSections[0]];
  expect(await documentationErrors(reorderedSections)).toContain(
    "docs/getting-started.md section is out of contract order: Supported Environment",
  );

  const missingText = structuredClone(contract);
  missingText.documents[0].requiredLiterals[0] = "missing-public-command";
  expect(await documentationErrors(missingText)).toContain(
    "docs/getting-started.md is missing required text: missing-public-command",
  );

  const replacedDocument = structuredClone(contract);
  replacedDocument.documents[0].file = "docs/missing-guide.md";
  expect((await documentationErrors(replacedDocument))[0]).toContain(
    "documents must contain the exact ordered AC-23 core inventory",
  );

  const missingEntryPoint = structuredClone(contract);
  missingEntryPoint.entryPoints[0].literal = "missing-guide-link";
  expect(await documentationErrors(missingEntryPoint)).toContain(
    "README.md is missing documentation entry point: missing-guide-link",
  );
});

test("core documentation rejects broken links and changed executable snippets", async () => {
  const languageFile = "docs/language-reference.md";
  const language = await readFile(path.join(ROOT, languageFile), "utf8");
  await expect(checkDocumentation({
    root: ROOT,
    sourceOverrides: {
      [languageFile]: `${language}\n[missing](missing-reference.md)\n`,
    },
  })).rejects.toThrow(
    `${languageFile} has broken local link: missing-reference.md`,
  );

  await expect(checkDocumentation({
    root: ROOT,
    sourceOverrides: {
      [languageFile]: language.replace("(nth 1 values)", "(nth 0 values)"),
    },
  })).rejects.toThrow("language-values/bun failed");
});

test("core documentation rejects application inventory substitution", async () => {
  const contract = await readJson("contracts/documentation.json");
  contract.documents[1].file = "examples/README.md";
  expect(await documentationErrors(contract)).toContain(
    "documents must contain the exact ordered AC-23 core inventory",
  );
});

test("documented checkout project workflow and editor setup execute end to end", async () => {
  const temporaryRoot = await realpath(await mkdtemp(
    path.join(os.tmpdir(), "eliscript-onboarding-"),
  ));
  const project = path.join(temporaryRoot, "hello-eliscript");
  const sourceRoot = path.join(project, "src");
  const command = (name) => path.join(ROOT, "bin", name);
  try {
    await cp(EXAMPLE, project, { recursive: true });

    const mathSource = await readFile(path.join(sourceRoot, "math.eli"), "utf8");
    const mainSource = await readFile(path.join(sourceRoot, "main.eli"), "utf8");
    expect((await run([
      command("eliscript-format"), "src/math.eli",
    ], { cwd: project })).stdout).toBe(mathSource);
    expect((await run([
      command("eliscript-format"), "src/main.eli",
    ], { cwd: project })).stdout).toBe(mainSource);
    await run([command("eliscript-format"), "--check", "src/math.eli"], {
      cwd: project,
    });
    await run([command("eliscript-format"), "--check", "src/main.eli"], {
      cwd: project,
    });

    const checked = await run([
      command("eliscript-check"), "--json", "--config", "eliscript.json",
    ], { cwd: project });
    const checkReport = JSON.parse(checked.stdout);
    expect(checkReport.format).toBe("eliscript-check-report");
    expect(checkReport.modules.map((module) => module.source)).toEqual([
      "main.eli",
      "math.eli",
    ]);

    const built = await run([
      command("eliscript-build"), "--json", "--config", "eliscript.json",
    ], { cwd: project });
    const buildReport = JSON.parse(built.stdout);
    expect(buildReport.format).toBe("eliscript-build-report");
    expect(buildReport.entryOutput).toBe("main.mjs");
    expect((await run(["bun", "run", "dist/main.mjs"], {
      cwd: project,
    })).stdout.trim()).toBe("42");

    const nodeBuild = await run([
      command("eliscript-build"), "--no-cache", "--config", "eliscript.json",
      "--out-dir", "dist-node",
    ], {
      cwd: project,
      env: { ...process.env, ELISCRIPT_JS_RUNTIME: "node" },
    });
    expect(nodeBuild.stdout.trim()).toBe(path.join(project, "dist-node/main.mjs"));
    expect((await run(["node", "dist-node/main.mjs"], {
      cwd: project,
    })).stdout.trim()).toBe("42");

    const diagnostic = await run([
      command("eliscript-check"), "--json", "--config", "eliscript.json",
      "--stdin-file", path.join(sourceRoot, "main.eli"),
      "--diagnostic-format", "json",
    ], {
      cwd: project,
      stdin: "(module hello.main (print missing))\n",
      allowFailure: true,
    });
    expect(diagnostic.exitCode).not.toBe(0);
    expect(JSON.parse(diagnostic.stderr).code).toBe("ELI-A0001");

    const evaluation = JSON.parse((await run([
      command("eliscript-eval"), "--eval", "(+ 20 22)",
      "--root", project, "--json",
    ])).stdout);
    expect(evaluation).toMatchObject({
      format: "eliscript-evaluation-result",
      status: "ok",
      value: "42",
    });
    expect((await run([
      command("eliscript-eval"), "--repl", "--root", project, "--no-prompt",
    ], {
      stdin: "(defconst answer 42)\nanswer\n:quit\n",
    })).stdout).toBe("42\n42\n");

    const editor = path.join(ROOT, "editor");
    const emacsExpression = [
      "(progn",
      ` (add-to-list 'load-path ${JSON.stringify(editor)})`,
      " (require 'eliscript-mode)",
      " (with-temp-buffer",
      "   (setq buffer-file-name \"example.eli\")",
      "   (set-auto-mode)",
      "   (unless (eq major-mode 'eliscript-mode)",
      "     (error \"Eliscript auto mode is not registered\"))))",
    ].join("");
    await run(["emacs", "--batch", "-Q", "--eval", emacsExpression]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 30_000);
