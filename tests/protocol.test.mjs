import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

import {
  ProtocolDispatchError,
  defineProtocol,
  defineProtocolFromDefinition,
  extendProtocolCategory,
  extendProtocolDefault,
  extendProtocolType,
  implementsProtocol,
  implementsProtocolOperation,
  protocolDefinition,
  protocolHostCategory,
  protocolMethod,
  protocolSlot,
} from "../runtime/core/protocol.mjs";
import {
  IEquiv,
  IHash,
  equalValues,
  extendValueType,
  hashValue,
} from "../runtime/core/value.mjs";
import { persistentHashMap } from "../runtime/core/map.mjs";

async function runHost(command, fixture) {
  const child = Bun.spawn([command, fixture], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `${command} exited with ${exitCode}`);
  }
  return JSON.parse(stdout);
}

test("protocol definitions expose frozen operation identities", () => {
  const protocol = defineProtocol("Measured", ["count", "reduce"]);
  const count = protocolMethod(protocol, "count");

  expect(Object.isFrozen(protocol)).toBe(true);
  expect(Object.isFrozen(protocol.operations)).toBe(true);
  expect(Object.isFrozen(count)).toBe(true);
  expect(protocol.operations.count).toBe(count);
  expect(count.protocol).toBe(protocol);
  expect(count.operation).toBe("count");
  expect(count.slot).toBe(protocolSlot(protocol, "count"));
  expect(protocolHostCategory(null)).toBe("null");
  expect(protocolHostCategory(undefined)).toBe("undefined");
  expect(protocolHostCategory(() => 1)).toBe("function");
  expect(() => defineProtocol("", ["read"])).toThrow();
  expect(() => defineProtocol("Empty", [])).toThrow();
  expect(() => defineProtocol("Duplicate", ["read", "read"])).toThrow();
  expect(() => protocolMethod(protocol, "missing")).toThrow();
  expect(() => count()).toThrow(
    "protocol Measured/count requires a dispatch value",
  );
});

test("protocol definitions round trip as isolated declarative data", () => {
  const original = defineProtocol("Transported", ["read", "size"]);
  const originalRead = protocolMethod(original, "read");
  const originalSlot = protocolSlot(original, "read");
  extendProtocolCategory(original, "string", {
    read: (value) => `original:${value}`,
  });

  const definition = protocolDefinition(original);
  expect(definition).toEqual({
    format: "eliscript-protocol-definition",
    version: 1,
    name: "Transported",
    operations: ["read", "size"],
  });
  expect(Object.isFrozen(definition)).toBe(true);
  expect(Object.isFrozen(definition.operations)).toBe(true);

  const restored = defineProtocolFromDefinition(
    JSON.parse(JSON.stringify(definition)),
  );
  const restoredRead = protocolMethod(restored, "read");
  expect(protocolDefinition(restored)).toEqual(definition);
  expect(restored).not.toBe(original);
  expect(restoredRead).not.toBe(originalRead);
  expect(protocolSlot(restored, "read")).not.toBe(originalSlot);
  expect(() => restoredRead("value")).toThrow(ProtocolDispatchError);
  expect(originalRead("value")).toBe("original:value");

  extendProtocolCategory(restored, "string", {
    read: (value) => `restored:${value}`,
  });
  expect(restoredRead("value")).toBe("restored:value");
  expect(originalRead("value")).toBe("original:value");
});

