import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, mkdir, readdir, rm} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {extractRangeRows, packRangeRow} from '../tools/runtime/unicode-property-ranges.mjs';
import {extractLegacyPropertyAliases, compileLegacyPropertyAliasDecisions, packPropertyAliases, generatePropertyAliasSources} from '../tools/runtime/unicode-property-aliases.mjs';

const rangeDataPath = 'tools/runtime/unicode-property-ranges.json';
const rangeToolPath = 'tools/runtime/unicode-property-ranges.mjs';
const aliasDataPath = 'tools/runtime/unicode-property-aliases.json';
const aliasToolPath = 'tools/runtime/unicode-property-aliases.mjs';
const runtimePath = 'bootstrap/runtime/memory.eli';
const regexpPath = 'bootstrap/backends/regexp.eli';
const digest = value => createHash('sha256').update(value).digest('hex');

async function withTree(run) {
  const directory = await mkdtemp(resolve(tmpdir(), 'eliscript-unicode-property-generation-'));
  try {return await run(directory);} finally {await rm(directory, {recursive: true, force: true});}
}

async function treeFiles(directory, prefix = '') {
  const files = new Map();
  for (const entry of await readdir(resolve(directory, prefix), {withFileTypes: true})) {
    const name = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) for (const [file, bytes] of await treeFiles(directory, name)) files.set(file, bytes);
    else {assert(entry.isFile(), 'the maintenance fixture contains only owned regular files');files.set(name, await readFile(resolve(directory, name)));}
  }
  return new Map([...files].sort(([a], [b]) => a.localeCompare(b)));
}

function sameTree(actual, expected, label) {
  assert.deepEqual([...actual.keys()], [...expected.keys()], label + ' file inventory');
  for (const [file, bytes] of actual) assert(bytes.equals(expected.get(file)), label + ': exact complete bytes of ' + file);
}

async function seedTree(directory) {
  for (const file of [rangeDataPath, aliasDataPath, runtimePath, regexpPath]) {
    await mkdir(dirname(resolve(directory, file)), {recursive: true});
    const bytes = await readFile(file);
    await writeFile(resolve(directory, file), file === runtimePath || file === regexpPath
      ? ';; owned maintenance prefix\n' + bytes.toString('utf8') + '\n;; owned maintenance suffix\n' : bytes);
  }
}

function generate(tool, directory, mode = '--write') {
  return spawnSync(process.env.NODE ?? 'node', ['--max-old-space-size=128', resolve(tool), '--root', directory, mode],
    {encoding: 'utf8', timeout: 30000, maxBuffer: 65536});
}

function successful(child) {
  assert.equal(child.error, undefined);assert.equal(child.signal, null);assert.equal(child.status, 0, child.stderr);
}

