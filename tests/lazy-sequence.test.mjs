import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import {
  boundedCount,
  isCollection,
  isSequence,
  isSequential,
  reduce,
  seq,
  sequenceView,
  unboundedSequenceView,
} from "../runtime/core/collection.mjs";
import {
  isLazySequence,
  isLazySequenceRealized,
  lazyCons,
  lazyDedupe,
  lazyDistinct,
  lazyDrop,
  lazyDropWhile,
  lazyFilter,
  lazyInterpose,
  lazyKeep,
  lazyKeepIndexed,
  lazyMap,
  lazyMapcat,
  lazyMapIndexed,
  lazyPartitionAll,
  lazyPartitionBy,
  lazyRemove,
  lazySequence,
  lazyTake,
  lazyTakeNth,
  lazyTakeWhile,
  realizeLazySequence,
  realizedLazySequenceCount,
} from "../runtime/core/lazy-sequence.mjs";
import {
  first as sequenceFirst,
  next as sequenceNext,
  rest as sequenceRest,
} from "../runtime/core/sequence.mjs";
import {
  composeTransducers,
  filtering,
  interposing,
  mapping,
  partitioningAll,
  sequence,
  taking,
} from "../runtime/core/transducer.mjs";

const root = resolve(import.meta.dir, "..");
const seedCompiler = resolve(root, "bin/eliscript-seed");
const bootstrapBuilder = resolve(root, "bin/eliscript-bootstrap");
const portableCompiler = resolve(root, "bin/eliscript-portable");
const hostFixture = resolve(root, "tests/fixtures/lazy-sequence-host.mjs");
const bunPreload = resolve(root, "tests/fixtures/compiled-eli-bun-preload.mjs");
const nodeLoader = resolve(root, "tests/fixtures/compiled-eli-node-loader.mjs");
const emacs = process.env.EMACS ?? "emacs";
const compilationUnits = [
  ["stdlib/core/lazy-sequence.eli", "stdlib/core/lazy-sequence.eli"],
  ["stdlib/core/transducer.eli", "stdlib/core/transducer.eli"],
  ["tests/fixtures/lazy-sequence.eli", "tests/fixtures/lazy-sequence.mjs"],
];