test("protocol definition validation rejects executable and ambiguous input", () => {
  let reads = 0;
  const accessorOperations = [];
  Object.defineProperty(accessorOperations, "0", {
    enumerable: true,
    get() {
      reads += 1;
      return "read";
    },
  });
  accessorOperations.length = 1;
  expect(() => defineProtocol("Accessor", accessorOperations)).toThrow(
    "protocol operations must contain enumerable data values",
  );
  expect(reads).toBe(0);

  const sparse = new Array(2);
  sparse[1] = "read";
  expect(() => defineProtocol("Sparse", sparse)).toThrow(
    "protocol operations must be a dense array with no extra properties",
  );
  const extended = ["read"];
  extended.extra = "side-channel";
  expect(() => defineProtocol("Extended", extended)).toThrow(
    "protocol operations must be a dense array with no extra properties",
  );
  expect(() => defineProtocol(
    "Oversized",
    Array.from({ length: 1025 }, (_, index) => `operation-${index}`),
  )).toThrow("protocol operations exceed 1024");

  const base = {
    format: "eliscript-protocol-definition",
    version: 1,
    name: "Imported",
    operations: ["read"],
  };
  const nullPrototype = Object.assign(Object.create(null), base);
  expect(protocolDefinition(defineProtocolFromDefinition(nullPrototype)))
    .toEqual(base);
  expect(() => defineProtocolFromDefinition({ ...base, extra: true })).toThrow(
    "protocol definition must contain exactly format, version, name, and operations",
  );
  expect(() => defineProtocolFromDefinition({ ...base, version: 2 })).toThrow(
    "unsupported protocol definition version 2",
  );
  expect(() => defineProtocolFromDefinition({
    ...base,
    format: "other",
  })).toThrow("unsupported protocol definition format other");
  expect(() => defineProtocolFromDefinition(Object.assign(
    Object.create({ inherited: true }),
    base,
  ))).toThrow("protocol definition must be a plain object");

  const symbolExtended = { ...base };
  symbolExtended[Symbol("hidden")] = true;
  expect(() => defineProtocolFromDefinition(symbolExtended)).toThrow(
    "protocol definition must contain exactly format, version, name, and operations",
  );

  const accessorDefinition = {
    version: 1,
    name: "Accessor",
    operations: ["read"],
  };
  Object.defineProperty(accessorDefinition, "format", {
    enumerable: true,
    get() {
      reads += 1;
      return "eliscript-protocol-definition";
    },
  });
  expect(() => defineProtocolFromDefinition(accessorDefinition)).toThrow(
    "protocol definition field format must be an enumerable data property",
  );
  expect(reads).toBe(0);
});

test("protocol dispatch follows direct, exact, category, and default priority", () => {
  const protocol = defineProtocol("Labelled", ["label"]);
  const label = protocolMethod(protocol, "label");
  const slot = protocolSlot(protocol, "label");

  class Exact {
    constructor(value) {
      this.value = value;
    }
  }
  class Direct extends Exact {
    [slot]() {
      return `direct:${this.value}`;
    }
  }

  extendProtocolDefault(protocol, {
    label: (value) => `default:${String(value)}`,
  });
  extendProtocolCategory(protocol, "object", {
    label: () => "category:object",
  });
  extendProtocolType(protocol, Exact, {
    label: (value) => `exact:${value.value}`,
  });

  expect(label(new Direct("a"))).toBe("direct:a");
  expect(label(new Exact("b"))).toBe("exact:b");
  expect(label({ value: "c" })).toBe("category:object");
  expect(label(7)).toBe("default:7");

  const invalid = new Exact("bad");
  Object.defineProperty(invalid, slot, { value: 42 });
  expect(() => label(invalid)).toThrow(ProtocolDispatchError);
  try {
    label(invalid);
  } catch (error) {
    expect(error.reason).toBe("invalid-direct-slot");
  }
});

test("protocol extensions are exact, atomic, and do not modify host prototypes", () => {
  const protocol = defineProtocol("Pair", ["left", "right"]);
  const left = protocolMethod(protocol, "left");
  const right = protocolMethod(protocol, "right");
  const arrayKeys = Reflect.ownKeys(Array.prototype);

  class Base {}
  class Child extends Base {}
  expect(() => extendProtocolType(protocol, Base, {
    left: () => "left",
    right: 42,
  })).toThrow("protocol Pair/right implementation must be a function");
  expect(implementsProtocolOperation(protocol, "left", new Base())).toBe(false);

  extendProtocolType(protocol, Base, { left: () => "base-left" });
  expect(left(new Base())).toBe("base-left");
  expect(() => right(new Base())).toThrow(ProtocolDispatchError);
  expect(implementsProtocol(protocol, new Base())).toBe(false);
  expect(() => left(new Child())).toThrow(ProtocolDispatchError);

  extendProtocolType(protocol, Array, {
    left: (value) => value[0],
    right: (value) => value.at(-1),
  });
  expect([left([1, 2, 3]), right([1, 2, 3])]).toEqual([1, 3]);
  expect(implementsProtocol(protocol, [])).toBe(true);
  expect(Reflect.ownKeys(Array.prototype)).toEqual(arrayKeys);
  expect(() => extendProtocolCategory(protocol, "array", {
    left: () => 1,
  })).toThrow("unknown protocol host category array");
});

