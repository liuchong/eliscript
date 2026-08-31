import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import {
  DataTextError,
  IPrint,
  printValue,
  readValue,
  readValues,
} from "../runtime/core/data-text.mjs";
import {
  eliscriptSymbol,
  keyword,
} from "../runtime/core/identifier.mjs";
import { persistentList } from "../runtime/core/list.mjs";
import { persistentHashMap } from "../runtime/core/map.mjs";
import { meta, withMeta } from "../runtime/core/metadata.mjs";
import { extendProtocolType } from "../runtime/core/protocol.mjs";
import { persistentHashSet } from "../runtime/core/set.mjs";
import { equalValues } from "../runtime/core/value.mjs";
import { persistentVector } from "../runtime/core/vector.mjs";

const HOST_FIXTURE = fileURLToPath(
  new URL("./fixtures/data-text-host.mjs", import.meta.url),
);

async function runHost(command) {
  const child = Bun.spawn([command, HOST_FIXTURE], {
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

function roundTrip(value) {
  const printed = printValue(value);
  const restored = readValue(printed);
  expect(equalValues(restored, value)).toBe(true);
  expect(printValue(restored)).toBe(printed);
  return restored;
}

test("canonical data text prints scalar and identifier values", () => {
  expect(IPrint.name).toBe("IPrint");
  expect([
    null,
    undefined,
    true,
    false,
    0,
    -0,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    12345678901234567890n,
    "line\n\"quoted\"",
    keyword("article/title"),
    eliscriptSymbol("article/title"),
  ].map((value) => printValue(value))).toEqual([
    "nil",
    "undefined",
    "true",
    "false",
    "0",
    "0",
    "1.5",
    "##NaN",
    "##Inf",
    "##-Inf",
    "12345678901234567890N",
    "\"line\\n\\\"quoted\\\"\"",
    ":article/title",
    "article/title",
  ]);

  for (const value of [
    null,
    undefined,
    true,
    false,
    0,
    -0,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    12345678901234567890n,
    "Unicode 值",
    keyword("article/title"),
    eliscriptSymbol("article/title"),
  ]) roundTrip(value);
});

test("collections print in deterministic logical order", () => {
  const value = persistentHashMap(
    [keyword("z"), persistentHashSet(3, persistentList(1, 2), 2)],
    [keyword("a"), persistentVector("x", eliscriptSymbol("article/title"))],
  );
  const reordered = persistentHashMap(
    [keyword("a"), persistentVector("x", eliscriptSymbol("article/title"))],
    [keyword("z"), persistentHashSet(2, 3, persistentList(1, 2))],
  );

  expect(printValue(value)).toBe(
    '{:a ["x" article/title] :z #{(1 2) 2 3}}',
  );
  expect(printValue(reordered)).toBe(printValue(value));
  roundTrip(value);
});

test("metadata and unsafe identifiers have lossless explicit forms", () => {
  const metadata = persistentHashMap(
    [keyword("source"), "data-text.test.mjs"],
    [keyword("line"), 7],
  );
  const annotated = withMeta(
    persistentVector(
      eliscriptSymbol("space name"),
      keyword("namespace with space", "name]"),
    ),
    metadata,
  );
  const printed = printValue(annotated);

  expect(printed).toBe(
    '^{:line 7 :source "data-text.test.mjs"} ' +
    '[#eliscript/symbol [nil "space name"] ' +
    '#eliscript/keyword ["namespace with space" "name]"]]',
  );
  const restored = roundTrip(annotated);
  expect(meta(restored).get(keyword("line"))).toBe(7);
  expect(restored.nth(0).name).toBe("space name");
  expect(restored.nth(1).namespace).toBe("namespace with space");
});

test("reader accepts ignored separators and reads multiple values", () => {
  expect(readValue("; header\n[1, 2 ; item\n 3]").toArray())
    .toEqual([1, 2, 3]);
  const values = readValues("1 :two\n(3 [4])");
  expect(Object.isFrozen(values)).toBe(true);
  expect(values[0]).toBe(1);
  expect(String(values[1])).toBe(":two");
  expect(values[2].toArray()).toEqual([3, persistentVector(4)]);
  expect(equalValues(values[2].nth(1), persistentVector(4))).toBe(true);
});

test("IPrint is open while unregistered host containers stay explicit", () => {
  class Point {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      Object.freeze(this);
    }
  }
  extendProtocolType(IPrint, Point, {
    print: (point, context) =>
      `#point [${context.print(point.x)} ${context.print(point.y)}]`,
  });

  expect(printValue(new Point(2, 3))).toBe("#point [2 3]");
  expect(() => printValue([])).toThrow(
    "protocol IPrint/print has no implementation for object:Array",
  );
  expect(() => printValue(new Map())).toThrow(
    "protocol IPrint/print has no implementation for object:Map",
  );
});

test("reader rejects malformed, duplicate, and unsupported data", () => {
  for (const [source, message] of [
    ["", "unexpected end of input"],
    ["[1 2", "unexpected end of vector"],
    ["{:a 1 :b}", "map requires a value for every key"],
    ["{:a 1 :a 2}", "duplicate map key"],
    ["#{1 1}", "duplicate set value"],
    ["^[] [1]", "metadata prefix requires a persistent map"],
    ["^{} :keyword", "value does not support metadata"],
    ["#unknown 1", "unknown dispatch #unknown"],
    ["(1 2", "unexpected end of list"],
    ["[1] trailing", "trailing data after value"],
  ]) {
    try {
      readValue(source);
      throw new Error(`expected ${source} to fail`);
    } catch (error) {
      expect(error).toBeInstanceOf(DataTextError);
      expect(error.code).toBe("ELI-DATA-TEXT");
      expect(error.message).toContain(message);
    }
  }

  try {
    readValue("[\n  1\n}");
  } catch (error) {
    expect(error.offset).toBe(6);
    expect(error.line).toBe(3);
    expect(error.column).toBe(1);
    expect(error.sourceLength).toBe(7);
  }
});

test("printer and reader enforce explicit resource limits", () => {
  const nested = persistentVector(persistentVector(persistentVector(0)));
  expect(() => printValue(nested, { maxDepth: 2 })).toThrow(
    "data text exceeds maxDepth 2",
  );
  expect(() => printValue(persistentVector(1, 2), { maxValues: 2 }))
    .toThrow("data text exceeds maxValues 2");
  expect(() => printValue("long", { maxLength: 3 }))
    .toThrow("data text exceeds maxLength 3");
  expect(() => readValue("[[[0]]]", { maxDepth: 2 }))
    .toThrow("data text exceeds maxDepth 2");
  expect(() => readValue("[1 2]", { maxValues: 2 }))
    .toThrow("data text exceeds maxValues 2");
  expect(() => readValue("[123]", { maxLength: 4 }))
    .toThrow("data text exceeds maxLength 4");
  expect(() => readValue("1", { maxDepth: 0 })).toThrow(TypeError);
  expect(() => readValue(1)).toThrow(TypeError);
});

test("generated nested values retain equality and canonical text", () => {
  let value = persistentVector();
  for (let index = 0; index < 2_000; index += 1) {
    const leaf = persistentVector(index, `value-${index % 17}`);
    if (index % 5 === 0) {
      value = value.conj(persistentHashMap([keyword("index"), index], [leaf, true]));
    } else if (index % 5 === 1) {
      value = value.conj(persistentHashSet(index, leaf));
    } else if (index % 5 === 2) {
      value = value.conj(eliscriptSymbol("generated", `value-${index}`));
    } else if (index % 5 === 3) {
      value = value.conj(persistentList(index, leaf));
    } else {
      value = value.conj(leaf);
    }
  }
  roundTrip(value);
});

test("canonical data text agrees under Bun and Node", async () => {
  const [bunReport, nodeReport] = await Promise.all([
    runHost("bun"),
    runHost(process.env.NODE ?? "node"),
  ]);
  expect(nodeReport).toEqual(bunReport);
  expect(bunReport).toEqual({
    text: '^{:source "host"} {:list (1 :two) :map {:a 1 :b 2} ' +
      ':set #{1 2 3} :vector [1 two]}',
    stable: true,
    equal: true,
    source: "host",
  });
});
