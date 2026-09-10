import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import {
  IConj,
  IEmptyable,
  IReduce,
  count,
  isReduced,
  isReductionView,
  nth,
  reduce,
  reduced,
  sequenceView,
  unreduced,
} from "../runtime/core/collection.mjs";
import {
  catting,
  completing,
  composeTransducers,
  deduping,
  distincting,
  droppingWhile,
  eduction,
  filtering,
  interposing,
  into,
  keeping,
  keepingIndexed,
  mapcatting,
  mapping,
  mappingIndexed,
  partitioningAll,
  partitioningBy,
  runBang,
  taking,
  takingNth,
  takingWhile,
  transduce,
} from "../runtime/core/transducer.mjs";
import { range, take } from "../runtime/core/sequence.mjs";
import { persistentHashMap } from "../runtime/core/map.mjs";
import { persistentHashSet } from "../runtime/core/set.mjs";
import {
  EMPTY_VECTOR,
  isPersistentVector,
  persistentVector,
} from "../runtime/core/vector.mjs";
import { extendProtocolType } from "../runtime/core/protocol.mjs";
import {
  persistentVectorMetrics,
  resetPersistentVectorMetrics,
} from "../runtime/testing/vector.mjs";

async function runHost(command, fixture) {
  const child = Bun.spawn([command, fixture], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `${command} exited with ${exitCode}`);
  }
  return JSON.parse(stdout);
}

test("completing separates reduction steps from one exact completion", () => {
  let completions = 0;
  const reducer = completing(
    (result, value) => result + value,
    (result) => {
      completions += 1;
      return Object.freeze({ result });
    },
  );

  expect(Object.isFrozen(reducer)).toBe(true);
  expect(reducer(2, 3)).toBe(5);
  expect(reducer(5)).toEqual({ result: 5 });
  expect(completions).toBe(1);
  expect(() => reducer()).toThrow(
    "reducing functions accept one completion argument or two step arguments",
  );
  expect(() => reducer(1, 2, 3)).toThrow(
    "reducing functions accept one completion argument or two step arguments",
  );
});

test("mapping and filtering compose in declared left-to-right order", () => {
  const trace = [];
  const transducer = composeTransducers(
    mapping((value) => {
      trace.push(`map:${value}`);
      return value + 1;
    }),
    filtering((value) => {
      trace.push(`filter:${value}`);
      return value % 2 === 0;
    }),
    mapping((value) => value * 10),
  );

  expect(Object.isFrozen(transducer)).toBe(true);
  expect(transduce(transducer, (values, value) => [...values, value], [], [1, 2, 3]))
    .toEqual([20, 40]);
  expect(trace).toEqual([
    "map:1", "filter:2",
    "map:2", "filter:3",
    "map:3", "filter:4",
  ]);
  expect(transduce(
    composeTransducers(),
    (result, value) => `${result}${value}`,
    "",
    [1, 2, 3],
  )).toBe("123");
});

test("eduction composes replayable reduction pipelines over unbounded sources", () => {
  let mappings = 0;
  let predicates = 0;
  const pipeline = eduction(
    mapping((value) => {
      mappings += 1;
      return value + 1;
    }),
    filtering((value) => {
      predicates += 1;
      return value % 2 === 0;
    }),
    range(),
  );

  expect(isReductionView(pipeline)).toBe(true);
  expect(Object.isFrozen(pipeline)).toBe(true);
  expect([...take(5, pipeline)]).toEqual([2, 4, 6, 8, 10]);
  expect([mappings, predicates]).toEqual([10, 10]);
  expect([...take(5, pipeline)]).toEqual([2, 4, 6, 8, 10]);
  expect([mappings, predicates]).toEqual([20, 20]);
  expect(() => count(pipeline)).toThrow();

  const doubled = eduction(mapping((value) => value * 2), [1, 2, 3]);
  expect(reduce(doubled, (sum, value) => sum + value)).toBe(12);
  expect(reduce(doubled, (sum, value) => sum + value, 10)).toBe(22);
  expect(() => reduce(
    eduction(filtering(() => false), [1, 2, 3]),
    (sum, value) => sum + value,
  )).toThrow("cannot reduce an empty eduction without an initial value");

  let zeroInputPulls = 0;
  const zeroInput = sequenceView(() => (function* values() {
    zeroInputPulls += 1;
    yield 1;
  })(), 1);
  expect(reduce(eduction(taking(0), zeroInput), (sum, value) => sum + value, 7))
    .toBe(7);
  expect(zeroInputPulls).toBe(0);

  const partitioned = into(
    EMPTY_VECTOR,
    eduction(partitioningAll(2), [1, 2, 3]),
  );
  expect([...partitioned].map((part) => [...part])).toEqual([[1, 2], [3]]);

  const scaled = take(
    100_000,
    eduction(mapping((value) => value + 1), range()),
  );
  expect(count(scaled)).toBe(100_000);
  expect(nth(scaled, 0)).toBe(1);
  expect(nth(scaled, 99_999)).toBe(100_000);
});