async function runSuccessful(command, extraEnvironment = {}) {
  const child = Bun.spawn(command, {
    cwd: root,
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

async function compile(command, source, output, environment = {}) {
  await mkdir(dirname(output), { recursive: true });
  await runSuccessful([
    command,
    "--source-map",
    "--output",
    output,
    source,
  ], environment);
}

async function compileFamily(command, outputRoot, environment = {}) {
  await mkdir(outputRoot, { recursive: true });
  await symlink(resolve(root, "runtime"), resolve(outputRoot, "runtime"), "dir");
  for (const [source, output] of compilationUnits) {
    await compile(
      command,
      resolve(root, source),
      resolve(outputRoot, output),
      environment,
    );
  }
}

function captureFailure(operation) {
  try {
    operation();
    return { caught: false, value: null };
  } catch (error) {
    return { caught: true, value: error };
  }
}

test("lazy sequences start on demand and share one realized prefix", () => {
  let starts = 0;
  let pulls = 0;
  const source = lazySequence(() => {
    starts += 1;
    return sequenceView(() => (function* values() {
      for (const value of [10, 20, 30]) {
        pulls += 1;
        yield value;
      }
    })(), 3);
  });

  expect(isLazySequence(source)).toBe(true);
  expect(isLazySequenceRealized(source)).toBe(false);
  expect(realizedLazySequenceCount(source)).toBe(0);
  expect(isCollection(source)).toBe(true);
  expect(isSequential(source)).toBe(true);
  expect(isSequence(source)).toBe(true);

  const left = source[Symbol.iterator]();
  const right = source[Symbol.iterator]();
  expect(left.next()).toEqual({ value: 10, done: false });
  expect([starts, pulls, realizedLazySequenceCount(source)]).toEqual([1, 1, 1]);
  expect(right.next()).toEqual({ value: 10, done: false });
  expect([starts, pulls]).toEqual([1, 1]);
  expect(left.next()).toEqual({ value: 20, done: false });
  expect(right.next()).toEqual({ value: 20, done: false });
  expect(pulls).toBe(2);
  expect(sequenceFirst(source)).toBe(10);
  expect([...sequenceRest(source)]).toEqual([20, 30]);
  expect([...sequenceNext(source)]).toEqual([20, 30]);

  expect(realizeLazySequence(source)).toBe(source);
  expect([...source]).toEqual([10, 20, 30]);
  expect([starts, pulls, realizedLazySequenceCount(source)]).toEqual([1, 3, 3]);
  expect(reduce(source, (sum, value) => sum + value, 0)).toBe(60);
});

test("lazy sequence failures are cached at one stable realization position", () => {
  const failure = new Error("lazy failure");
  let starts = 0;
  const source = lazySequence(() => {
    starts += 1;
    return sequenceView(() => (function* values() {
      yield "ready";
      throw failure;
    })());
  });
  const first = source[Symbol.iterator]();
  const second = source[Symbol.iterator]();
  expect(first.next().value).toBe("ready");
  expect(() => first.next()).toThrow(failure);
  expect(second.next().value).toBe("ready");
  expect(() => second.next()).toThrow(failure);
  expect(starts).toBe(1);

  let producerStarts = 0;
  const producerFailure = new Error("producer failure");
  const failedProducer = lazySequence(() => {
    producerStarts += 1;
    throw producerFailure;
  });
  expect(() => seq(failedProducer)).toThrow(producerFailure);
  expect(() => seq(failedProducer)).toThrow(producerFailure);
  expect(producerStarts).toBe(1);

  let nullStarts = 0;
  const nullFailure = lazySequence(() => {
    nullStarts += 1;
    throw null;
  });
  expect(captureFailure(() => seq(nullFailure)))
    .toEqual({ caught: true, value: null });
  expect(captureFailure(() => seq(nullFailure)))
    .toEqual({ caught: true, value: null });
  expect(nullStarts).toBe(1);

  const undefinedFailure = lazySequence(() => sequenceView(() => {
    let step = 0;
    return {
      next() {
        if (step === 0) {
          step += 1;
          return { value: "ready", done: false };
        }
        throw undefined;
      },
      [Symbol.iterator]() {
        return this;
      },
    };
  }, 2));
  const undefinedFirst = undefinedFailure[Symbol.iterator]();
  const undefinedSecond = undefinedFailure[Symbol.iterator]();
  expect(undefinedFirst.next().value).toBe("ready");
  expect(captureFailure(() => undefinedFirst.next()))
    .toEqual({ caught: true, value: undefined });
  expect(undefinedSecond.next().value).toBe("ready");
  expect(captureFailure(() => undefinedSecond.next()))
    .toEqual({ caught: true, value: undefined });
});

test("lazy cons defers tails and remains stack safe for recursive streams", () => {
  let tails = 0;
  const naturals = (value) => lazyCons(value, () => {
    tails += 1;
    return naturals(value + 1);
  });
  const source = naturals(0);
  const iterator = source[Symbol.iterator]();
  expect(tails).toBe(0);
  expect(iterator.next().value).toBe(0);
  expect(tails).toBe(0);
  expect(iterator.next().value).toBe(1);
  expect(tails).toBe(1);
  expect(boundedCount(100_000, source)).toBe(100_000);
  expect(realizedLazySequenceCount(source)).toBe(100_000);
  expect(tails).toBe(99_999);
});

test("transducer sequence pulls only enough input and memoizes output", () => {
  let starts = 0;
  let pulls = 0;
  const input = lazySequence(() => {
    starts += 1;
    return unboundedSequenceView(() => (function* values() {
      let value = 1;
      while (true) {
        pulls += 1;
        yield value;
        value += 1;
      }
    })());
  });
  const output = sequence(
    composeTransducers(
      mapping((value) => value * 2),
      filtering((value) => value % 4 === 0),
      taking(3),
    ),
    input,
  );
  expect([starts, pulls]).toEqual([0, 0]);
  const first = output[Symbol.iterator]();
  const second = output[Symbol.iterator]();
  expect(first.next().value).toBe(4);
  expect([starts, pulls]).toEqual([1, 2]);
  expect(second.next().value).toBe(4);
  expect(pulls).toBe(2);
  expect([...output]).toEqual([4, 8, 12]);
  expect(pulls).toBe(6);
  expect(realizedLazySequenceCount(input)).toBe(6);
});

test("transducer sequence honors zero input and completion output", () => {
  let starts = 0;
  const input = lazySequence(() => {
    starts += 1;
    return [1, 2, 3];
  });
  const empty = sequence(taking(0), input);
  expect(seq(empty)).toBeNull();
  expect(starts).toBe(0);

  const groups = sequence(partitioningAll(3), [1, 2, 3, 4, 5]);
  expect([...groups].map((group) => [...group])).toEqual([
    [1, 2, 3],
    [4, 5],
  ]);
  expect([...groups].map((group) => [...group])).toEqual([
    [1, 2, 3],
    [4, 5],
  ]);
  expect([...sequence(interposing("|"), [1, 2, 3])])
    .toEqual([1, "|", 2, "|", 3]);
});

test("transducer sequence closes its input when transformation fails", () => {
  const failure = new Error("transform failure");
  let closed = 0;
  const input = sequenceView(() => (function* values() {
    try {
      yield 1;
      yield 2;
    } finally {
      closed += 1;
    }
  })(), 2);
  const output = sequence(mapping((value) => {
    if (value === 2) throw failure;
    return value;
  }), input);
  const first = output[Symbol.iterator]();
  expect(first.next().value).toBe(1);
  expect(() => first.next()).toThrow(failure);
  expect(closed).toBe(1);
  const second = output[Symbol.iterator]();
  expect(second.next().value).toBe(1);
  expect(() => second.next()).toThrow(failure);
  expect(closed).toBe(1);
});

test("lazy combinators compose infinite inputs without eager realization", () => {
  let starts = 0;
  let pulls = 0;
  const source = lazySequence(() => {
    starts += 1;
    return unboundedSequenceView(() => (function* naturals() {
      let value = 1;
      while (true) {
        pulls += 1;
        yield value;
        value += 1;
      }
    })());
  });
  const output = lazyTake(
    3,
    lazyFilter(
      (value) => value % 2 === 0,
      lazyMap((value) => value * 3, source),
    ),
  );

  expect(isLazySequence(output)).toBe(true);
  expect([starts, pulls]).toEqual([0, 0]);
  const first = output[Symbol.iterator]();
  const second = output[Symbol.iterator]();
  expect(first.next()).toEqual({ value: 6, done: false });
  expect([starts, pulls]).toEqual([1, 2]);
  expect(second.next()).toEqual({ value: 6, done: false });
  expect(pulls).toBe(2);
  expect([...output]).toEqual([6, 12, 18]);
  expect(pulls).toBe(6);
});

test("lazy combinator family preserves transducer semantics", () => {
  expect([...lazyMapIndexed((index, value) => index + value, [10, 20, 30])])
    .toEqual([10, 21, 32]);
  expect([...lazyKeep((value) => value % 2 === 0 ? value * 10 : null,
    [1, 2, 3, 4])]).toEqual([20, 40]);
  expect([...lazyKeepIndexed((index, value) => index % 2 === 0 ? value : null,
    [10, 20, 30, 40])]).toEqual([10, 30]);
  expect([...lazyRemove((value) => value % 2 === 0, [1, 2, 3, 4])])
    .toEqual([1, 3]);
  expect([...lazyDrop(2, [1, 2, 3, 4])]).toEqual([3, 4]);
  expect([...lazyTakeWhile((value) => value < 4, [1, 2, 3, 4, 1])])
    .toEqual([1, 2, 3]);
  expect([...lazyDropWhile((value) => value < 3, [1, 2, 3, 1])])
    .toEqual([3, 1]);
  expect([...lazyTakeNth(2, [1, 2, 3, 4, 5])]).toEqual([1, 3, 5]);
  expect([...lazyInterpose("|", [1, 2, 3])]).toEqual([1, "|", 2, "|", 3]);
  expect([...lazyDedupe([1, 1, 2, 1, 1])]).toEqual([1, 2, 1]);
  expect([...lazyDistinct([1, 2, 1, 3, 2])]).toEqual([1, 2, 3]);
  expect([...lazyMapcat((value) => [value, value * 10], [1, 2])])
    .toEqual([1, 10, 2, 20]);
  expect([...lazyPartitionAll(2, [1, 2, 3])].map((group) => [...group]))
    .toEqual([[1, 2], [3]]);
  expect([...lazyPartitionBy((value) => value % 2, [1, 3, 2, 4, 5])]
    .map((group) => [...group])).toEqual([[1, 3], [2, 4], [5]]);
});

test("lazy combinators validate before consuming their inputs", () => {
  let starts = 0;
  const source = lazySequence(() => {
    starts += 1;
    return [1, 2, 3];
  });
  expect(seq(lazyTake(0, source))).toBeNull();
  expect(starts).toBe(0);
  expect(() => lazyMap((value) => value)).toThrow(
    "lazyMap requires exactly 2 arguments",
  );
  expect(() => lazyDedupe([], [])).toThrow(
    "lazyDedupe requires exactly 1 argument",
  );
  expect(() => lazyFilter(42, source)).toThrow("must be a function");
  expect(() => lazyTake(-1, source)).toThrow(
    "must be a non-negative safe integer",
  );
  expect(() => lazyPartitionAll(0, source)).toThrow(
    "must be a positive safe integer",
  );
  expect(starts).toBe(0);
});

test("lazy sequence APIs reject malformed producers and calls", () => {
  expect(() => lazySequence()).toThrow("requires exactly one thunk");
  expect(() => lazySequence(42)).toThrow("must be a function");
  expect(() => lazyCons(1)).toThrow("requires a value and tail thunk");
  expect(() => lazyCons(1, 2)).toThrow("must be a function");
  expect(() => sequence(mapping((value) => value))).toThrow(
    "requires a transducer and collection",
  );
  expect(() => sequence(42, [])).toThrow("must be a function");
});

test("Eliscript lazy sequences agree across compilers and local hosts", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-lazy-sequence-"));
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");
  try {
    await compileFamily(seedCompiler, seedDirectory);
    await runSuccessful([bootstrapBuilder], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrapDirectory,
    });
    await compileFamily(portableCompiler, selfHostedDirectory, {
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory,
    });

    for (const [, output] of compilationUnits) {
      expect(await Bun.file(resolve(selfHostedDirectory, output)).text())
        .toBe(await Bun.file(resolve(seedDirectory, output)).text());
      expect(await Bun.file(resolve(selfHostedDirectory, `${output}.map`)).text())
        .toBe(await Bun.file(resolve(seedDirectory, `${output}.map`)).text());
    }

    const reports = [];
    for (const outputRoot of [seedDirectory, selfHostedDirectory]) {
      const modulePath = resolve(outputRoot, "tests/fixtures/lazy-sequence.mjs");
      reports.push(JSON.parse(await runSuccessful([
        "bun", "--preload", bunPreload, hostFixture, modulePath,
      ])));
      reports.push(JSON.parse(await runSuccessful([
        process.env.NODE ?? "node",
        "--experimental-loader",
        nodeLoader,
        hostFixture,
        modulePath,
      ])));
    }
    for (const report of reports) expect(report).toEqual(reports[0]);
    expect(reports[0]).toEqual({
      before: [false, 0],
      values: [6, 12, 18, 24],
      after: [true, 4],
      groups: [[1, 2, 3], [4, 5]],
      indexed: [10, 21, 32],
      kept: [20, 40],
      "kept-indexed": [10, 30],
      removed: [1, 3],
      dropped: [3, 4],
      "taken-while": [1, 2, 3],
      "dropped-while": [3, 1],
      sampled: [1, 3, 5],
      interposed: [1, "|", 2, "|", 3],
      deduped: [1, 2, 1],
      distinct: [1, 2, 3],
      "mapped-cat": [1, 10, 2, 20],
      partitioned: [[1, 2], [3]],
      "partitioned-by": [[1, 3], [2, 4], [5]],
      predicate: true,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
