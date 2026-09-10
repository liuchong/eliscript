import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const queue = await import(pathToFileURL(resolve(process.argv[2])).href);
let values = queue.persistent_queue(1, 2, 3);
values = queue.persistent_queue_conj(values, 4);
values = queue.persistent_queue_pop(values);

console.log(JSON.stringify({
  persistent: queue.persistent_queue_QMARK_(values),
  empty: queue.persistent_queue_empty_QMARK_(values),
  count: queue.persistent_queue_count(values),
  front: queue.persistent_queue_peek(values, "empty"),
  values: queue.persistent_queue_to_array(values),
  sum: queue.persistent_queue_reduce((sum, value) => sum + value, 0, values),
}));
