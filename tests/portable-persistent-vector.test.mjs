import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectDirectory = resolve(import.meta.dir, "..");
const compiler = resolve(projectDirectory, "bin/eliscript");
const bootstrapBuilder = resolve(projectDirectory, "bin/eliscript-bootstrap");
const portableCompiler = resolve(projectDirectory, "bin/eliscript-portable");
const emacs = process.env.EMACS ?? "emacs";

async function runSuccessful(command, extraEnvironment = {}) {
  const child = Bun.spawn(command, {
    cwd: projectDirectory,
    env: { ...process.env, EMACS: emacs, ...extraEnvironment },
    stdout: "pipe",
    stderr: "pipe",
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

function nodeCount(node, level) {
  if (node == null) return 0;
  let count = 1;
  if (level > 0) {
    for (const child of node.slots) {
      count += nodeCount(child, level - 5);
    }
  }
  return count;
}

function sharedNodeCount(left, right, level) {
  if (left == null || right == null) return 0;
  if (left === right) return nodeCount(left, level);
  if (level === 0) return 0;
  let count = 0;
  const width = Math.max(left.slots.length, right.slots.length);
  for (let index = 0; index < width; index += 1) {
    count += sharedNodeCount(
      left.slots[index],
      right.slots[index],
      level - 5,
    );
  }
  return count;
}

function nextRandom(state) {
  let value = state.value;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.value = value >>> 0;
  return state.value;
}

test("Eliscript-authored persistent vector compiles and agrees across hosts", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-portable-vector-"));
  const source = resolve(projectDirectory, "stdlib/persistent-vector.eli");
  const hostFixture = resolve(
    projectDirectory,
    "tests/fixtures/portable-vector-host.mjs",
  );
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedModule = resolve(seedDirectory, "persistent-vector.mjs");
  const selfHostedModule = resolve(
    selfHostedDirectory,
    "persistent-vector.mjs",
  );

  try {
    await Promise.all([
      mkdir(seedDirectory, { recursive: true }),
      mkdir(selfHostedDirectory, { recursive: true }),
    ]);
    await runSuccessful([
      compiler,
      "--source-map",
      "--output",
      seedModule,
      source,
    ]);
    await runSuccessful([bootstrapBuilder], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrapDirectory,
    });
    await runSuccessful([
      portableCompiler,
      "--source-map",
      "--output",
      selfHostedModule,
      source,
    ], {
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory,
    });

    expect(await Bun.file(selfHostedModule).text())
      .toBe(await Bun.file(seedModule).text());
    expect(await Bun.file(`${selfHostedModule}.map`).text())
      .toBe(await Bun.file(`${seedModule}.map`).text());

    const hostReports = [];
    for (const host of ["bun", process.env.NODE ?? "node"]) {
      for (const compiledModule of [seedModule, selfHostedModule]) {
        hostReports.push(JSON.parse(await runSuccessful([
          host,
          hostFixture,
          compiledModule,
        ])));
      }
    }
    for (const report of hostReports) {
      expect(report).toEqual(hostReports[0]);
    }
    expect(hostReports[0]).toMatchObject({
      persistent: true,
      count: 100_000,
      probes: [0, 31, 32, 1024, 32768, 99999],
      original: 54_321,
      updated: "updated",
      popped: 99_999,
      sum: 4_999_950_000,
    });
    expect(hostReports[0].sharedNodes)
      .toBe(hostReports[0].expectedSharedNodes);

    const sourceMap = await Bun.file(`${seedModule}.map`).json();
    expect(sourceMap.sourcesContent).toHaveLength(1);
    expect(sourceMap.sourcesContent[0])
      .toContain("(defportable persistent-vector-conj");
    expect(sourceMap.mappings.length).toBeGreaterThan(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("Eliscript-authored persistent vector preserves generated history", async () => {
  const modulePath = resolve(
    projectDirectory,
    "dist/stdlib/persistent-vector.mjs",
  );
  await runSuccessful([
    compiler,
    "--output",
    modulePath,
    resolve(projectDirectory, "stdlib/persistent-vector.eli"),
  ]);
  const vectorModule = await import(
    `${pathToFileURL(modulePath).href}?generated-history=${Date.now()}`
  );
  const {
    empty_persistent_vector: emptyPersistentVector,
    persistent_vector_count: persistentVectorCount,
    persistent_vector_nth: persistentVectorNth,
    persistent_vector_conj: persistentVectorConj,
    persistent_vector_assoc: persistentVectorAssoc,
    persistent_vector_pop: persistentVectorPop,
    persistent_vector_peek: persistentVectorPeek,
    persistent_vector_to_array: persistentVectorToArray,
    persistent_vector_from_array: persistentVectorFromArray,
  } = vectorModule;
  const random = { value: 0x51f15e };
  let vector = emptyPersistentVector();
  let model = [];

  expect(persistentVectorNth(vector, 0, "missing")).toBe("missing");
  expect(persistentVectorPeek(vector, "empty")).toBe("empty");
  expect(persistentVectorPop(vector)).toBeNull();
  expect(persistentVectorAssoc(vector, -1, "invalid")).toBeNull();
  expect(persistentVectorAssoc(vector, 1.5, "invalid")).toBeNull();

  for (let step = 0; step < 20_000; step += 1) {
    const previousVector = vector;
    const previousModel = model;
    const choice = nextRandom(random) % 10;
    if (choice < 5 || model.length === 0) {
      const value = nextRandom(random);
      vector = persistentVectorConj(vector, value);
      model = [...model, value];
    } else if (choice < 8) {
      const index = nextRandom(random) % model.length;
      const value = nextRandom(random);
      vector = persistentVectorAssoc(vector, index, value);
      model = model.slice();
      model[index] = value;
    } else if (choice === 8) {
      const value = nextRandom(random);
      vector = persistentVectorAssoc(vector, model.length, value);
      model = [...model, value];
    } else {
      vector = persistentVectorPop(vector);
      model = model.slice(0, -1);
    }

    expect(persistentVectorCount(vector)).toBe(model.length);
    expect(persistentVectorCount(previousVector)).toBe(previousModel.length);
    if (model.length > 0) {
      const probe = nextRandom(random) % model.length;
      expect(persistentVectorNth(vector, probe, "missing"))
        .toBe(model[probe]);
    }
    if (previousModel.length > 0) {
      const probe = nextRandom(random) % previousModel.length;
      expect(persistentVectorNth(previousVector, probe, "missing"))
        .toBe(previousModel[probe]);
    }
  }

  expect(persistentVectorToArray(vector)).toEqual(model);
  expect(persistentVectorToArray(persistentVectorFromArray(model)))
    .toEqual(model);
}, 30_000);

test("Eliscript-authored persistent vector keeps million-value trie bounds", async () => {
  const modulePath = resolve(
    projectDirectory,
    "dist/stdlib/persistent-vector.mjs",
  );
  const vectorModule = await import(
    `${pathToFileURL(modulePath).href}?million=${Date.now()}`
  );
  const {
    empty_persistent_vector: emptyPersistentVector,
    persistent_vector_nth: persistentVectorNth,
    persistent_vector_conj: persistentVectorConj,
    persistent_vector_assoc: persistentVectorAssoc,
  } = vectorModule;
  let vector = emptyPersistentVector();
  for (let value = 0; value < 1_000_000; value += 1) {
    vector = persistentVectorConj(vector, value);
  }

  expect(vector).toMatchObject({ count: 1_000_000, shift: 15 });
  expect(vector.tail).toHaveLength(32);
  for (const index of [0, 31, 32, 1024, 32768, 500000, 999999]) {
    expect(persistentVectorNth(vector, index, "missing")).toBe(index);
  }

  const updated = persistentVectorAssoc(vector, 500_000, -1);
  const depth = 1 + vector.shift / 5;
  const nodes = nodeCount(vector.root, vector.shift);
  expect(sharedNodeCount(vector.root, updated.root, vector.shift))
    .toBe(nodes - depth);
  expect(persistentVectorNth(vector, 500_000, "missing")).toBe(500_000);
  expect(persistentVectorNth(updated, 500_000, "missing")).toBe(-1);
}, 30_000);
