import { pathToFileURL } from "node:url";

import {
  isPersistentHashMap,
} from "../../runtime/core/map.mjs";
import {
  isKeyword,
  keyword,
  qualifiedIdentifierName,
} from "../../runtime/core/identifier.mjs";
import {
  isPersistentVector,
  persistentVector,
} from "../../runtime/core/vector.mjs";

const modulePath = process.argv[2];
if (modulePath === undefined) {
  throw new TypeError("literal runtime host requires a generated module path");
}

const generated = await import(pathToFileURL(modulePath).href);
const nested = generated.vector_value.nth(2);
const mapKey = persistentVector("value-key");
const mapResult = generated.map_value.get(mapKey);
const literalMapResult = generated.map_literal.get(mapKey);
const nestedMap = generated.map_literal.get("nested");
const readyKeyword = keyword("ready");
const qualifiedKeyword = keyword("article/title");

console.log(JSON.stringify({
  vector: {
    persistent: isPersistentVector(generated.vector_value),
    count: generated.vector_value.count,
    languageCount: generated.vector_count,
    first: generated.vector_first,
    values: [...generated.vector_value],
    nestedPersistent: isPersistentVector(nested),
  },
  map: {
    persistent: isPersistentHashMap(generated.map_value),
    count: generated.map_value.count,
    name: generated.map_value.get("name"),
    valueKey: isPersistentVector(mapResult) ? [...mapResult] : null,
  },
  mapLiteral: {
    persistent: isPersistentHashMap(generated.map_literal),
    count: generated.map_literal.count,
    name: generated.map_literal.get("name"),
    valueKey: isPersistentVector(literalMapResult)
      ? [...literalMapResult]
      : null,
    nestedPersistent: isPersistentHashMap(nestedMap),
    nestedReady: nestedMap.get(readyKeyword),
    duplicate: generated.map_literal.get("duplicate"),
  },
  keyword: {
    value: isKeyword(generated.keyword_value),
    interned: generated.keyword_value === qualifiedKeyword,
    qualifiedName: qualifiedIdentifierName(generated.keyword_value),
    printed: String(generated.keyword_value),
    mapPersistent: isPersistentHashMap(generated.keyword_map),
    mapCount: generated.keyword_map.count,
    mapQualified: generated.keyword_map.get(qualifiedKeyword),
    mapReady: generated.keyword_map.get(readyKeyword),
    stringKeyMiss: generated.keyword_map.get("article/title") ?? null,
    macroValue: isKeyword(generated.macro_keyword),
    macroQualifiedName: qualifiedIdentifierName(generated.macro_keyword),
    quotedSyntax: generated.quoted_keyword,
  },
  host: {
    array: Array.isArray(generated.array_value),
    languageCount: generated.array_count,
    second: generated.array_second,
    object: Object.getPrototypeOf(generated.object_value) === Object.prototype,
    objectValue: generated.object_value,
  },
}));
