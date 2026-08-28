import {
  equalValues,
  hashValue,
} from "../../runtime/core/value.mjs";
import { persistentVector } from "../../runtime/core/vector.mjs";

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
  vectors: {
    empty: hashValue(persistentVector()),
    flat: hashValue(persistentVector(1, 2, 3, 4)),
    nested: hashValue(nestedLeft),
  },
  invariants: {
    nanEqual: equalValues(Number.NaN, Number.NaN),
    zerosEqual: equalValues(0, -0),
    nestedEqual: equalValues(nestedLeft, nestedRight),
    nestedHashesEqual: hashValue(nestedLeft) === hashValue(nestedRight),
  },
}));
