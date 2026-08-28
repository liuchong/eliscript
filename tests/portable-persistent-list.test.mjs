import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectDirectory = resolve(import.meta.dir, "..");
const compiler = resolve(projectDirectory, "bin/eliscript");
const bootstrapBuilder = resolve(projectDirectory, "bin/eliscript-bootstrap");
const portableCompiler = resolve(projectDirectory, "bin/eliscript-portable");
const source = resolve(projectDirectory, "stdlib/persistent-list.eli");
const generatedModule = resolve(
  projectDirectory,
  "dist/stdlib/persistent-list.mjs",
);
const emacs = process.env.EMACS ?? "emacs";
let generatedModuleBuild;

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

async function importGeneratedModule(label) {
  generatedModuleBuild ??= runSuccessful([
    compiler,
    "--output",
    generatedModule,
    source,
  ]);
  await generatedModuleBuild;
  return import(`${pathToFileURL(generatedModule).href}?${label}=${Date.now()}`);
}

function nextRandom(state) {
  let value = state.value;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.value = value >>> 0;
  return state.value;
}

test("Eliscript-authored persistent list compiles and agrees across hosts", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-portable-list-"));
  const hostFixture = resolve(
    projectDirectory,
    "tests/fixtures/portable-list-host.mjs",
  );
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedModule = resolve(seedDirectory, "persistent-list.mjs");
  const selfHostedModule = resolve(
    selfHostedDirectory,
    "persistent-list.mjs",
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

    const reports = [];
    for (const host of ["bun", process.env.NODE ?? "node"]) {
      for (const compiledModule of [seedModule, selfHostedModule]) {
        reports.push(JSON.parse(await runSuccessful([
          host,
          hostFixture,
          compiledModule,
        ])));
      }
    }
    for (const report of reports) {
      expect(report).toEqual(reports[0]);
    }
    expect(reports[0]).toEqual({
      persistent: true,
      empty: true,
      count: 1_000_000,
      first: 999_999,
      probes: [999_999, 999_968, 999_967, 998_975, 967_231, 0],
      sum: 499_999_500_000,
      restShared: true,
      popShared: true,
      reversedFirst: 0,
      reversedLast: 999_999,
      sample: ["a", "b", "c"],
    });

    const sourceMap = await Bun.file(`${seedModule}.map`).json();
    expect(sourceMap.sourcesContent).toHaveLength(1);
    expect(sourceMap.sourcesContent[0])
      .toContain("(defportable persistent-list-cons");
    expect(sourceMap.mappings.length).toBeGreaterThan(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("Eliscript-authored persistent list preserves generated history", async () => {
  const listModule = await importGeneratedModule("history");
  const {
    empty_persistent_list: emptyPersistentList,
    persistent_list_count: persistentListCount,
    persistent_list_cons: persistentListCons,
    persistent_list_conj: persistentListConj,
    persistent_list_first: persistentListFirst,
    persistent_list_rest: persistentListRest,
    persistent_list_peek: persistentListPeek,
    persistent_list_pop: persistentListPop,
    persistent_list_nth: persistentListNth,
    persistent_list_to_array: persistentListToArray,
    persistent_list_from_array: persistentListFromArray,
  } = listModule;
  const random = { value: 0x1157c0de };
  let list = emptyPersistentList();
  let model = [];

  expect(persistentListFirst(list, "empty")).toBe("empty");
  expect(persistentListRest(list, "empty")).toBe("empty");
  expect(persistentListPeek(list, "empty")).toBe("empty");
  expect(persistentListPop(list)).toBeNull();
  expect(persistentListNth(list, 0, "missing")).toBe("missing");
  expect(persistentListNth(list, 1.5, "missing")).toBe("missing");

  for (let step = 0; step < 20_000; step += 1) {
    const previousList = list;
    const previousModel = model;
    const choice = nextRandom(random) % 10;
    if (choice < 6 || model.length === 0) {
      const value = nextRandom(random);
      list = choice % 2 === 0
        ? persistentListCons(list, value)
        : persistentListConj(list, value);
      model = [...model, value];
      expect(persistentListRest(list, null)).toBe(previousList);
    } else {
      list = persistentListPop(list);
      model = model.slice(0, -1);
      expect(list).toBe(persistentListRest(previousList, null));
    }

    expect(persistentListCount(list)).toBe(model.length);
    expect(persistentListCount(previousList)).toBe(previousModel.length);
    if (model.length > 0) {
      const probe = nextRandom(random) % model.length;
      expect(persistentListNth(list, probe, "missing"))
        .toBe(model[model.length - 1 - probe]);
      expect(persistentListPeek(list, "empty"))
        .toBe(model[model.length - 1]);
    }
    if (previousModel.length > 0) {
      const probe = nextRandom(random) % previousModel.length;
      expect(persistentListNth(previousList, probe, "missing"))
        .toBe(previousModel[previousModel.length - 1 - probe]);
    }
  }

  const orderedModel = model.toReversed();
  expect(persistentListToArray(list)).toEqual(orderedModel);
  expect(persistentListToArray(persistentListFromArray(orderedModel)))
    .toEqual(orderedModel);
}, 30_000);

test("Eliscript-authored persistent list shares a million-node suffix", async () => {
  const listModule = await importGeneratedModule("million");
  const {
    empty_persistent_list: emptyPersistentList,
    persistent_list_count: persistentListCount,
    persistent_list_cons: persistentListCons,
    persistent_list_first: persistentListFirst,
    persistent_list_rest: persistentListRest,
    persistent_list_pop: persistentListPop,
    persistent_list_nth: persistentListNth,
    persistent_list_reduce: persistentListReduce,
  } = listModule;
  let list = emptyPersistentList();
  for (let value = 0; value < 1_000_000; value += 1) {
    list = persistentListCons(list, value);
  }

  const extended = persistentListCons(list, -1);
  expect(persistentListCount(list)).toBe(1_000_000);
  expect(persistentListCount(extended)).toBe(1_000_001);
  expect(persistentListFirst(list, "empty")).toBe(999_999);
  expect(persistentListNth(list, 999_999, "missing")).toBe(0);
  expect(persistentListReduce((sum, value) => sum + value, 0, list))
    .toBe(499_999_500_000);
  expect(persistentListRest(extended, null)).toBe(list);
  expect(persistentListPop(extended)).toBe(list);
}, 30_000);
