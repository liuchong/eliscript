import { expect, test } from "bun:test";
import { parse, encode } from "../runtime/wire/markdown.mjs";
import { validate } from "../runtime/wire/schema.mjs";

test("structured Markdown preserves nested data, comments, tables and element arrays", () => {
  const data = { version: "001", User: { name: "小明", nested: { ok: true }, values: [1, null, "a|b"], rows: [{ a: 1, b: "x" }, { b: false }], mixed: [{ one: 1 }, [2], "x"] } };
  expect(parse(encode(data))).toEqual(data);
  expect(parse('<!--\n# hidden\n-->\n```md\n- hidden: 1\n```\n# A\n- key: \\x\n### note\n## B\n- x: "\\q"\n')).toEqual({ A: { key: "\\x", B: { x: "\\q" } } });
  expect(parse('# A\n| a | b |\n| --- | --- |\n| | null |\n')).toEqual({ A: [{ b: null }] });
  expect(parse('# A\n- a:\n  - :\n    - k: 2\n  - : false\n')).toEqual({ A: { a: [{ k: 2 }, false] } });
  expect(parse('- __proto__:\n  - polluted: true\n')).toEqual(JSON.parse('{"__proto__":{"polluted":true}}'));
  expect({}.polluted).toBeUndefined();
});

test("structural errors carry protocol codes and one-based lines", () => {
  for (const [source, code] of [
    ['## orphan', 'MDP-E001'], ['# A\n- x: 1\n| a | b |\n| --- | --- |', 'MDP-E002'],
    ['- x: 1\n- x: 2', 'MDP-E003'], ['# A\n| a | b |\n| --- | --- |\n| 1 |', 'MDP-E004'],
    ['# A\n| a | a |\n| --- | --- |', 'MDP-E005'], ['| a |\n| --- |', 'MDP-E006'],
    ['# ', 'MDP-E007'], ['- a:\n    - b: 1', 'MDP-E009'], ['\t- a: 1', 'MDP-E009'],
  ]) {
    try { parse(source); throw new Error('expected failure'); }
    catch (error) { expect(error.code).toBe(code); expect(error.line).toBeGreaterThan(0); }
  }
  expect(() => encode({ bad: NaN })).toThrow();
  expect(() => encode({ bad: undefined })).toThrow();
  const cyclic = {}; cyclic.self = cyclic;
  expect(() => encode(cyclic)).toThrow();
  expect(() => parse('- a: 1', { maxLength: 2 })).toThrow();
  expect(() => parse('# ###')).toThrow('MDP-E007');
  expect(() => parse('# A\n| value |\n| --- |\n\t| 1 |')).toThrow('MDP-E009');
  expect(parse(encode({ x: '1e999', y: '\u0000\n', z: '{}', q: '[]' }))).toEqual({ x: '1e999', y: '\u0000\n', z: '{}', q: '[]' });
  expect(() => encode({ sparse: Array(2) })).toThrow('Sparse');
  expect(parse('<span>inline</span>\n# A\n- ok: true')).toEqual({ A: { ok: true } });
});

test('structured wire round trips a deterministic nested value corpus', () => {
  const values = [null, true, false, 42, -1.25, '', '{}', '[]', 'null', '😀', 'a|b', '"quotes"', 'a\\n', '\n\t', {}, []];
  for (let i = 0; i < 128; i++) {
    const value = values[i % values.length];
    const data = { stamp: i, Data: { scalar: value, nested: { value }, records: [{ key: value, other: i }, { other: i + 1 }], mixed: [value, { key: value }, [value], {}] } };
    expect(parse(encode(data))).toEqual(data);
  }
});

test("schema validates open-world sections, nested paths and scalar constraints", () => {
  const schema = { mds: '0.1', Sections: [{ name: 'User', kind: 'object', required: true, additional: false }], User: [{ name: 'name', type: 'string', required: true, min_len: 2 }, { name: 'age', type: 'int', min: 0, max: 100 }], 'User.Address': [{ name: 'zip', type: 'string', pattern: '^\\d{5}$' }] };
  expect(validate({ User: { name: '😀中', age: 42, Address: { zip: '12345' } }, Extra: {} }, schema)).toEqual({ valid: true, errors: [] });
  const bad = validate({ User: { name: 'x', age: '42', unknown: true, Address: { zip: 'bad' } } }, schema);
  expect(bad.valid).toBe(false);
  expect(bad.errors.map(e => e.rule)).toEqual(expect.arrayContaining(['min_len', 'type', 'additional', 'pattern']));
  expect(validate({}, schema).errors[0].rule).toBe('required');
  expect(() => validate({}, { mds: '9' })).toThrow();
  expect(() => validate({}, { mds: '0.1', A: {} })).toThrow();
  expect(() => validate({}, { mds: '0.1', A: [{ name: 'n', type: 'int', min: 5, max: 2 }] })).toThrow('Inverted');
  expect(validate({ A: { d: '2023-02-29' } }, { mds: '0.1', A: [{ name: 'd', type: 'date' }] }).valid).toBe(false);
});
