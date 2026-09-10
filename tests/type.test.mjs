import { expect, test } from "bun:test";

import {
  defineProtocol,
  extendProtocolType,
  implementsProtocol,
  protocolMethod,
} from "../runtime/core/protocol.mjs";
import {
  defineType,
  isType,
  isTypeValue,
  reifyProtocols,
  typeFieldNames,
  typeName,
  typeOf,
} from "../runtime/core/type.mjs";
import { equalValues } from "../runtime/core/value.mjs";

test("defined types construct frozen positional identity values", () => {
  const Point = defineType("Point", ["x", "y"]);
  const left = Point.create(3, 4);
  const right = Point.create(3, 4);

  expect(isType(Point)).toBeTrue();
  expect(isTypeValue(left)).toBeTrue();
  expect(Point.isInstance(left)).toBeTrue();
  expect(typeOf(left)).toBe(Point);
  expect(typeName(Point)).toBe("Point");
  expect(typeName(left)).toBe("Point");
  expect(typeFieldNames(left)).toEqual(["x", "y"]);
  expect(Object.isFrozen(typeFieldNames(left))).toBeTrue();
  expect(Object.isFrozen(left)).toBeTrue();
  expect(left.x).toBe(3);
  expect(left.y).toBe(4);
  expect(equalValues(left, right)).toBeFalse();
  expect(() => Point.create(3)).toThrow(
    "->Point expects 2 values, received 1",
  );
  expect(() => new Point()).toThrow(
    "Point values must be created with its positional constructor",
  );
});

test("defined types install complete direct protocol implementations", () => {
  const IDescribe = defineProtocol("TypeDescribe", ["describe", "measure"]);
  const describe = protocolMethod(IDescribe, "describe");
  const measure = protocolMethod(IDescribe, "measure");
  const Box = defineType("Box", ["value"], [[IDescribe, {
    describe: (self, prefix) => `${prefix}:${self.value}`,
    measure: (self, scale) => self.value * scale,
  }]]);

  extendProtocolType(IDescribe, Box, {
    describe: () => "external",
    measure: () => -1,
  });
  const box = Box.create(7);
  expect(implementsProtocol(IDescribe, box)).toBeTrue();
  expect(describe(box, "box")).toBe("box:7");
  expect(measure(box, 3)).toBe(21);
});

test("reified values implement multiple protocols with lexical closures", () => {
  const IRead = defineProtocol("ReifiedRead", ["read"]);
  const IMeasure = defineProtocol("ReifiedMeasure", ["measure"]);
  const read = protocolMethod(IRead, "read");
  const measure = protocolMethod(IMeasure, "measure");
  const prefix = "captured";
  const offset = 10;
  const value = reifyProtocols([
    [IRead, { read: (_self, suffix) => `${prefix}:${suffix}` }],
    [IMeasure, { measure: (_self, input) => offset + input }],
  ]);

  expect(Object.getPrototypeOf(value)).toBeNull();
  expect(Object.isFrozen(value)).toBeTrue();
  expect(implementsProtocol(IRead, value)).toBeTrue();
  expect(implementsProtocol(IMeasure, value)).toBeTrue();
  expect(read(value, "ok")).toBe("captured:ok");
  expect(measure(value, 5)).toBe(15);
});

test("type protocol plans reject incomplete and ambiguous definitions", () => {
  const protocol = defineProtocol("ValidatedType", ["read", "write"]);
  expect(() => defineType("Incomplete", [], [[protocol, {
    read: () => null,
  }]])).toThrow("implementation must define every operation");
  expect(() => defineType("Unknown", [], [[protocol, {
    read: () => null,
    other: () => null,
  }]])).toThrow("implementation contains an unknown operation");
  expect(() => reifyProtocols([])).toThrow(
    "reify requires at least one protocol implementation",
  );
  expect(() => reifyProtocols([
    [protocol, { read: () => null, write: () => null }],
    [protocol, { read: () => null, write: () => null }],
  ])).toThrow("protocol may be implemented only once");
});

test("type definitions reject ambiguous names and fields", () => {
  expect(() => defineType("", [])).toThrow(
    "type name must be a non-empty string",
  );
  expect(() => defineType("Bad", ["x", "x"])).toThrow(
    "type declares duplicate field x",
  );
  expect(() => defineType("Bad", ["constructor"])).toThrow(
    "type field constructor conflicts with a type member",
  );
  expect(() => typeOf({})).toThrow("expected an Eliscript type value");
});

test("type definitions reject mutable protocol-shaped objects", () => {
  const protocol = defineProtocol("ExactProtocolIdentity", ["read"]);
  const read = protocolMethod(protocol, "read");
  const mutableProtocol = {
    name: protocol.name,
    operations: { read },
  };

  expect(() => defineType("Forged", [], [[mutableProtocol, {
    read: () => null,
  }]])).toThrow("expected an Eliscript protocol");
});
