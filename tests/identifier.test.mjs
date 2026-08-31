import { expect, test } from "bun:test";

import {
  EliscriptSymbol,
  Keyword,
  eliscriptSymbol,
  identifierName,
  identifierNamespace,
  isEliscriptSymbol,
  isIdentifier,
  isKeyword,
  keyword,
  qualifiedIdentifierName,
} from "../runtime/core/identifier.mjs";
import { persistentHashMap } from "../runtime/core/map.mjs";
import { persistentHashSet } from "../runtime/core/set.mjs";
import { equalValues, hashValue } from "../runtime/core/value.mjs";

test("keywords are immutable, interned qualified identifiers", () => {
  const title = keyword("article/title");
  expect(title).toBe(keyword("article", "title"));
  expect(keyword(title)).toBe(title);
  expect(title).toBeInstanceOf(Keyword);
  expect(Object.isFrozen(title)).toBe(true);
  expect(Object.prototype.toString.call(title)).toBe(
    "[object EliscriptKeyword]",
  );
  expect(String(title)).toBe(":article/title");
  expect(identifierNamespace(title)).toBe("article");
  expect(identifierName(title)).toBe("title");
  expect(qualifiedIdentifierName(title)).toBe("article/title");
  expect(isKeyword(title)).toBe(true);
  expect(isEliscriptSymbol(title)).toBe(false);
  expect(isIdentifier(title)).toBe(true);

  const type = Object.getOwnPropertyDescriptor(
    title,
    Symbol.for("eliscript.value.type"),
  );
  expect(type).toMatchObject({ value: "keyword", enumerable: false });
  expect(() => JSON.stringify(title)).toThrow(
    "Keyword values require an explicit serialization codec",
  );
  expect(() => new Keyword()).toThrow(
    "Keyword values must be created with keyword()",
  );
});

test("symbols have value identity without interning", () => {
  const left = eliscriptSymbol("article/title");
  const right = eliscriptSymbol("article", "title");
  expect(left).not.toBe(right);
  expect(eliscriptSymbol(left)).toBe(left);
  expect(left).toBeInstanceOf(EliscriptSymbol);
  expect(Object.isFrozen(left)).toBe(true);
  expect(Object.prototype.toString.call(left)).toBe(
    "[object EliscriptSymbol]",
  );
  expect(String(left)).toBe("article/title");
  expect(isKeyword(left)).toBe(false);
  expect(isEliscriptSymbol(left)).toBe(true);
  expect(isIdentifier(left)).toBe(true);
  expect(equalValues(left, right)).toBe(true);
  expect(hashValue(left)).toBe(hashValue(right));
  expect(equalValues(left, keyword("article/title"))).toBe(false);
  expect(hashValue(left)).not.toBe(hashValue(keyword("article/title")));
  expect(() => JSON.stringify(left)).toThrow(
    "EliscriptSymbol values require an explicit serialization codec",
  );
  expect(() => new EliscriptSymbol()).toThrow(
    "EliscriptSymbol values must be created with eliscriptSymbol()",
  );
});

test("identifier constructors validate their canonical shape", () => {
  for (const invalid of ["", "/name", "namespace/", "a/b/c"]) {
    expect(() => keyword(invalid)).toThrow();
    expect(() => eliscriptSymbol(invalid)).toThrow();
  }
  expect(() => keyword()).toThrow(
    "keyword expects one qualified name or namespace and name",
  );
  expect(() => keyword(null, "name")).not.toThrow();
  expect(() => keyword("", "name")).toThrow(
    "keyword namespace must be a non-empty string",
  );
  expect(() => keyword("namespace", "a/b")).toThrow(
    "keyword name cannot contain /",
  );
  expect(() => identifierName({ name: "plain" })).toThrow(
    "expected an Eliscript keyword or symbol",
  );
  const hostile = new Proxy({}, {
    getOwnPropertyDescriptor() {
      throw new Error("host trap");
    },
  });
  expect(isIdentifier(hostile)).toBe(false);
  expect(equalValues(keyword("safe"), hostile)).toBe(false);
});

test("persistent maps and sets use identifier value semantics", () => {
  const map = persistentHashMap(
    [keyword("article/title"), "keyword"],
    [eliscriptSymbol("article/title"), "symbol"],
  );
  expect(map.count).toBe(2);
  expect(map.get(keyword("article", "title"))).toBe("keyword");
  expect(map.get(eliscriptSymbol("article", "title"))).toBe("symbol");

  const set = persistentHashSet(
    eliscriptSymbol("article/title"),
    eliscriptSymbol("article", "title"),
    keyword("article/title"),
  );
  expect(set.count).toBe(2);
  expect(set.has(eliscriptSymbol("article/title"))).toBe(true);
  expect(set.has(keyword("article/title"))).toBe(true);
});
