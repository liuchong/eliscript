import { reduce } from "./collection.mjs";
import {
  EliscriptSymbol,
  Keyword,
  qualifiedIdentifierName,
} from "./identifier.mjs";
import { PersistentList } from "./list.mjs";
import {
  defineProtocol,
  extendProtocolCategory,
  extendProtocolType,
  protocolMethod,
} from "./protocol.mjs";
import { into } from "./transducer.mjs";
import { isTruthy } from "./truth.mjs";
import { EMPTY_VECTOR, PersistentVector } from "./vector.mjs";

export const IComparable = defineProtocol("IComparable", ["compare"]);
const dispatchCompare = protocolMethod(IComparable, "compare");

function requireFunction(value, label) {
  if (typeof value !== "function") {
    throw new TypeError(`${label} must be a function`);
  }
  return value;
}

function comparisonResult(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must return a finite number`);
  }
  return value < 0 ? -1 : value > 0 ? 1 : 0;
}

function typeName(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (value instanceof Keyword) return "keyword";
  if (value instanceof EliscriptSymbol) return "symbol";
  if (value instanceof PersistentVector) return "vector";
  if (value instanceof PersistentList) return "list";
  return typeof value;
}

function requireComparableType(right, predicate, leftName) {
  if (!predicate(right)) {
    throw new TypeError(`cannot compare ${leftName} to ${typeName(right)}`);
  }
  return right;
}

function comparePrimitive(left, right, predicate, name) {
  requireComparableType(right, predicate, name);
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareNumber(left, right) {
  requireComparableType(right, (value) => typeof value === "number", "number");
  if (Number.isNaN(left)) return Number.isNaN(right) ? 0 : 1;
  if (Number.isNaN(right)) return -1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareIdentifier(left, right, Constructor, name) {
  requireComparableType(right, (value) => value instanceof Constructor, name);
  return comparePrimitive(
    qualifiedIdentifierName(left),
    qualifiedIdentifierName(right),
    (value) => typeof value === "string",
    "string",
  );
}

function compareSequential(left, right, Constructor, name) {
  requireComparableType(right, (value) => value instanceof Constructor, name);
  const leftIterator = left[Symbol.iterator]();
  const rightIterator = right[Symbol.iterator]();
  while (true) {
    const leftItem = leftIterator.next();
    const rightItem = rightIterator.next();
    if (leftItem.done || rightItem.done) {
      return leftItem.done === rightItem.done ? 0 : leftItem.done ? -1 : 1;
    }
    const result = compareValues(leftItem.value, rightItem.value);
    if (result !== 0) return result;
  }
}

extendProtocolCategory(IComparable, "boolean", {
  compare: (left, right) => comparePrimitive(
    left,
    right,
    (value) => typeof value === "boolean",
    "boolean",
  ),
});
extendProtocolCategory(IComparable, "number", { compare: compareNumber });
extendProtocolCategory(IComparable, "bigint", {
  compare: (left, right) => comparePrimitive(
    left,
    right,
    (value) => typeof value === "bigint",
    "bigint",
  ),
});
extendProtocolCategory(IComparable, "string", {
  compare: (left, right) => comparePrimitive(
    left,
    right,
    (value) => typeof value === "string",
    "string",
  ),
});
extendProtocolType(IComparable, Keyword, {
  compare: (left, right) => compareIdentifier(left, right, Keyword, "keyword"),
});
extendProtocolType(IComparable, EliscriptSymbol, {
  compare: (left, right) =>
    compareIdentifier(left, right, EliscriptSymbol, "symbol"),
});
extendProtocolType(IComparable, PersistentVector, {
  compare: (left, right) =>
    compareSequential(left, right, PersistentVector, "vector"),
});
extendProtocolType(IComparable, PersistentList, {
  compare: (left, right) =>
    compareSequential(left, right, PersistentList, "list"),
});

export function compareValues(left, right) {
  if (left === right || (Number.isNaN(left) && Number.isNaN(right))) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  if (left === undefined) return -1;
  if (right === undefined) return 1;
  return comparisonResult(
    dispatchCompare(left, right),
    "IComparable/compare",
  );
}

export function comparator(comparison) {
  requireFunction(comparison, "comparator comparison");
  return (left, right) => {
    const result = comparison(left, right);
    if (typeof result === "number") {
      return comparisonResult(result, "comparator comparison");
    }
    if (isTruthy(result)) return -1;
    return isTruthy(comparison(right, left)) ? 1 : 0;
  };
}

export function reverseComparator(...arguments_) {
  if (arguments_.length > 1) {
    throw new TypeError("reverseComparator expects zero or one comparator");
  }
  const normalized = comparator(
    arguments_.length === 0 ? compareValues : arguments_[0],
  );
  return (left, right) => normalized(right, left);
}

function sortDecorated(values, comparison) {
  values.sort((left, right) =>
    comparison(left.key, right.key) || left.index - right.index);
  return into(EMPTY_VECTOR, values.map(({ value }) => value));
}

function collectDecorated(collection, keyFunction) {
  const values = [];
  reduce(collection, (result, value) => {
    result.push({ index: result.length, key: keyFunction(value), value });
    return result;
  }, values);
  return values;
}

export function sort(...arguments_) {
  if (arguments_.length !== 1 && arguments_.length !== 2) {
    throw new TypeError("sort expects a collection or comparator and collection");
  }
  const comparison = arguments_.length === 1
    ? compareValues
    : arguments_[0];
  const collection = arguments_[arguments_.length - 1];
  return sortDecorated(
    collectDecorated(collection, (value) => value),
    comparator(comparison),
  );
}

export function sortBy(keyFunction, ...arguments_) {
  requireFunction(keyFunction, "sortBy key function");
  if (arguments_.length !== 1 && arguments_.length !== 2) {
    throw new TypeError(
      "sortBy expects a key function, optional comparator, and collection",
    );
  }
  const comparison = arguments_.length === 1
    ? compareValues
    : arguments_[0];
  const collection = arguments_[arguments_.length - 1];
  return sortDecorated(
    collectDecorated(collection, keyFunction),
    comparator(comparison),
  );
}

function extremeKey(label, direction, keyFunction, values) {
  requireFunction(keyFunction, `${label} key function`);
  if (values.length === 0) {
    throw new TypeError(`${label} expects a key function and at least one value`);
  }
  let selected = values[0];
  let selectedKey = keyFunction(selected);
  for (let index = 1; index < values.length; index += 1) {
    const candidate = values[index];
    const candidateKey = keyFunction(candidate);
    if (compareValues(candidateKey, selectedKey) * direction >= 0) {
      selected = candidate;
      selectedKey = candidateKey;
    }
  }
  return selected;
}

export function minKey(keyFunction, ...values) {
  return extremeKey("minKey", -1, keyFunction, values);
}

export function maxKey(keyFunction, ...values) {
  return extremeKey("maxKey", 1, keyFunction, values);
}
