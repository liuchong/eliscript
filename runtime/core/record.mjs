import {
  COLLECTION_ASSOC,
  COLLECTION_CONJ,
  COLLECTION_CONTAINS,
  COLLECTION_COUNT,
  COLLECTION_DISSOC,
  COLLECTION_EMPTY,
  COLLECTION_GET,
  COLLECTION_REDUCE,
  COLLECTION_REDUCE_KV,
  COLLECTION_SEQ,
  isReducedValue,
  readCollectionEntry,
  reduceIterable,
  sequenceView,
  unreducedValue,
} from "./collection-internals.mjs";
import {
  identifierName,
  identifierNamespace,
  isKeyword,
  keyword,
} from "./identifier.mjs";
import { EMPTY_MAP, PersistentHashMap } from "./map.mjs";
import { METADATA_READ, METADATA_WITH } from "./metadata-internals.mjs";
import {
  VALUE_EQUAL,
  VALUE_HASH,
  finishHash,
  hashString,
  mixHash,
} from "./value-internals.mjs";

const MAX_FIELDS = 1024;
const RECORD_CONSTRUCTOR_TOKEN = Symbol("eliscript.record.constructor-token");
const RECORD_STATE = Symbol("eliscript.record.state");
const RECORD_HASH_TAG = 0x4d83_a92f;
const recordTypes = new WeakSet();

function fail(message) {
  throw new TypeError(message);
}

function normalizeTypeName(name) {
  if (typeof name !== "string" || name.length === 0) {
    fail("record type name must be a non-empty string");
  }
  return name;
}

