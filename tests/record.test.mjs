import { expect, test } from "bun:test";

import {
  assoc,
  conj,
  contains,
  count,
  dissoc,
  empty,
  get,
  isMap,
  reduceKV,
  seq,
} from "../runtime/core/collection.mjs";
import { keyword } from "../runtime/core/identifier.mjs";
import {
  isPersistentHashMap,
  persistentHashMap,
} from "../runtime/core/map.mjs";
import { meta, withMeta } from "../runtime/core/metadata.mjs";
import {
  defineProtocol,
  extendProtocolType,
  protocolMethod,
} from "../runtime/core/protocol.mjs";
import {
  defineRecordType,
  isRecord,
  isRecordType,
  recordFieldNames,
  recordType,
  recordTypeName,
} from "../runtime/core/record.mjs";
import { equalValues, hashValue } from "../runtime/core/value.mjs";

const NAME = keyword("name");
const AGE = keyword("age");
const ROLE = keyword("role");

test("record types provide immutable positional and map construction", () => {
  const Person = defineRecordType("Person", ["name", "age"]);
  const ada = Person.create("Ada", 36);

  expect(isRecordType(Person)).toBeTrue();
  expect(isRecord(ada)).toBeTrue();
  expect(recordType(ada)).toBe(Person);
  expect(recordTypeName(Person)).toBe("Person");
  expect(recordTypeName(ada)).toBe("Person");
  expect(recordFieldNames(ada)).toEqual(["name", "age"]);
  expect(Object.isFrozen(recordFieldNames(ada))).toBeTrue();
  expect(Object.isFrozen(ada)).toBeTrue();
  expect(ada.name).toBe("Ada");
  expect(ada.age).toBe(36);
  expect(() => Person.create("Ada")).toThrow(
    "->Person expects 2 values, received 1",
  );
  expect(() => new Person()).toThrow(
    "Person values must be created with its record constructors",
  );

  const source = persistentHashMap([NAME, "Grace"], [ROLE, "engineer"]);
  const grace = Person.fromMap(source);
  expect(grace.name).toBe("Grace");
  expect(grace.age).toBeNull();
  expect(get(grace, ROLE)).toBe("engineer");
  expect(source.has(AGE)).toBeFalse();
});

test("records participate in persistent map operations", () => {
  const Person = defineRecordType("Person", ["name", "age"]);
  const ada = Person.create("Ada", 36);
  const older = assoc(ada, AGE, 37);
  const enriched = conj(older, [ROLE, "mathematician"]);

  expect(count(ada)).toBe(2);
  expect(get(ada, NAME)).toBe("Ada");
  expect(get(ada, ROLE, "missing")).toBe("missing");
  expect(contains(enriched, ROLE)).toBeTrue();
  expect(older).not.toBe(ada);
  expect(older.age).toBe(37);
  expect(ada.age).toBe(36);
  expect(isRecord(enriched)).toBeTrue();
  expect(count(enriched)).toBe(3);
  expect(seq(enriched)).not.toBeNull();
  expect(reduceKV(enriched, (total) => total + 1, 0)).toBe(3);
  expect(isMap(enriched)).toBeTrue();

  const withoutExtra = dissoc(enriched, ROLE);
  expect(isRecord(withoutExtra)).toBeTrue();
  expect(withoutExtra.name).toBe("Ada");
  expect(withoutExtra.age).toBe(37);

  const withoutDeclaredField = dissoc(enriched, NAME);
  expect(isRecord(withoutDeclaredField)).toBeFalse();
  expect(isPersistentHashMap(withoutDeclaredField)).toBeTrue();
  expect(contains(withoutDeclaredField, NAME)).toBeFalse();
  expect(get(withoutDeclaredField, ROLE)).toBe("mathematician");
  expect(isPersistentHashMap(empty(enriched))).toBeTrue();
  expect(count(empty(enriched))).toBe(0);
});

test("records have type-sensitive value semantics and metadata", () => {
  const Person = defineRecordType("Person", ["name", "age"]);
  const OtherPerson = defineRecordType("Person", ["name", "age"]);
  const left = Person.create("Ada", 36);
  const right = Person.create("Ada", 36);
  const other = OtherPerson.create("Ada", 36);

  expect(equalValues(left, right)).toBeTrue();
  expect(hashValue(left)).toBe(hashValue(right));
  expect(equalValues(left, other)).toBeFalse();
  expect(equalValues(left, left.toPersistentMap())).toBeFalse();

  const metadata = persistentHashMap([keyword("source"), "test"]);
  const located = withMeta(left, metadata);
  expect(meta(left)).toBeNull();
  expect(meta(located)).toBe(metadata);
  expect(equalValues(left, located)).toBeTrue();
  expect(meta(dissoc(assoc(located, ROLE, "engineer"), ROLE))).toBe(metadata);
  expect(meta(dissoc(located, NAME))).toBe(metadata);
});

test("record constructors are exact protocol extension targets", () => {
  const Person = defineRecordType("Person", ["name"]);
  const IDescribe = defineProtocol("IDescribeRecord", ["describe"]);
  const describe = protocolMethod(IDescribe, "describe");
  extendProtocolType(IDescribe, Person, {
    describe: (person) => `person:${person.name}`,
  });

  expect(describe(Person.create("Ada"))).toBe("person:Ada");
  expect(() => describe({ name: "Ada" })).toThrow();
});

test("record definitions reject ambiguous layouts", () => {
  expect(() => defineRecordType("", [])).toThrow(
    "record type name must be a non-empty string",
  );
  expect(() => defineRecordType("Bad", ["x", "x"])).toThrow(
    "record declares duplicate field x",
  );
  expect(() => defineRecordType("Bad", ["get"])).toThrow(
    "record field get conflicts with a record member",
  );
  expect(() => recordType({})).toThrow("expected an Eliscript record");
});
