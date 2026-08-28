import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import {
  IConj,
  IEmptyable,
  IReduce,
  count,
  isReduced,
  reduced,
  sequenceView,
  unreduced,
} from "../runtime/core/collection.mjs";
import {
  completing,
  composeTransducers,
  filtering,
  into,
  mapping,
  taking,
  transduce,
} from "../runtime/core/transducer.mjs";
import { persistentHashMap } from "../runtime/core/map.mjs";
import { persistentHashSet } from "../runtime/core/set.mjs";
import {
  EMPTY_VECTOR,
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
  expect(() => filtering(null)).toThrow("filtering predicate must be a function");
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
    reused: [[1, 2], [1, 2]],
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

  const bounded = into(
    EMPTY_VECTOR,
    composeTransducers(filtering((value) => value % 2 === 0), taking(1_000)),
    million,
  );
  expect(count(bounded)).toBe(1_000);
  expect([...bounded].at(-1)).toBe(1_998);
}, 30_000);