test("host categories provide explicit cross-realm adaptation", () => {
  const protocol = defineProtocol("RealmValue", ["read"]);
  const read = protocolMethod(protocol, "read");
  const remoteObject = runInNewContext("({ value: 17 })");

  extendProtocolType(protocol, Object, {
    read: () => "local-object",
  });
  extendProtocolCategory(protocol, "object", {
    read: (value) => `category:${value.value}`,
  });

  expect(read({ value: 1 })).toBe("local-object");
  expect(read(remoteObject)).toBe("category:17");
});

test("missing protocol diagnostics identify protocol, operation, and host type", () => {
  const protocol = defineProtocol("Readable", ["read"]);
  const read = protocolMethod(protocol, "read");

  try {
    read(new Date(0));
    throw new Error("expected protocol dispatch to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ProtocolDispatchError);
    expect(error).toMatchObject({
      code: "ELI-RUNTIME-PROTOCOL",
      protocol: "Readable",
      operation: "read",
      observedType: "object:Date",
      reason: "missing",
    });
    expect(error.message).toBe(
      "protocol Readable/read has no implementation for object:Date",
    );
  }
});

test("open IEquiv and IHash extensions preserve persistent key semantics", () => {
  class Point {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      Object.freeze(this);
    }
  }

  extendValueType(Point, {
    equal: (left, right, equal) =>
      right instanceof Point && equal(left.x, right.x) && equal(left.y, right.y),
    hash: (point, hash) =>
      Math.imul(hash(point.x) ^ hash(point.y), 0x9e37_79b1) >>> 0,
  });

  const left = new Point(3, 5);
  const equal = new Point(3, 5);
  const different = new Point(3, 8);
  expect(implementsProtocol(IEquiv, left)).toBe(true);
  expect(implementsProtocol(IHash, left)).toBe(true);
  expect(equalValues(left, equal)).toBe(true);
  expect(hashValue(left)).toBe(hashValue(equal));
  expect(equalValues(left, different)).toBe(false);

  const map = persistentHashMap([left, "point"]);
  expect(map.get(equal, "missing")).toBe("point");
  expect(map.get(different, "missing")).toBe("missing");
  expect(() => extendValueType(class Partial {}, {
    equal: () => true,
  })).toThrow("value type extension requires equal and hash functions");
});

test("protocol dispatch agrees under Bun and Node and remains stable at scale", async () => {
  const fixture = fileURLToPath(
    new URL("./fixtures/protocol-host.mjs", import.meta.url),
  );
  const bun = await runHost(process.execPath, fixture);
  const node = await runHost("node", fixture);
  expect(bun).toEqual(node);
  expect(bun).toEqual({
    direct: ["direct:alpha", 5, true],
    exact: ["exact:beta", 4, true],
    category: ["string:gamma", 5],
    fallback: ["default:null", -1],
    missing: {
      code: "ELI-RUNTIME-PROTOCOL",
      protocol: "Missing",
      operation: "read",
      observedType: "object:Object",
      reason: "missing",
    },
  });

  const protocol = defineProtocol("MillionDispatch", ["increment"]);
  const increment = protocolMethod(protocol, "increment");
  const slot = protocolSlot(protocol, "increment");
  const receiver = {
    [slot](value) {
      return value + 1;
    },
  };
  let value = 0;
  for (let index = 0; index < 1_000_000; index += 1) {
    value = increment(receiver, value);
  }
  expect(value).toBe(1_000_000);
}, 30_000);