test('complete declaration-driven property regeneration is deterministic offline and leaves every unrelated byte unchanged', async () => {
  await withTree(async directory => {
    await seedTree(directory);const before = await treeFiles(directory);
    successful(generate(rangeToolPath, directory));successful(generate(aliasToolPath, directory));
    const first = await treeFiles(directory);
    successful(generate(rangeToolPath, directory));successful(generate(aliasToolPath, directory));
    sameTree(await treeFiles(directory), first, 'second generation');
    successful(generate(rangeToolPath, directory, '--check'));successful(generate(aliasToolPath, directory, '--check'));
    sameTree(await treeFiles(directory), first, 'check mode must not write its inputs or outputs');
    for (const file of [rangeDataPath, aliasDataPath]) assert(first.get(file).equals(before.get(file)), 'exact declaration bytes of ' + file);
    for (const file of [runtimePath, regexpPath]) {
      const source = first.get(file).toString('utf8');assert.match(source, /Unicode-3\.0/);
      assert(source.includes('https://www.unicode.org/license.txt'));
      assert(source.startsWith(';; owned maintenance prefix\n'));assert(source.endsWith('\n;; owned maintenance suffix\n'));
    }
    const tools = await Promise.all([rangeToolPath, aliasToolPath].map(file => readFile(file, 'utf8')));
    for (const source of tools) {
      assert.doesNotMatch(source, /\bfetch\s*\(|\b(?:eval|Function)\s*\(|\b(?:execFile|spawn)(?:Sync)?\s*\(/,
        'normal maintenance generation uses declaration data without a network, compiler, or expression evaluator');
    }
  });
}, 30000);

test('invalid complete range declarations fail before any output write rather than dropping or repairing rows', async () => {
  await withTree(async directory => {
    await seedTree(directory);const original = JSON.parse(await readFile(rangeDataPath, 'utf8'));
    const invalid = [
      value => {delete value.rows;}, value => {value.rows.pop();},
      value => {value.rows[1].id = value.rows[0].id;}, value => {value.rows[0].id = -1;},
      value => {value.rows[0].ranges = [[9, 8]];}, value => {value.rows[0].ranges = [[1, 4], [4, 5]];},
      value => {value.rows[0].ranges = [[10, 12], [0, 2]];},
      value => {value.rows[0].ranges = [[-1, 0]];}, value => {value.rows[0].ranges = [[0, 0x110000]];},
      value => {value.rows[0].ranges = [[1.5, 2]];}, value => {value.rows[0].ranges = [[null, 1]];},
      value => {value.rows[0].ranges = [[0]];}, value => {value.rows[0].sourceSha256 = 'not-a-sha256';},
      value => {value.version = 2;}, value => {value.format = 'unrelated';},
      value => {value.license = 'unknown';}, value => {delete value.licenseUrl;},
    ];
    for (let index = 0; index < invalid.length; index++) {
      const input = structuredClone(original);invalid[index](input);
      await writeFile(resolve(directory, rangeDataPath), JSON.stringify(input) + '\n');
      const before = await treeFiles(directory), child = generate(rangeToolPath, directory);
      assert.equal(child.error, undefined);assert.equal(child.signal, null);assert.notEqual(child.status, 0, 'invalid range variant ' + index);
      sameTree(await treeFiles(directory), before, 'no output changes for invalid range variant ' + index);
    }
    await writeFile(resolve(directory, rangeDataPath), JSON.stringify(original) + '\n');successful(generate(rangeToolPath, directory));
    successful(generate(rangeToolPath, directory, '--check'));
    const before = await treeFiles(directory), child = spawnSync(process.env.NODE ?? 'node',
      ['--max-old-space-size=128', resolve(rangeToolPath), '--root', directory, '--extract', '--write'],
      {encoding: 'utf8', timeout: 30000, maxBuffer: 65536});
    assert.equal(child.error, undefined);assert.equal(child.signal, null);assert.notEqual(child.status, 0);
    sameTree(await treeFiles(directory), before, 'first migration cannot overwrite an existing declaration provenance');
  });
}, 30000);

test('complete checked-in Unicode property intervals retain all 519 exact row identities and original source provenance', async () => {
  const text = await readFile(rangeDataPath, 'utf8'), declaration = JSON.parse(text);
  assert.equal(declaration.format, 'eliscript-unicode-property-ranges');assert.equal(declaration.version, 1);
  assert.equal(declaration.license, 'Unicode-3.0');assert.equal(declaration.licenseUrl, 'https://www.unicode.org/license.txt');
  assert.equal(declaration.rows.length, 519);
  assert.deepEqual(declaration.rows.map(row => row.id), Array.from({length: 519}, (_, index) => index));
  for (const row of declaration.rows) {
    assert.match(row.sourceSha256, /^[a-f0-9]{64}$/);assert(Array.isArray(row.ranges));
    let previous = -1;
    for (const interval of row.ranges) {
      assert.equal(interval.length, 2);const [low, high] = interval;
      assert(Number.isInteger(low) && Number.isInteger(high));
      assert(low >= 0 && high <= 0x10ffff && low <= high);assert(low > previous);
      previous = high;
    }
    const words = packRangeRow(row);assert.equal(words.length, 1 + row.ranges.length * 2);assert.equal(words[0], row.ranges.length);
    const decoded = [];
    for (let index = 0; index < words[0]; index++) decoded.push([words[1 + index * 2], words[2 + index * 2]]);
    assert.deepEqual(decoded, row.ranges, 'all packed intervals preserve row ' + row.id);
    const bytes = Buffer.alloc(words.length * 4);words.forEach((word, index) => bytes.writeUInt32LE(word, index * 4));
    for (let index = 0; index < row.ranges.length; index++)
      assert.deepEqual([bytes.readUInt32LE(4 + index * 8), bytes.readUInt32LE(8 + index * 8)], row.ranges[index]);
  }
  assert.equal(await readFile(rangeDataPath, 'utf8'), text, 'reading declaration data never repairs or regenerates its provenance');
});

test('legacy range migration derives exact mathematical intervals and normalized source hashes without enumerating or executing point predicates', () => {
  const rows = [
    ['(defun heap-regexp-property-ranges-7 (point) (if (< point 10) (if (<= point 4) 0 1) (if (<= point 20) (if (< point 15) 0 1) 0)))', [[5, 9], [15, 20]]],
    ['(defun heap-regexp-property-ranges-44 (point) (if (<= point 1114111) (if (< point 1114111) 0 1) 0))', [[0x10ffff, 0x10ffff]]],
    ['(defun heap-regexp-property-ranges-101 (point) 1)', [[0, 0x10ffff]]],
    ['(defun heap-regexp-property-ranges-102 (point) 0)', []],
  ];
  const source = '(module source\n  ' + rows.map(([text]) => text).join('\n\t') + '\n)';
  const actual = extractRangeRows(source);assert.equal(actual.length, rows.length);
  for (let index = 0; index < rows.length; index++) {
    assert.deepEqual(actual[index].ranges, rows[index][1]);
    assert.equal(actual[index].sourceSha256, digest(rows[index][0].replace(/\s+/g, '')));
  }
  assert.deepEqual(extractRangeRows(source.replaceAll('(< point', '(< \n\tpoint').replaceAll('(<= point', '(<= \n\tpoint')), actual);
  for (const body of ['(if (> point 1) 0 1)', '(if (< other 4) 0 1)', '(if (< point 4) 2 0)',
    '(if (< point 4) (foreign-call point) 0)', '(progn 1)', '(if (< point 4) 1)', '(if (< point 1.5) 0 1)'])
    assert.throws(() => extractRangeRows('(defun heap-regexp-property-ranges-7 (point) ' + body + ')'));
  assert.throws(() => extractRangeRows(rows[0][0] + '\n' + rows[0][0]), 'duplicate original function identity is not merged');
  assert.throws(() => extractRangeRows(rows[0][0].slice(0, -1)), 'an incomplete original expression is not repaired');
});

test('all declared property aliases retain their exact IDs terminal contracts packed directory and static dynamic source provenance', async () => {
  const data = JSON.parse(await readFile(aliasDataPath, 'utf8'));
  assert.equal(data.format, 'eliscript-unicode-property-aliases');assert.equal(data.version, 1);
  assert.equal(data.license, 'Unicode-3.0');assert.deepEqual(data.unicodeVersions, ['15.1.0', '16.0.0', '17.0.0']);
  assert.match(data.sourceSHA256, /^[a-f0-9]{64}$/);assert.match(data.runtimeSourceSHA256, /^[a-f0-9]{64}$/);
  assert.equal(data.records.length, 1715);
  const packed = packPropertyAliases(data);assert.equal(packed.count, data.records.length);assert.equal(packed.byteLength, packed.units.length * 2);
  let cursor = packed.count * 4;
  for (let index = 0; index < packed.count; index++) {
    const at = index * 4, offset = packed.units[at] + packed.units[at + 1] * 65536;
    assert.equal(offset, cursor, 'every declared record owns its exact contiguous UTF16 payload');
    const length = packed.units[offset], text = String.fromCharCode(...packed.units.slice(offset + 1, offset + 1 + length));
    assert.deepEqual([text, packed.units[at + 2], packed.units[at + 3]], data.records[index]);cursor += 1 + length;
  }
  assert.equal(cursor, packed.units.length);
  const literal = JSON.parse(packed.literal);assert.equal(literal.length, packed.units.length);
  for (let index = 0; index < literal.length; index++) assert.equal(literal.charCodeAt(index), packed.units[index]);
  const generated = generatePropertyAliasSources(data);
  assert.deepEqual(generatePropertyAliasSources(structuredClone(data)), generated);
  for (const [file, source] of [[regexpPath, generated.staticSource], [runtimePath, generated.runtimeSource]]) {
    const actual = await readFile(file, 'utf8');assert(actual.includes(source));
    assert(source.includes(packed.literal));assert(source.includes(data.sourceSHA256));assert(source.includes(data.runtimeSourceSHA256));
    assert(source.includes('Unicode-3.0'));assert(source.includes('https://www.unicode.org/license.txt'));
    assert.doesNotMatch(source, /\(if \(< unit [0-9]+|\(let \(\(unit \((?:heap-regexp-unit|string-code-unit-at)/);
  }
  assert.match(generated.runtimeSource, /\(copy-static-u16 destination /);
});

test('legacy alias extraction preserves exact versus prefix terminals private partitions and both original source hashes with a restricted grammar', () => {
  const branch = '(if (= unit 65) 7 (if (= unit 66) (if (= length 1) 8 0) 0))';
  const source = '(defun regexp-property-id-base (source start length) (if (= length 0) 0 (let ((unit (string-code-unit-at source (+ start 0)))) ' + branch + ')))';
  const expected = [['A', 7, 0], ['B', 8, 1]], parsed = extractLegacyPropertyAliases(source);
  assert.deepEqual(parsed.records, expected);assert.equal(parsed.sourceSHA256, digest(source));
  const split = source.replace(branch, '(regexp-property-id-base-part-0001 source start length unit)') +
    '\n(defun regexp-property-id-base-part-0001 (source start length unit) ' + branch + ')';
  assert.deepEqual(extractLegacyPropertyAliases(split), parsed);
  const runtime = source.replaceAll('regexp-property-id-base', 'heap-regexp-property-id-base')
    .replace('(source start length)', '(heap source start length)')
    .replace('string-code-unit-at source', 'heap-regexp-unit heap source');
  const runtimeResult = extractLegacyPropertyAliases(runtime, 'heap-regexp-property-id-base', true);
  assert.deepEqual(runtimeResult.records, expected);assert.equal(runtimeResult.sourceSHA256, digest(runtime));
  for (const invalid of [source.replace(branch, '(host-call source)'), source.replace('(+ start 0)', '(+ start -1)'),
    source.replace('string-code-unit-at', 'foreign-reader'), source.replace('(= unit 65)', '(= unit 128)'),
    source.replace(') 7 ', ') 65536 '), source + '\n' + source, source.slice(0, -1)])
    assert.throws(() => extractLegacyPropertyAliases(invalid));
});

test('every generated property row contains its exact little-endian static data once and retains the declaration provenance without a decision tree', async () => {
  const data = JSON.parse(await readFile(rangeDataPath, 'utf8')), source = await readFile(runtimePath, 'utf8');
  const begin = '  ;; BEGIN GENERATED UNICODE PROPERTY RANGES', end = '  ;; END GENERATED UNICODE PROPERTY RANGES';
  const first = source.indexOf(begin), last = source.indexOf(end, first);assert(first >= 0 && last > first);
  assert.equal(source.indexOf(begin, first + begin.length), -1);assert.equal(source.indexOf(end, last + end.length), -1);
  const region = source.slice(first, last + end.length);
  const rows = [...region.matchAll(/;; Original range ([0-9]+) normalized-source SHA-256 ([a-f0-9]{64})\n  \(defun heap-regexp-property-ranges-\1 \(point\)([\s\S]*?)(?=\n  ;; Original range |\n  ;; END GENERATED UNICODE PROPERTY RANGES)/g)];
  assert.equal(rows.length, 519);
  for (let index = 0; index < rows.length; index++) {
    const row = data.rows[index], emitted = rows[index];assert.equal(Number(emitted[1]), row.id);assert.equal(emitted[2], row.sourceSha256);
    const copies = [...emitted[3].matchAll(/\(copy-static-u16 table ("(?:\\u[0-9a-f]{4})*")\)/g)];
    assert.equal(copies.length, 1, 'one static copy node per complete row ' + row.id);
    const text = JSON.parse(copies[0][1]), words = packRangeRow(row);assert.equal(text.length, words.length * 2);
    for (let word = 0; word < words.length; word++)
      assert.equal(text.charCodeAt(word * 2) + text.charCodeAt(word * 2 + 1) * 65536, words[word]);
    assert.doesNotMatch(emitted[3], /\((?:<|<=) point [0-9]/, 'point intervals remain data rather than repeated branch code');
    assert(emitted[3].includes('(heap-regexp-property-range-find table point)'));
  }
  assert.equal([...source.matchAll(/\(defun heap-regexp-property-ranges-[0-9]+ \(point\)/g)].length, 519);
  assert(region.includes('Unicode-3.0'));assert(region.includes(data.licenseUrl));
});

test('invalid complete alias declarations are rejected before either static or dynamic generated file changes', async () => {
  await withTree(async directory => {
    await seedTree(directory);const original = JSON.parse(await readFile(aliasDataPath, 'utf8'));
    const variants = [
      value => {delete value.records;}, value => {value.records = [];},
      value => {value.records[1] = value.records[0].slice();}, value => {value.records.reverse();},
      value => {value.records[0][0] = 'bad-name';}, value => {value.records[0][0] = '\ud800';},
      value => {value.records[0][1] = 0;}, value => {value.records[0][1] = 65536;},
      value => {value.records[0][2] = 2;}, value => {value.records[0].push('extra');},
      value => {value.sourceSHA256 = 'bad';}, value => {delete value.runtimeSourceSHA256;},
      value => {value.license = 'unknown';}, value => {value.unicodeVersions = [];},
      value => {value.version = 2;}, value => {value.format = 'other';},
      value => {delete value.legacyDecisions;}, value => {value.legacyDecisions.sourceSHA256 = '0'.repeat(64);},
      value => {value.legacyDecisions.nodes[0] = [5, 0, 0, 0];},
      value => {value.legacyDecisions.nodes[0] = [1, 0, value.legacyDecisions.nodes.length, 0];},
      value => {value.legacyDecisions.nodes[value.legacyDecisions.root] = [4, 0, value.legacyDecisions.root, 0];},
    ];
    for (let index = 0; index < variants.length; index++) {
      const input = structuredClone(original);variants[index](input);
      await writeFile(resolve(directory, aliasDataPath), JSON.stringify(input) + '\n');
      const before = await treeFiles(directory), child = generate(aliasToolPath, directory);
      assert.equal(child.error, undefined);assert.equal(child.signal, null);assert.notEqual(child.status, 0, 'invalid alias variant ' + index);
      sameTree(await treeFiles(directory), before, 'no partial static/dynamic write for invalid alias variant ' + index);
    }
    await writeFile(resolve(directory, aliasDataPath), JSON.stringify(original) + '\n');successful(generate(aliasToolPath, directory));
    successful(generate(aliasToolPath, directory, '--check'));
  });
}, 30000);

test('compact legacy alias decisions preserve the complete original declaration source and every packed decision without executable trie expansion', async () => {
  const data = JSON.parse(await readFile(aliasDataPath, 'utf8'));
  const original = await readFile('tests/fixtures/regexp-property-original-trie.eli', 'utf8');
  assert.deepEqual(compileLegacyPropertyAliasDecisions(original), data.legacyDecisions);
  const generated = generatePropertyAliasSources(data);
  const literal = /\(defun regexp-property-legacy-table \(\) ("(?:\\u[0-9a-f]{4})*")\)/.exec(generated.staticSource);
  assert(literal);const units = JSON.parse(literal[1]), nodes = data.legacyDecisions.nodes;
  assert.equal(units.length, nodes.length * 8);
  for (let index = 0; index < nodes.length; index++) for (let field = 0; field < 4; field++) {
    const at = index * 8 + field * 2;
    assert.equal(units.charCodeAt(at) + units.charCodeAt(at + 1) * 65536, nodes[index][field]);
  }
  const source = '(defun regexp-property-id-base (source start length) (if (= length 0) 0 (let ((unit (string-code-unit-at source (+ start 0)))) (if (= unit 65) 7 (if (= unit 66) (if (= length 1) 8 0) 0)))))';
  const tiny = compileLegacyPropertyAliasDecisions(source);assert.equal(tiny.sourceSHA256, digest(source));
  function lookup(text) {
    let point = tiny.root, unit = 0, visits = 0;const trace = [];
    for (;;) {
      assert(++visits <= tiny.nodes.length, 'the accepted compact decision graph terminates');
      const [kind, number, yes, no] = tiny.nodes[point];
      if (kind === 0) return {value: number, trace};
      if (kind === 4) {trace.push(number);unit = text.charCodeAt(number);point = yes;}
      else point = (kind === 1 ? unit < number : kind === 2 ? unit === number : text.length === number) ? yes : no;
    }
  }
  assert.deepEqual(lookup(''), {value: 0, trace: []});
  for (const value of ['A', 'Asuffix']) assert.deepEqual(lookup(value), {value: 7, trace: [0]});
  assert.deepEqual(lookup('B'), {value: 8, trace: [0]});
  for (const value of ['Bsuffix', 'C', '\ud800']) assert.deepEqual(lookup(value), {value: 0, trace: [0]});
});
