import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const listModule = await import(pathToFileURL(resolve(process.argv[2])).href);

const {
  empty_persistent_list: emptyPersistentList,
  persistent_list_QMARK_: isPersistentList,
  persistent_list_empty_QMARK_: persistentListEmpty,
  persistent_list_count: persistentListCount,
  persistent_list_cons: persistentListCons,
  persistent_list_first: persistentListFirst,
  persistent_list_rest: persistentListRest,
  persistent_list_pop: persistentListPop,
  persistent_list_nth: persistentListNth,
  persistent_list_reduce: persistentListReduce,
  persistent_list_reverse: persistentListReverse,
  persistent_list_to_array: persistentListToArray,
  persistent_list_from_array: persistentListFromArray,
} = listModule;

let list = emptyPersistentList();
let previous = list;
for (let value = 0; value < 1_000_000; value += 1) {
  previous = list;
  list = persistentListCons(list, value);
}

const reversed = persistentListReverse(list);
const sample = persistentListFromArray(["a", "b", "c"]);

process.stdout.write(`${JSON.stringify({
  persistent: isPersistentList(list),
  empty: persistentListEmpty(emptyPersistentList()),
  count: persistentListCount(list),
  first: persistentListFirst(list, "empty"),
  probes: [0, 31, 32, 1024, 32768, 999999].map(
    (index) => persistentListNth(list, index, "missing"),
  ),
  sum: persistentListReduce((total, value) => total + value, 0, list),
  restShared: persistentListRest(list, null) === previous,
  popShared: persistentListPop(list) === previous,
  reversedFirst: persistentListFirst(reversed, "empty"),
  reversedLast: persistentListNth(reversed, 999_999, "missing"),
  sample: persistentListToArray(sample),
})}\n`);
