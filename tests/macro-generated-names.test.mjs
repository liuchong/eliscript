import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectDirectory = resolve(import.meta.dir, "..");
const buildPath = resolve(projectDirectory, "bin/eliscript-bootstrap");
const seedCliPath = resolve(projectDirectory, "bin/eliscript");
const portableCliPath = resolve(projectDirectory, "bin/eliscript-portable");
const emacs = process.env.EMACS ?? "emacs";

const source = `(defvar calls 0)

(defun reset-calls () (setq calls 0))

(defun counted (value)
  (setq calls (1+ calls))
  value)

(defmacro once (form)
  \`(let ((value$ ,form)) value$))

(defun source-collision (value$G1)
  [(once (counted (+ value$G1 1))) calls])

(defmacro duplicate-once (form)
  \`(let ((result$ ,form)) [result$ result$]))

(defun duplicate-value (value)
  (duplicate-once (counted value)))

(defmacro names-after-intern ()
  (let ((reserved (intern (concat "slot" "$G4")))
        (generated (gensym "slot")))
    \`(list ',reserved ',generated)))

(defconst generated-names (names-after-intern))

(defmacro safe-pair (left right)
  (let ((left-name (gensym "slot"))
        (right-name (gensym 'slot)))
    \`(let ((,left-name ,left)
            (,right-name ,right))
       [,left-name ,right-name])))

(defun explicit-pair (slot$G6 slot$G7)
  (safe-pair slot$G6 slot$G7))

(defmacro default-generated-name ()
  (let ((name (gensym))) \`(quote ,name)))

(defconst default-name (default-generated-name))

(defmacro capture-target (value)
  \`(setq target ,value))

(defun deliberate-capture (target)
  (capture-target (+ target 1))
  target)

(defconst quoted-marker 'value$)

(export reset-calls source-collision duplicate-value generated-names
        explicit-pair default-name deliberate-capture quoted-marker)
`;

async function run(command, options = {}) {
  const child = Bun.spawn(command, {
    cwd: projectDirectory,
    stdout: "pipe",
    stderr: "pipe",
    ...options,
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() ||
      `${command[0]} exited with ${exitCode}`);
  }
  return stdout;
}

test("macro-generated names are deterministic and capture-safe", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-gensym-"));
  try {
    const compilerDirectory = resolve(directory, "compiler");
    const sourcePath = resolve(directory, "generated-names.eli");
    const outputPath = resolve(directory, "generated-names.mjs");
    const mapPath = `${outputPath}.map`;
    await writeFile(sourcePath, source);
    await run([buildPath], {
      env: {
        ...process.env,
        EMACS: emacs,
        ELISCRIPT_BOOTSTRAP_OUT_DIR: compilerDirectory,
      },
    });

    await run([
      seedCliPath,
      "--output",
      outputPath,
      "--source-map",
      sourcePath,
    ], { env: { ...process.env, EMACS: emacs } });
    const seedJavaScript = await readFile(outputPath, "utf8");
    const seedSourceMap = await readFile(mapPath, "utf8");

    await run([
      portableCliPath,
      "--output",
      outputPath,
      "--source-map",
      sourcePath,
    ], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: compilerDirectory,
      },
    });
    expect(await readFile(outputPath, "utf8")).toBe(seedJavaScript);
    expect(await readFile(mapPath, "utf8")).toBe(seedSourceMap);

    expect(seedJavaScript).toContain("((value$G2) =>");
    expect(seedJavaScript).toContain("((result$G3) =>");
    expect(seedJavaScript).toContain('["slot$G4", "slot$G5"]');
    expect(seedJavaScript).not.toContain("((value$G1) =>");

    const module = await import(`${pathToFileURL(outputPath).href}?bun`);
    expect(module.source_collision(7)).toEqual([8, 1]);
    module.reset_calls();
    expect(module.duplicate_value(9)).toEqual([9, 9]);
    expect(module.generated_names).toEqual(["slot$G4", "slot$G5"]);
    expect(module.explicit_pair(10, 20)).toEqual([10, 20]);
    expect(module.default_name).toBe("G$G10");
    expect(module.deliberate_capture(4)).toBe(5);
    expect(module.quoted_marker).toBe("value$");

    const nodeCheck = [
      `import(${JSON.stringify(pathToFileURL(outputPath).href)})`,
      ".then((m) => {",
      "if (JSON.stringify(m.source_collision(7)) !== '[8,1]') process.exit(1);",
      "m.reset_calls();",
      "if (JSON.stringify(m.duplicate_value(9)) !== '[9,9]') process.exit(1);",
      "if (JSON.stringify(m.generated_names) !== '[\"slot$G4\",\"slot$G5\"]') process.exit(1);",
      "if (m.default_name !== 'G$G10') process.exit(1);",
      "if (m.deliberate_capture(4) !== 5) process.exit(1);",
      "})",
    ].join("");
    await run(["node", "--eval", nodeCheck]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
