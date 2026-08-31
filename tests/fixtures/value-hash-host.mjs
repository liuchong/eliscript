import {
  equalValues,
  hashValue,
} from "../../runtime/core/value.mjs";
import {
  eliscriptSymbol,
  keyword,
} from "../../runtime/core/identifier.mjs";
import { persistentVector } from "../../runtime/core/vector.mjs";
import { persistentHashMap } from "../../runtime/core/map.mjs";
import { persistentHashSet } from "../../runtime/core/set.mjs";

const nestedLeft = persistentVector(
  null,
  undefined,
  true,
  42,
  "eliscript",
  persistentVector("nested", Number.NaN, -0),
);
const nestedRight = persistentVector(
  null,
  undefined,
  true,
  42,
  "eliscript",
  persistentVector("nested", Number.NaN, 0),
);
const orderedMap = persistentHashMap(
  ["alpha", 1],
  [persistentVector("key"), persistentVector(2, 3)],
  ["omega", Number.NaN],
);
const reversedMap = persistentHashMap(
  ["omega", Number.NaN],
  [persistentVector("key"), persistentVector(2, 3)],
  ["alpha", 1],
);
const collisionMap = persistentHashMap(
  ["key-50691", "left"],
  ["key-194634", "right"],
);
const orderedSet = persistentHashSet(
  "alpha",
  persistentVector("key"),
  "omega",
);
const reversedSet = persistentHashSet(
  "omega",
  persistentVector("key"),
  "alpha",
);
const collisionSet = persistentHashSet("key-50691", "key-194634");

console.log(JSON.stringify({
  scalars: {
    null: hashValue(null),
    undefined: hashValue(undefined),
    false: hashValue(false),
    true: hashValue(true),
    zero: hashValue(0),
    negativeZero: hashValue(-0),
    one: hashValue(1),
    negativeOne: hashValue(-1),
    fraction: hashValue(1.5),
    nan: hashValue(Number.NaN),
    positiveInfinity: hashValue(Number.POSITIVE_INFINITY),
    negativeInfinity: hashValue(Number.NEGATIVE_INFINITY),
    maxSafeInteger: hashValue(Number.MAX_SAFE_INTEGER),
    emptyString: hashValue(""),
    ascii: hashValue("Eliscript"),
    unicode: hashValue("值语义🙂"),
    zeroBigInt: hashValue(0n),
    negativeBigInt: hashValue(-12345678901234567890n),
    globalSymbol: hashValue(Symbol.for("eliscript/value")),
  },
  identifiers: {
    keyword: hashValue(keyword("article/title")),
    unqualifiedKeyword: hashValue(keyword("title")),
    symbol: hashValue(eliscriptSymbol("article/title")),
    unqualifiedSymbol: hashValue(eliscriptSymbol("title")),
  },
  vectors: {
    empty: hashValue(persistentVector()),
    flat: hashValue(persistentVector(1, 2, 3, 4)),
    nested: hashValue(nestedLeft),
  },
  maps: {
    ordered: hashValue(orderedMap),
    reversed: hashValue(reversedMap),
    collision: hashValue(collisionMap),
  },
  sets: {
    empty: hashValue(persistentHashSet()),
    flat: hashValue(persistentHashSet(1, 2, 3, 4)),
    ordered: hashValue(orderedSet),
    reversed: hashValue(reversedSet),
    collision: hashValue(collisionSet),
  },
  invariants: {
    nanEqual: equalValues(Number.NaN, Number.NaN),
    zerosEqual: equalValues(0, -0),
    nestedEqual: equalValues(nestedLeft, nestedRight),
    nestedHashesEqual: hashValue(nestedLeft) === hashValue(nestedRight),
    mapsEqual: equalValues(orderedMap, reversedMap),
    mapHashesEqual: hashValue(orderedMap) === hashValue(reversedMap),
    setsEqual: equalValues(orderedSet, reversedSet),
    setHashesEqual: hashValue(orderedSet) === hashValue(reversedSet),
    symbolsEqual: equalValues(
      eliscriptSymbol("article/title"),
      eliscriptSymbol("article", "title"),
    ),
    identifierCategoriesDistinct: !equalValues(
      keyword("article/title"),
      eliscriptSymbol("article/title"),
    ),
  },
}));
