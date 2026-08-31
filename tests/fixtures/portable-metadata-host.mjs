import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const moduleUrl = pathToFileURL(modulePath);
const metadataModule = await import(moduleUrl.href);
const valueModule = await import(new URL("./value.eli", moduleUrl).href);
const listModule = await import(new URL("./persistent-list.eli", moduleUrl).href);
const vectorModule = await import(new URL("./persistent-vector.eli", moduleUrl).href);
const mapModule = await import(new URL("./persistent-map.eli", moduleUrl).href);
const setModule = await import(new URL("./persistent-set.eli", moduleUrl).href);

const {
  meta,
  metadata_valid_QMARK_: metadataValid,
  supports_metadata_QMARK_: supportsMetadata,
  vary_meta: varyMeta,
  with_meta: withMeta,
} = metadataModule;
const {
  value_equal_QMARK_: valueEqual,
  value_hash: valueHash,
  value_map_from_entries: valueMapFromEntries,
  value_set_from_array: valueSetFromArray,
} = valueModule;
const {
  persistent_list_conj: listConj,
  persistent_list_from_array: listFromArray,
  persistent_list_rest: listRest,
  persistent_list_to_array: listToArray,
} = listModule;
const {
  persistent_vector_assoc: vectorAssoc,
  persistent_vector_from_array: vectorFromArray,
  persistent_vector_to_array: vectorToArray,
} = vectorModule;
const {
  persistent_map_assoc: mapAssoc,
  persistent_map_count: mapCount,
  persistent_map_get: mapGet,
} = mapModule;
const {
  persistent_set_conj: setConj,
  persistent_set_count: setCount,
} = setModule;

const metadata = valueMapFromEntries([
  ["source", "portable"],
  ["line", 7],
]);
const list = listFromArray([1, 2, 3]);
const vector = vectorFromArray([1, 2, 3]);
const map = valueMapFromEntries([["a", 1], ["b", 2]]);
const set = valueSetFromArray([1, 2, 3]);
const annotatedList = withMeta(list, metadata);
const annotatedVector = withMeta(vector, metadata);
const annotatedMap = withMeta(map, metadata);
const annotatedSet = withMeta(set, metadata);
const varied = varyMeta(
  annotatedVector,
  (current, key, value) => mapAssoc(current, key, value),
  "line",
  9,
);

console.log(JSON.stringify({
  support: {
    list: supportsMetadata(list),
    vector: supportsMetadata(vector),
    map: supportsMetadata(map),
    set: supportsMetadata(set),
    host: supportsMetadata({}),
  },
  metadata: {
    valid: metadataValid(metadata),
    invalid: metadataValid({}),
    unsupported: withMeta({}, metadata),
    invalidAttachment: withMeta(vector, {}),
    source: mapGet(meta(annotatedMap), "source", null),
    variedLine: mapGet(meta(varied), "line", null),
  },
  semantics: {
    equal: valueEqual(vector, annotatedVector),
    hashEqual: valueHash(vector) === valueHash(annotatedVector),
    childMetadata: meta(listRest(annotatedList)),
  },
  sharing: {
    list: annotatedList.rest === list.rest,
    vector: annotatedVector.root === vector.root &&
      annotatedVector.tail === vector.tail,
    map: annotatedMap.root === map.root,
    set: annotatedSet.map === set.map,
  },
  updates: {
    list: meta(listConj(annotatedList, 0)) === metadata,
    vector: meta(vectorAssoc(annotatedVector, 1, 20)) === metadata,
    map: meta(mapAssoc(annotatedMap, "c", 3)) === metadata,
    set: meta(setConj(annotatedSet, 4)) === metadata,
  },
  hostValues: {
    list: listToArray(annotatedList),
    vector: vectorToArray(annotatedVector),
    mapCount: mapCount(annotatedMap),
    setCount: setCount(annotatedSet),
  },
}));
