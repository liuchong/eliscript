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

const source = `(defportable function-countdown (remaining count)
  (if (= remaining 0)
      count
    (recur (1- remaining) (1+ count))))

(defun loop-countdown (limit)
  (loop ((remaining limit) (count 0))
    (if (= remaining 0)
        count
      (recur (1- remaining) (1+ count)))))

(defun swap-once (left right)
  (loop ((remaining 1) (x left) (y right))
    (if (= remaining 0)
        [x y]
      (recur (1- remaining) y x))))

(defun pattern-loop (remaining)
  (loop (([left right] [1 2]) (steps remaining))
    (if (= steps 0)
        [left right]
      (recur [right left] (1- steps)))))

(defun pattern-function ([left right] remaining)
  (if (= remaining 0)
      [left right]
    (recur [right left] (1- remaining))))

(defun nested-targets (limit)
  (loop ((outer limit) (total 0))
    (if (= outer 0)
        total
      (let ((increment
             (loop ((inner 2) (subtotal 0))
               (if (= inner 0)
                   subtotal
                 (recur (1- inner) (+ subtotal outer))))))
        (recur (1- outer) (+ total increment))))))

(defun conditional-tail (remaining count)
  (cond
    ((= remaining 0) count)
    ((= (mod remaining 2) 0)
     (recur (1- remaining) (1+ count)))
    (t
     (progn nil (recur (1- remaining) (1+ count))))))

(defun short-circuit-tail (remaining)
  (or (= remaining 0)
      (recur (1- remaining))))

(defvar evaluation-events [])

(defun record-evaluation (value)
  (js-call evaluation-events :push value)
  value)

(defun evaluation-order ()
  (loop ((left (record-evaluation 1))
         (right (record-evaluation 2))
         (remaining 1))
    (if (= remaining 0)
        evaluation-events
      (recur (record-evaluation 3)
             (record-evaluation 4)
             (record-evaluation 0)))))

(defun optional-rest-recur (remaining &optional value &rest tail)
  (if (= remaining 0)
      [value tail]
    (recur (1- remaining) (1+ value) (cons value tail))))

(defun combined-tail-positions (remaining)
  (if (= remaining 0)
      0
    (let* ((next (1- remaining)))
      (and t
        (when t
          (unless false
            (recur next)))))))

(defun loop-inside-try (remaining)
  (try
    (loop ((current remaining))
      (if (= current 0)
          current
        (recur (1- current))))
    (finally nil)))

(defasync async-countdown (remaining count)
  (if (= remaining 0)
      count
    (recur (1- remaining) (+ count (await 1)))))

(export function-countdown loop-countdown swap-once pattern-loop
        pattern-function nested-targets conditional-tail
        short-circuit-tail evaluation-order optional-rest-recur
        combined-tail-positions loop-inside-try async-countdown)
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

test("loop/recur is stack-safe and identical after self-hosting", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-recur-"));
  try {
    const compilerDirectory = resolve(directory, "compiler");
    const sourcePath = resolve(directory, "recur.eli");
    const outputPath = resolve(directory, "recur.mjs");
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
    expect(seedJavaScript).toContain(": while (true)");
    expect(seedJavaScript).toContain("continue __eliscript_value_");

    const module = await import(`${pathToFileURL(outputPath).href}?bun`);
    expect(module.function_countdown(1_000_000, 0)).toBe(1_000_000);
    expect(module.loop_countdown(1_000_000)).toBe(1_000_000);
    expect(module.swap_once(1, 2)).toEqual([2, 1]);
    expect(module.pattern_loop(1)).toEqual([2, 1]);
    expect(module.pattern_function([1, 2], 1)).toEqual([2, 1]);
    expect(module.nested_targets(100)).toBe(10_100);
    expect(module.conditional_tail(100_000, 0)).toBe(100_000);
    expect(module.short_circuit_tail(100_000)).toBe(true);
    expect(module.evaluation_order()).toEqual([1, 2, 3, 4, 0]);
    expect(module.optional_rest_recur(2, 10, 99))
      .toEqual([12, [11, 10, 99]]);
    expect(module.combined_tail_positions(100_000)).toBe(0);
    expect(module.loop_inside_try(100_000)).toBe(0);
    expect(await module.async_countdown(5_000, 0)).toBe(5_000);

    const nodeCheck = [
      `import(${JSON.stringify(pathToFileURL(outputPath).href)})`,
      ".then(async (m) => {",
      "if (m.function_countdown(1000000, 0) !== 1000000) process.exit(1);",
      "if (m.loop_countdown(1000000) !== 1000000) process.exit(1);",
      "if (await m.async_countdown(5000, 0) !== 5000) process.exit(1);",
      "})",
    ].join("");
    await run(["node", "--eval", nodeCheck]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