function normalizeFieldNames(fields) {
  if (!Array.isArray(fields) || fields.length > MAX_FIELDS) {
    fail(`record fields must be a dense array of at most ${MAX_FIELDS} names`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(fields);
  if (Reflect.ownKeys(descriptors).length !== fields.length + 1) {
    fail("record fields must be a dense array with no extra properties");
  }
  const seen = new Set();
  const result = [];
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = descriptors[String(index)];
    const field = descriptor?.value;
    if (!descriptor?.enumerable || typeof field !== "string" ||
        field.length === 0 || field.includes("/")) {
      fail("record field names must be non-empty unqualified strings");
    }
    if (seen.has(field)) {
      fail(`record declares duplicate field ${field}`);
    }
    seen.add(field);
    result.push(field);
  }
  return Object.freeze(result);
}

function declaredFieldIndex(typeState, key) {
  if (!isKeyword(key) || identifierNamespace(key) !== null) return -1;
  return typeState.fieldIndexes.get(identifierName(key)) ?? -1;
}

function mapWithMetadata(map, metadata) {
  return metadata === null ? map : map[METADATA_WITH](metadata);
}

function defineFieldAccessors(RecordValue, typeState) {
  for (let index = 0; index < typeState.fieldNames.length; index += 1) {
    const fieldName = typeState.fieldNames[index];
    if (fieldName in RecordValue.prototype) {
      fail(`record field ${fieldName} conflicts with a record member`);
    }
    const fieldKey = typeState.fieldKeys[index];
    Object.defineProperty(RecordValue.prototype, fieldName, {
      configurable: false,
      enumerable: true,
      get() {
        return this[RECORD_STATE].map.get(fieldKey);
      },
    });
  }
}

function makeInitialMap(typeState, values) {
  let map = EMPTY_MAP;
  for (let index = 0; index < values.length; index += 1) {
    map = map.assoc(typeState.fieldKeys[index], values[index]);
  }
  return map;
}

function normalizeSourceMap(typeState, source) {
  let map;
  try {
    map = PersistentHashMap.from(source);
  } catch (error) {
    throw new TypeError(
      `map->${typeState.name} expects an iterable collection of entries`,
      { cause: error },
    );
  }
  for (const fieldKey of typeState.fieldKeys) {
    if (!map.has(fieldKey)) map = map.assoc(fieldKey, null);
  }
  return map;
}

export function defineRecordType(name, fields) {
  const typeName = normalizeTypeName(name);
  const fieldNames = normalizeFieldNames(fields);
  const fieldKeys = Object.freeze(fieldNames.map((field) => keyword(field)));
  const fieldIndexes = new Map(
    fieldNames.map((field, index) => [field, index]),
  );
  const typeState = Object.freeze({
    name: typeName,
    fieldNames,
    fieldKeys,
    fieldIndexes,
    signature: `${typeName}[${fieldNames.join(",")}]`,
  });

  class RecordValue {
    constructor(token, map, metadata = null) {
      if (token !== RECORD_CONSTRUCTOR_TOKEN ||
          !(map instanceof PersistentHashMap)) {
        fail(`${typeName} values must be created with its record constructors`);
      }
      this[RECORD_STATE] = Object.freeze({ map, metadata });
      Object.freeze(this);
    }

    static create(...values) {
      if (values.length !== fieldNames.length) {
        fail(
          `->${typeName} expects ${fieldNames.length} values, received ${values.length}`,
        );
      }
      return new RecordValue(
        RECORD_CONSTRUCTOR_TOKEN,
        makeInitialMap(typeState, values),
      );
    }

    static fromMap(source) {
      return new RecordValue(
        RECORD_CONSTRUCTOR_TOKEN,
        normalizeSourceMap(typeState, source),
      );
    }

    static isInstance(value) {
      return value instanceof RecordValue;
    }

    get count() {
      return this[RECORD_STATE].map.count;
    }

    get size() {
      return this.count;
    }

    get(key, notFound = null) {
      return this[RECORD_STATE].map.get(key, notFound);
    }

    has(key) {
      return this[RECORD_STATE].map.has(key);
    }

    assoc(key, value) {
      const state = this[RECORD_STATE];
      const map = state.map.assoc(key, value);
      return map === state.map
        ? this
        : new RecordValue(RECORD_CONSTRUCTOR_TOKEN, map, state.metadata);
    }

    dissoc(key) {
      const state = this[RECORD_STATE];
      if (declaredFieldIndex(typeState, key) >= 0) {
        return mapWithMetadata(state.map.dissoc(key), state.metadata);
      }
      const map = state.map.dissoc(key);
      return map === state.map
        ? this
        : new RecordValue(RECORD_CONSTRUCTOR_TOKEN, map, state.metadata);
    }

    entries() {
      return this[RECORD_STATE].map.entries();
    }

    keys() {
      return this[RECORD_STATE].map.keys();
    }

    values() {
      return this[RECORD_STATE].map.values();
    }

    toPersistentMap() {
      return mapWithMetadata(
        this[RECORD_STATE].map,
        this[RECORD_STATE].metadata,
      );
    }

    [COLLECTION_COUNT]() {
      return this.count;
    }

    [COLLECTION_EMPTY]() {
      return mapWithMetadata(EMPTY_MAP, this[RECORD_STATE].metadata);
    }

    [COLLECTION_CONJ](entry) {
      const [key, value] = readCollectionEntry(entry);
      return this.assoc(key, value);
    }

    [COLLECTION_GET](key, notFound = null) {
      return this.get(key, notFound);
    }

    [COLLECTION_ASSOC](key, value) {
      return this.assoc(key, value);
    }

    [COLLECTION_CONTAINS](key) {
      return this.has(key);
    }

    [COLLECTION_DISSOC](key) {
      return this.dissoc(key);
    }

    [COLLECTION_SEQ]() {
      return this.count === 0
        ? null
        : sequenceView(() => this.entries(), this.count);
    }

    [COLLECTION_REDUCE](reducer, ...initial) {
      return reduceIterable(this, reducer, ...initial);
    }

    [COLLECTION_REDUCE_KV](reducer, initial) {
      let result = initial;
      for (const [key, value] of this.entries()) {
        result = reducer(result, key, value);
        if (isReducedValue(result)) return unreducedValue(result);
      }
      return result;
    }

    [VALUE_EQUAL](other, equal) {
      return other instanceof RecordValue &&
        equal(this[RECORD_STATE].map, other[RECORD_STATE].map);
    }

    [VALUE_HASH](hash) {
      return finishHash(
        mixHash(
          mixHash(RECORD_HASH_TAG, hashString(typeState.signature)),
          hash(this[RECORD_STATE].map),
        ),
        this.count,
      );
    }

    [METADATA_READ]() {
      return this[RECORD_STATE].metadata;
    }

    [METADATA_WITH](metadata) {
      const state = this[RECORD_STATE];
      return metadata === state.metadata
        ? this
        : new RecordValue(RECORD_CONSTRUCTOR_TOKEN, state.map, metadata);
    }

    [Symbol.iterator]() {
      return this.entries();
    }

    get [Symbol.toStringTag]() {
      return `EliscriptRecord:${typeName}`;
    }
  }

  Object.defineProperty(RecordValue, "name", { value: typeName });
  Object.defineProperties(RecordValue, {
    recordName: { enumerable: true, value: typeName },
    recordFields: { enumerable: true, value: fieldNames },
  });
  defineFieldAccessors(RecordValue, typeState);
  Object.freeze(RecordValue.prototype);
  Object.freeze(RecordValue);
  recordTypes.add(RecordValue);
  return RecordValue;
}

export function isRecordType(value) {
  return typeof value === "function" && recordTypes.has(value);
}

export function isRecord(value) {
  return value !== null && typeof value === "object" &&
    isRecordType(value.constructor);
}

export function recordType(value) {
  if (!isRecord(value)) fail("expected an Eliscript record");
  return value.constructor;
}

export function recordTypeName(value) {
  const type = isRecordType(value) ? value : recordType(value);
  return type.recordName;
}

export function recordFieldNames(value) {
  const type = isRecordType(value) ? value : recordType(value);
  return type.recordFields;
}
