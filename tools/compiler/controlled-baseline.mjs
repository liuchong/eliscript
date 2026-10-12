import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Read a complete definition, respecting strings and comments instead of
// using a regular expression to guess where nested Lisp forms end.
export function definition(source, name) {
  const prefix = `(defun ${name}`;
  const start = source.indexOf(prefix);
  if (start < 0 || source.indexOf(prefix, start + prefix.length) !== -1) {
    throw new Error(`expected exactly one definition of ${name}`);
  }
  let depth = 0;
  let quoted = false;
  let comment = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (comment) {
      if (character === "\n") comment = false;
    } else if (quoted) {
      if (character === "\\") index += 1;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === ";") comment = true;
    else if (character === "(") depth += 1;
    else if (character === ")" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated definition of ${name}`);
}

// This is a controlled reacceptance, not a claim that a historical checkout
// emits today's JS. All modules share today's source/code generator except
// the named functions restored verbatim from the pinned historical revision.
export async function buildControlledBaseline({ root, baselineRoot, revision, sources, target, names }) {
  const historical = Bun.spawnSync(["git", "-C", baselineRoot, "show", `${revision}:${target}`]);
  if (historical.exitCode !== 0) throw new Error(new TextDecoder().decode(historical.stderr));
  const historicalSource = new TextDecoder().decode(historical.stdout);
  let controlSource = await readFile(path.join(root, target), "utf8");
  const restored = names.map((name) => {
    const original = definition(historicalSource, name);
    controlSource = controlSource.replace(definition(controlSource, name), () => original);
    return { name, sha256: sha256(original) };
  });
  const bootstrap = Bun.spawn([path.join(root, "bin/eliscript-bootstrap")], {
    cwd: root, stdout: "pipe", stderr: "pipe",
  });
  const [buildStatus, buildErrors] = await Promise.all([bootstrap.exited, new Response(bootstrap.stderr).text()]);
  if (buildStatus !== 0) throw new Error(buildErrors);
  const directory = path.join(root, "dist/compiler-controls", path.basename(target, ".eli"));
  await mkdir(directory, { recursive: true });
  const inputs = [];
  const artifacts = [];
  for (const relative of sources) {
    const name = path.basename(relative, ".eli");
    inputs.push({ path: relative, sha256: sha256(await readFile(path.join(root, relative))) });
    for (const suffix of [".mjs", ".mjs.map"]) {
      await copyFile(path.join(root, "dist/bootstrap", name + suffix), path.join(directory, name + suffix));
    }
  }
  const sourceFile = path.join(directory, path.basename(target));
  await writeFile(sourceFile, controlSource);
  const output = path.join(directory, `${path.basename(target, ".eli")}.mjs`);
  const compiler = Bun.spawn([path.join(root, "bin/eliscript-seed"), "--source-map", "--output", output, sourceFile], {
    cwd: root, stdout: "pipe", stderr: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([compiler.exited, new Response(compiler.stderr).text()]);
  if (exitCode !== 0) throw new Error(stderr);
  for (const relative of sources) {
    const file = `${path.basename(relative, ".eli")}.mjs`;
    artifacts.push({ file,
      treatment: sha256(await readFile(path.join(root, "dist/bootstrap", file))),
      control: sha256(await readFile(path.join(directory, file))),
    });
  }
  return { directory, evidence: {
    mode: "current-compiler-with-historical-functions",
    target, historicalSourceSha256: sha256(historicalSource), restored,
    controlSourceSha256: sha256(controlSource), inputs, artifacts,
  } };
}

export function validateControlledBaseline(evidence, target, names, sources) {
  const hash = (value) => /^[0-9a-f]{64}$/u.test(value ?? "");
  if (evidence?.mode !== "current-compiler-with-historical-functions" ||
      evidence.target !== target || !hash(evidence.historicalSourceSha256) ||
      !hash(evidence.controlSourceSha256) ||
      JSON.stringify(evidence.restored?.map((item) => item.name)) !== JSON.stringify(names) ||
      !evidence.restored.every((item) => hash(item.sha256)) ||
      JSON.stringify(evidence.inputs?.map((item) => item.path)) !== JSON.stringify(sources) ||
      !evidence.inputs.every((item) => hash(item.sha256)) ||
      evidence.artifacts?.length !== sources.length ||
      !evidence.artifacts.every((item, index) => item.file === `${path.basename(sources[index], ".eli")}.mjs` &&
        hash(item.treatment) && hash(item.control) &&
        (sources[index] === target ? item.treatment !== item.control : item.treatment === item.control))) {
    throw new TypeError("invalid controlled compiler baseline evidence");
  }
}
