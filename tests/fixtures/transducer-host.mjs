import {
  composeTransducers,
  filtering,
  into,
  mapping,
  taking,
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
}));
