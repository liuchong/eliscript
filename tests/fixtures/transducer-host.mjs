import {
  catting,
  composeTransducers,
  deduping,
  distincting,
  droppingWhile,
  filtering,
  interposing,
  into,
  keeping,
  keepingIndexed,
  mapcatting,
  mapping,
  mappingIndexed,
  partitioningBy,
  taking,
  takingNth,
  takingWhile,
  transduce,
} from "../../runtime/core/transducer.mjs";
import { persistentHashMap } from "../../runtime/core/map.mjs";
import { EMPTY_VECTOR } from "../../runtime/core/vector.mjs";

const pipeline = composeTransducers(
  mapping((value) => value * 3),
  filtering((value) => value % 2 === 0),
  taking(3),
);
const values = into(EMPTY_VECTOR, pipeline, [1, 2, 3, 4, 5, 6, 7, 8]);
const entries = into(
  persistentHashMap(),
  mapping((value) => [`key-${value}`, value * 10]),
  [1, 2],
);

console.log(JSON.stringify({
  pipeline: [...values],
  sum: transduce(pipeline, (total, value) => total + value, 0, [1, 2, 3, 4, 5, 6]),
  entries: [...entries].sort(([left], [right]) => left.localeCompare(right)),
  reused: [
    transduce(taking(2), (result, value) => [...result, value], [], [1, 2, 3]),
    transduce(taking(2), (result, value) => [...result, value], [], [1, 2, 3]),
  ],
  stateful: transduce(
    composeTransducers(
      deduping(),
      mappingIndexed((index, value) => [index, value]),
      keeping(([index, value]) => value === null ? null : `${index}:${value}`),
      droppingWhile((value) => value.endsWith(":skip")),
      takingWhile((value) => !value.endsWith(":stop")),
    ),
    (result, value) => [...result, value],
    [],
    ["skip", "skip", null, "left", "left", "right", "stop", "unreachable"],
  ),
  distinct: transduce(
    distincting(),
    (result, value) => [...result, value],
    [],
    [1, 2, 1, 3, 2],
  ),
  sampled: transduce(
    composeTransducers(
      keepingIndexed((index, value) => value === null ? null : `${index}:${value}`),
      takingNth(2),
    ),
    (result, value) => [...result, value],
    [],
    ["left", null, "skip", "right", "tail"],
  ),
  interposed: transduce(
    interposing("between"),
    (result, value) => [...result, value],
    [],
    ["left", "right"],
  ),
  partitions: transduce(
    partitioningBy((value) => value % 2),
    (result, value) => [...result, [...value]],
    [],
    [1, 3, 2, 4, 5],
  ),
  flattened: transduce(
    composeTransducers(
      mapcatting((value) => [value, value * 10]),
      taking(3),
    ),
    (result, value) => [...result, value],
    [],
    [1, 2, 3],
  ),
  concatenated: transduce(
    catting(),
    (result, value) => [...result, value],
    [],
    [["left"], ["right"]],
  ),
}));