test("run! consumes reduction views for ordered side effects", () => {
  const visited = [];
  const source = eduction(mapping((value) => value * 3), [1, 2, 3]);
  expect(runBang((value) => visited.push(value), source)).toBeNull();
  expect(visited).toEqual([3, 6, 9]);
  expect(() => runBang(null, source)).toThrow("run! procedure must be a function");
  expect(() => runBang(() => null)).toThrow(
    "run! requires a procedure and collection",
  );
  expect(() => eduction(source)).toThrow(
    "eduction requires one or more transducers and a collection",
  );
});

test("taking terminates exactly and allocates fresh state for every run", () => {
  let pulls = 0;
  let closes = 0;
  const source = sequenceView(() => (function* values() {
    try {
      for (let value = 0; value < 10; value += 1) {
        pulls += 1;
        yield value;
      }
    } finally {
      closes += 1;
    }
  })(), 10);
  const firstThree = taking(3);

  expect(transduce(firstThree, (values, value) => [...values, value], [], source))
    .toEqual([0, 1, 2]);
  expect(pulls).toBe(3);
  expect(closes).toBe(1);
  expect(transduce(firstThree, (values, value) => [...values, value], [], source))
    .toEqual([0, 1, 2]);
  expect(pulls).toBe(6);
  expect(closes).toBe(2);

  let zeroPulls = 0;
  const untouched = sequenceView(() => (function* values() {
    zeroPulls += 1;
    yield "unreachable";
  })(), 1);
  let zeroCompletions = 0;
  const zeroReducer = completing(
    (values, value) => [...values, value],
    (values) => {
      zeroCompletions += 1;
      return values;
    },
  );
  expect(transduce(taking(0), zeroReducer, [], untouched)).toEqual([]);
  expect(zeroPulls).toBe(0);
  expect(zeroCompletions).toBe(1);
});

test("stateful transforms allocate fresh indexed keep and prefix state per run", () => {
  const indexed = mappingIndexed((index, value) => `${index}:${value}`);
  expect(transduce(indexed, (values, value) => [...values, value], [], ["a", "b"]))
    .toEqual(["0:a", "1:b"]);
  expect(transduce(indexed, (values, value) => [...values, value], [], ["c"]))
    .toEqual(["0:c"]);

  const kept = keeping((value) => {
    if (value === 1) return null;
    if (value === 2) return false;
    if (value === 3) return undefined;
    return value * 10;
  });
  expect(transduce(kept, (values, value) => [...values, value], [], [1, 2, 3, 4]))
    .toEqual([false, undefined, 40]);

  let takePulls = 0;
  let takePredicates = 0;
  let takeCloses = 0;
  const source = sequenceView(() => (function* values() {
    try {
      for (let value = 0; value < 10; value += 1) {
        takePulls += 1;
        yield value;
      }
    } finally {
      takeCloses += 1;
    }
  })(), 10);
  const prefix = takingWhile((value) => {
    takePredicates += 1;
    return value < 3;
  });
  expect(transduce(prefix, (values, value) => [...values, value], [], source))
    .toEqual([0, 1, 2]);
  expect([takePulls, takePredicates, takeCloses]).toEqual([4, 4, 1]);
  expect(transduce(prefix, (values, value) => [...values, value], [], [0, 1, 4]))
    .toEqual([0, 1]);

  let dropPredicates = 0;
  const suffix = droppingWhile((value) => {
    dropPredicates += 1;
    return value < 3;
  });
  expect(transduce(suffix, (values, value) => [...values, value], [], [0, 1, 3, 2, 4]))
    .toEqual([3, 2, 4]);
  expect(dropPredicates).toBe(3);
  expect(transduce(suffix, (values, value) => [...values, value], [], [1, 5]))
    .toEqual([5]);
});

test("deduping uses Eliscript value equality and preserves separated repeats", () => {
  const left = persistentVector(1, 2);
  const equal = persistentVector(1, 2);
  const different = persistentVector(2, 1);
  const transducer = deduping();

  expect(transduce(
    transducer,
    (values, value) => [...values, value],
    [],
    [undefined, undefined, left, equal, different, left],
  )).toEqual([undefined, left, different, left]);
  expect(transduce(transducer, (values, value) => [...values, value], [], [1, 1, 2]))
    .toEqual([1, 2]);
});

test("distincting removes global duplicates with fresh value-semantic state", () => {
  const left = persistentVector(1, 2);
  const equal = persistentVector(1, 2);
  const different = persistentVector(2, 1);
  const transducer = distincting();

  expect(transduce(
    transducer,
    (values, value) => [...values, value],
    [],
    [undefined, left, 1, equal, undefined, different, 1, left],
  )).toEqual([undefined, left, 1, different]);
  expect(transduce(transducer, (values, value) => [...values, value], [], [1, 1, 2]))
    .toEqual([1, 2]);
});

test("indexed keep nth and interpose allocate fresh bounded state per run", () => {
  const indexed = keepingIndexed((index, value) =>
    value === "skip" ? null : `${index}:${value}`);
  expect(transduce(
    indexed,
    (values, value) => [...values, value],
    [],
    ["left", "skip", "right"],
  )).toEqual(["0:left", "2:right"]);
  expect(transduce(indexed, (values, value) => [...values, value], [], ["again"]))
    .toEqual(["0:again"]);

  const everyThird = takingNth(3);
  expect(transduce(
    everyThird,
    (values, value) => [...values, value],
    [],
    [0, 1, 2, 3, 4, 5, 6],
  )).toEqual([0, 3, 6]);
  expect(transduce(everyThird, (values, value) => [...values, value], [], [7, 8]))
    .toEqual([7]);

  let pulls = 0;
  const source = sequenceView(() => (function* values() {
    for (const value of [1, 2, 3]) {
      pulls += 1;
      yield value;
    }
  })(), 3);
  expect(transduce(
    composeTransducers(interposing("separator"), taking(2)),
    (values, value) => [...values, value],
    [],
    source,
  )).toEqual([1, "separator"]);
  expect(pulls).toBe(2);
  expect(transduce(
    interposing("separator"),
    (values, value) => [...values, value],
    [],
    ["only"],
  )).toEqual(["only"]);
});

test("partitioning transducers emit persistent groups and flush completion once", () => {
  const fixed = partitioningAll(3);
  const partitions = transduce(
    fixed,
    (values, value) => [...values, value],
    [],
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  expect(partitions.every(isPersistentVector)).toBe(true);
  expect(partitions.map((partition) => [...partition]))
    .toEqual([[1, 2, 3], [4, 5, 6], [7, 8]]);
  expect(transduce(fixed, (values, value) => [...values, [...value]], [], [9, 10]))
    .toEqual([[9, 10]]);

  const grouped = transduce(
    partitioningBy((value) => persistentVector(value % 2)),
    (values, value) => [...values, [...value]],
    [],
    [1, 3, 2, 4, 5, 7],
  );
  expect(grouped).toEqual([[1, 3], [2, 4], [5, 7]]);

  let groupedPulls = 0;
  const groupedSource = sequenceView(() => (function* values() {
    for (const value of [1, 3, 2, 4]) {
      groupedPulls += 1;
      yield value;
    }
  })(), 4);
  let completions = 0;
  const firstGroupReducer = completing(
    (values, value) => [...values, [...value]],
    (values) => {
      completions += 1;
      return values;
    },
  );
  expect(transduce(
    composeTransducers(partitioningBy((value) => value % 2), taking(1)),
    firstGroupReducer,
    [],
    groupedSource,
  )).toEqual([[1, 3]]);
  expect([groupedPulls, completions]).toEqual([3, 1]);

  let pulls = 0;
  const source = sequenceView(() => (function* values() {
    for (let value = 0; value < 100; value += 1) {
      pulls += 1;
      yield value;
    }
  })(), 100);
  expect(transduce(
    composeTransducers(partitioningAll(4), taking(1)),
    (values, value) => [...values, [...value]],
    [],
    source,
  )).toEqual([[0, 1, 2, 3]]);
  expect(pulls).toBe(4);
});

test("catting and mapcatting flatten reducible values and propagate termination", () => {
  expect(transduce(
    catting(),
    (values, value) => [...values, value],
    [],
    [[1, 2], persistentVector(3, 4)],
  )).toEqual([1, 2, 3, 4]);

  let outerPulls = 0;
  const outer = sequenceView(() => (function* values() {
    for (const value of [1, 2, 3]) {
      outerPulls += 1;
      yield value;
    }
  })(), 3);
  expect(transduce(
    composeTransducers(
      mapcatting((value) => persistentVector(value, value * 10)),
      taking(3),
    ),
    (values, value) => [...values, value],
    [],
    outer,
  )).toEqual([1, 10, 2]);
  expect(outerPulls).toBe(2);
});

test("transduce preserves reduced termination and completion semantics", () => {
  let completions = 0;
  const reducer = completing(
    (result, value) => value > 5
      ? reduced({ ...result, stoppedAt: value })
      : { ...result, values: [...result.values, value] },
    (result) => {
      completions += 1;
      return Object.freeze({ ...result, complete: true });
    },
  );
  expect(transduce(mapping((value) => value * 2), reducer, { values: [] }, [1, 2, 3]))
    .toEqual({ values: [2, 4], stoppedAt: 6, complete: true });
  expect(completions).toBe(1);
});

test("custom transducers can use completing and preserve downstream completion", () => {
  const duplicating = (downstream) => completing(
    (result, value) => {
      const first = downstream(result, value);
      return isReduced(first) ? first : downstream(first, value);
    },
    (result) => downstream(result),
  );
  const reducer = completing(
    (values, value) => [...values, value],
    (values) => Object.freeze({ values, completed: true }),
  );

  expect(transduce(
    composeTransducers(mapping((value) => value + 1), duplicating),
    reducer,
    [],
    [1, 2],
  )).toEqual({ values: [2, 2, 3, 3], completed: true });
});

test("into constructs every supported target through collection protocols", () => {
  const vector = persistentVector("old");
  const map = persistentHashMap(["old", 0]);
  const set = persistentHashSet("old");
  const array = ["old"];
  const nativeMap = new Map([["old", 0]]);
  const nativeSet = new Set(["old"]);

  expect([...into(vector, [1, 2, 3])]).toEqual([1, 2, 3]);
  expect([...vector]).toEqual(["old"]);
  expect(new Map(into(map, [["left", 1], ["right", 2]]).entries()))
    .toEqual(new Map([["left", 1], ["right", 2]]));
  expect([...map]).toEqual([["old", 0]]);
  expect(into(set, [1, 2, 2]).toSet()).toEqual(new Set([1, 2]));
  expect([...set]).toEqual(["old"]);

  expect(into(array, mapping((value) => value * 2), [1, 2, 3]))
    .toEqual([2, 4, 6]);
  expect(array).toEqual(["old"]);
  expect(into(nativeMap, [["answer", 42]])).toEqual(new Map([["answer", 42]]));
  expect(nativeMap).toEqual(new Map([["old", 0]]));
  expect(into(nativeSet, [1, 1, 2])).toEqual(new Set([1, 2]));
  expect(nativeSet).toEqual(new Set(["old"]));
});

test("into supports external immutable source and target capabilities", () => {
  class Range {
    constructor(start, end) {
      this.start = start;
      this.end = end;
      Object.freeze(this);
    }
  }
  class Bag {
    constructor(values = []) {
      this.values = Object.freeze(values);
      Object.freeze(this);
    }
  }

  extendProtocolType(IReduce, Range, {
    reduce: (range, reducer, initial) => {
      let result = initial;
      for (let value = range.start; value < range.end; value += 1) {
        result = reducer(result, value);
        if (isReduced(result)) {
          return unreduced(result);
        }
      }
      return result;
    },
  });
  extendProtocolType(IEmptyable, Bag, { empty: () => new Bag() });
  extendProtocolType(IConj, Bag, {
    conj: (bag, value) => new Bag([...bag.values, value]),
  });

  const target = new Bag([99]);
  const result = into(
    target,
    composeTransducers(mapping((value) => value * 3), taking(4)),
    new Range(1, 100),
  );
  expect(result.values).toEqual([3, 6, 9, 12]);
  expect(target.values).toEqual([99]);
});

test("transducer boundaries reject malformed operations before traversal", () => {
  let traversals = 0;
  const source = sequenceView(() => {
    traversals += 1;
    return [1, 2][Symbol.iterator]();
  }, 2);

  expect(() => completing(null)).toThrow("reducing step must be a function");
  expect(() => completing(() => null, null)).toThrow(
    "reducing completion must be a function",
  );
  expect(() => mapping(null)).toThrow("mapping transform must be a function");
  expect(() => mappingIndexed(null)).toThrow(
    "mapping-indexed transform must be a function",
  );
  expect(() => keeping(null)).toThrow("keeping transform must be a function");
  expect(() => keepingIndexed(null)).toThrow(
    "keeping-indexed transform must be a function",
  );
  expect(() => mapcatting(null)).toThrow(
    "mapcatting transform must be a function",
  );
  expect(() => filtering(null)).toThrow("filtering predicate must be a function");
  expect(() => takingWhile(null)).toThrow(
    "taking-while predicate must be a function",
  );
  expect(() => droppingWhile(null)).toThrow(
    "dropping-while predicate must be a function",
  );
  expect(() => takingNth(0)).toThrow(
    "taking-nth interval must be a positive safe integer",
  );
  expect(() => partitioningAll(-1)).toThrow(
    "partitioning-all size must be a positive safe integer",
  );
  expect(() => partitioningBy(null)).toThrow(
    "partitioning-by classifier must be a function",
  );
  expect(() => taking(-1)).toThrow(
    "taking limit must be a non-negative safe integer",
  );
  expect(() => taking(1.5)).toThrow(
    "taking limit must be a non-negative safe integer",
  );
  expect(() => composeTransducers(null)).toThrow(
    "composed transducer must be a function",
  );
  expect(() => transduce(() => null, () => null, 0, source)).toThrow(
    "transducer result must be a function",
  );
  expect(() => transduce(mapping((value) => value), () => null, 0)).toThrow(
    "transduce requires a transducer, reducer, initial value, and collection",
  );
  expect(() => into([], mapping((value) => value), source, "extra")).toThrow(
    "into requires a target and source, or a target, transducer, and source",
  );
  expect(traversals).toBe(0);
});

test("transducers agree under Bun and Node and stay single-pass at scale", async () => {
  const fixture = fileURLToPath(
    new URL("./fixtures/transducer-host.mjs", import.meta.url),
  );
  const bun = await runHost(process.execPath, fixture);
  const node = await runHost("node", fixture);
  expect(bun).toEqual(node);
  expect(bun).toEqual({
    pipeline: [6, 12, 18],
    sum: 36,
    entries: [["key-1", 10], ["key-2", 20]],
    eduction: [6, 8],
    visits: [6, 8],
    reused: [[1, 2], [1, 2]],
    stateful: ["2:left", "3:right"],
    distinct: [1, 2, 3],
    sampled: ["0:left", "3:right"],
    interposed: ["left", "between", "right"],
    partitions: [[1, 3], [2, 4], [5]],
    flattened: [1, 10, 2],
    concatenated: ["left", "right"],
  });

  let pulls = 0;
  let mappings = 0;
  let predicates = 0;
  const million = sequenceView(() => (function* values() {
    for (let value = 0; value < 1_000_000; value += 1) {
      pulls += 1;
      yield value;
    }
  })(), 1_000_000);

  resetPersistentVectorMetrics();
  const total = transduce(
    composeTransducers(
      mapping((value) => {
        mappings += 1;
        return value + 1;
      }),
      filtering((value) => {
        predicates += 1;
        return value % 2 === 0;
      }),
    ),
    (result, value) => result + value,
    0,
    million,
  );
  expect(total).toBe(250_000_500_000);
  expect([pulls, mappings, predicates]).toEqual([1_000_000, 1_000_000, 1_000_000]);
  expect(persistentVectorMetrics()).toEqual({
    nodeAllocations: 0,
    nodeVisits: 0,
    tailAllocations: 0,
    rootGrowths: 0,
  });

  let distinctPulls = 0;
  const repeated = sequenceView(() => (function* values() {
    for (let value = 0; value < 100_000; value += 1) {
      distinctPulls += 1;
      yield value % 10_000;
    }
  })(), 100_000);
  expect(transduce(
    distincting(),
    (result) => result + 1,
    0,
    repeated,
  )).toBe(10_000);
  expect(distinctPulls).toBe(100_000);

  let partitionPulls = 0;
  const partitionSource = sequenceView(() => (function* values() {
    for (let value = 0; value < 1_000_000; value += 1) {
      partitionPulls += 1;
      yield value;
    }
  })(), 1_000_000);
  const millionPartition = transduce(
    partitioningAll(1_000_000),
    (_result, partition) => partition,
    null,
    partitionSource,
  );
  expect(partitionPulls).toBe(1_000_000);
  expect(count(millionPartition)).toBe(1_000_000);
  expect(nth(millionPartition, 0)).toBe(0);
  expect(nth(millionPartition, 999_999)).toBe(999_999);

  const bounded = into(
    EMPTY_VECTOR,
    composeTransducers(filtering((value) => value % 2 === 0), taking(1_000)),
    million,
  );
  expect(count(bounded)).toBe(1_000);
  expect([...bounded].at(-1)).toBe(1_998);
}, 30_000);
