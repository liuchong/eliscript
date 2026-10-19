// Maintenance only. The compiler consumes checked-in data without fetching
// Unicode files, compiling a legacy function, or invoking a host matcher.
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const maximumPoint = 0x10ffff;
const rowCount = 519;
const begin = '  ;; BEGIN GENERATED UNICODE PROPERTY RANGES';
const end = '  ;; END GENERATED UNICODE PROPERTY RANGES';
const dataFile = 'tools/runtime/unicode-property-ranges.json';
const runtimeFile = 'bootstrap/runtime/memory.eli';
const licenseUrl = 'https://www.unicode.org/license.txt';
const hash = text => createHash('sha256').update(text).digest('hex');

function integer(token) {
  if (!/^-?(?:0|[1-9][0-9]*)$/.test(token)) return undefined;
  const value = Number(token);
  if (!Number.isSafeInteger(value) || value < -4294967296 || value > 4294967295)
    throw Error('legacy range bound exceeds the supported integer domain');
  return value;
}

// This is a parser for the generated decision-tree grammar, not an Eliscript
// evaluator. In particular, even an unreachable unknown call is rejected.
function parseTree(source) {
  const tokens = source.match(/[()]|[^\s()]+/g) ?? [];
  let index = 0;
  const read = depth => {
    if (depth > 128 || index >= tokens.length) throw Error('invalid legacy range tree');
    const token = tokens[index++];
    if (token === ')') throw Error('unexpected legacy range close');
    if (token !== '(') return integer(token) ?? token;
    const list = [];
    while (index < tokens.length && tokens[index] !== ')') list.push(read(depth + 1));
    if (tokens[index++] !== ')') throw Error('unterminated legacy range tree');
    return list;
  };
  const tree = read(0);
  if (index !== tokens.length) throw Error('trailing legacy range tree data');
  return tree;
}

function treeRanges(tree) {
  const ranges = [];
  const visit = (node, low, high) => {
    if (node === 0 || node === 1) {
      if (node === 1 && low <= high) {
        const previous = ranges[ranges.length - 1];
        if (previous && previous[1] + 1 === low) previous[1] = high;
        else ranges.push([low, high]);
      }
      return;
    }
    if (!Array.isArray(node) || node.length !== 4 || node[0] !== 'if')
      throw Error('unsupported legacy range expression');
    const condition = node[1];
    if (!Array.isArray(condition) || condition.length !== 3 ||
        !['<', '<='].includes(condition[0]) || condition[1] !== 'point' ||
        !Number.isSafeInteger(condition[2])) throw Error('unsupported legacy range comparison');
    const boundary = condition[2] - (condition[0] === '<' ? 1 : 0);
    visit(node[2], low, Math.min(high, boundary));
    visit(node[3], Math.max(low, boundary + 1), high);
  };
  visit(tree, 0, maximumPoint);
  return ranges;
}

// Exposed for permanent migration tests, including small mathematical trees.
// Each original function is parsed independently so no whole-runtime AST lives
// alongside the extracted declaration. Hashes describe source provenance only.
export function extractRangeRows(source) {
  if (typeof source !== 'string') throw TypeError('range source must be a string');
  const matcher = /\(defun heap-regexp-property-ranges-([0-9]+)\s+\(point\)/g;
  const rows = [], ids = new Set();
  for (let match; (match = matcher.exec(source));) {
    const id = Number(match[1]);
    if (!Number.isSafeInteger(id) || ids.has(id)) throw Error('duplicate or invalid legacy range ID');
    ids.add(id);
    let position = matcher.lastIndex, depth = 1;
    for (; position < source.length && depth; position++) {
      if (source[position] === '(') depth++;
      else if (source[position] === ')') depth--;
    }
    if (depth) throw Error('unterminated legacy range function');
    const original = source.slice(match.index, position);
    const body = source.slice(matcher.lastIndex, position - 1);
    rows.push({id, ranges: treeRanges(parseTree(body)), sourceSha256: hash(original.replace(/\s/g, ''))});
    matcher.lastIndex = position;
  }
  if (!rows.length) throw Error('no legacy range functions found');
  return rows.sort((left, right) => left.id - right.id);
}

function validateRow(row) {
  if (!row || !Number.isInteger(row.id) || row.id < 0 || row.id >= rowCount ||
      typeof row.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.sourceSha256) || !Array.isArray(row.ranges))
    throw Error('invalid Unicode range row identity');
  let previous = -1;
  for (const range of row.ranges) {
    if (!Array.isArray(range) || range.length !== 2) throw Error('invalid Unicode interval');
    const [low, high] = range;
    if (!Number.isInteger(low) || !Number.isInteger(high) || low <= previous ||
        low < 0 || high > maximumPoint || low > high) throw Error('invalid Unicode interval order or bounds');
    previous = high;
  }
}

export function packRangeRow(row) {
  validateRow(row);
  const words = [row.ranges.length];
  for (const [low, high] of row.ranges) words.push(low, high);
  return words;
}

function validateDeclaration(value) {
  if (!value || value.format !== 'eliscript-unicode-property-ranges' || value.version !== 1 ||
      value.license !== 'Unicode-3.0' || value.licenseUrl !== licenseUrl ||
      !Array.isArray(value.rows) || value.rows.length !== rowCount)
    throw Error('invalid complete Unicode property declaration');
  for (let index = 0; index < rowCount; index++) {
    const row = value.rows[index];validateRow(row);
    if (row.id !== index) throw Error('missing, duplicate, or unsorted Unicode property row');
  }
}

function literal(words) {
  return '"' + words.map(word => '\\u' + (word & 65535).toString(16).padStart(4, '0') +
    '\\u' + (word >>> 16).toString(16).padStart(4, '0')).join('') + '"';
}

function generate(declaration) {
  validateDeclaration(declaration);
  const maximumBytes = Math.max(...declaration.rows.map(row => (1 + row.ranges.length * 2) * 4));
  let source = begin + '\n' +
    '  ;; Unicode 15.1 / 16.0 / 17.0 property rows; Unicode-3.0: ' + licenseUrl + '\n' +
    '  ;; Reproduce offline with tools/runtime/unicode-property-ranges.mjs --write.\n' +
    '  ;; Each literal is little-endian u32 [count, inclusiveLow, inclusiveHigh, ...].\n' +
    '  ;; Word 44 owns one instance-private raw buffer; word 48 is cached row ID+1.\n' +
    '  ;; The buffer holds no heap handles and survives retire, like code constants.\n' +
    '  ;; It is never reclaimed/reused by heap GC and allocates only once, not per row.\n' +
    '  (defun heap-regexp-property-range-table ()\n' +
    '    (initialize)\n' +
    '    (let ((table (load-u32 44)))\n' +
    '      (when (= table 0)\n' +
    `        (setq table (allocate ${maximumBytes}))\n` +
    '        (when (/= table 0) (store-u32 44 table))) table))\n' +
    '  (defun heap-regexp-property-range-find (table point)\n' +
    '    (let ((low 0) (high (load-u32 table)) (found 0))\n' +
    '      (while (< low high)\n' +
    '        (let* ((middle (word-div (+ low high) 2)) (entry (+ table (+ 4 (* middle 8)))))\n' +
    '          (if (< point (load-u32 entry)) (setq high middle)\n' +
    '            (if (> point (load-u32 (+ entry 4))) (setq low (1+ middle))\n' +
    '              (progn (setq found 1) (setq low high)))))) found))\n';
  for (const row of declaration.rows) {
    const words = packRangeRow(row);
    source += `  ;; Original range ${row.id} normalized-source SHA-256 ${row.sourceSha256}\n` +
      `  (defun heap-regexp-property-ranges-${row.id} (point)\n` +
      '    (if (> point 1114111) 0\n' +
      '      (let ((table (heap-regexp-property-range-table)))\n' +
      '        (if (= table 0) 0\n' +
      '          (progn\n' +
      `            (when (/= (load-u32 48) ${row.id + 1})\n` +
      `              (copy-static-u16 table ${literal(words)})\n` +
      `              (store-u32 48 ${row.id + 1}))\n` +
      '            (heap-regexp-property-range-find table point))))))\n';
  }
  return {source: source + end, maximumBytes};
}

function replaceRegion(source, generated, extracting) {
  let first = source.indexOf(begin), last = source.indexOf(end);
  if (first >= 0 || last >= 0) {
    if (first < 0 || last < first || source.indexOf(begin, first + begin.length) >= 0 ||
        source.indexOf(end, last + end.length) >= 0) throw Error('invalid generated Unicode range region');
    return source.slice(0, first) + generated + source.slice(last + end.length);
  }
  if (!extracting) throw Error('missing generated Unicode range region');
  const match = /^  \(defun heap-regexp-property-ranges-0 \(point\)/m.exec(source);
  last = source.indexOf('  (defun heap-regexp-property-contains-151 ', match?.index ?? 0);
  if (!match || last < match.index) throw Error('missing legacy Unicode range region');
  first = match.index;
  // The extractor has already validated every function. Refuse to discard any
  // unexpected intervening code rather than silently broadening the migration.
  const region = source.slice(first, last);
  if (region.split('\n').filter(line => line.trim()).length !== rowCount)
    throw Error('unexpected code between legacy Unicode range functions');
  return source.slice(0, first) + generated + '\n' + source.slice(last);
}

async function main(args) {
  let root = fileURLToPath(new URL('../../', import.meta.url)), mode, extracting = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--root' && args[index + 1]) root = resolve(args[++index]);
    else if (arg === '--extract') extracting = true;
    else if (arg === '--write' || arg === '--check') {
      if (mode) throw Error('choose exactly one generation mode');mode = arg;
    } else throw Error('unknown or incomplete Unicode range option');
  }
  if (!mode || (extracting && mode !== '--write')) throw Error('require --write or --check; extraction requires --write');
  const filename = resolve(root, runtimeFile), declarationPath = resolve(root, dataFile);
  const source = await readFile(filename, 'utf8');
  let declaration;
  if (extracting) {
    try {await readFile(declarationPath);throw Error('range declaration exists; refusing to replace its provenance');}
    catch (error) {if (error.code !== 'ENOENT') throw error;}
    declaration = {format: 'eliscript-unicode-property-ranges', version: 1,
      license: 'Unicode-3.0', licenseUrl, rows: extractRangeRows(source)};
  } else declaration = JSON.parse(await readFile(declarationPath, 'utf8'));
  const generated = generate(declaration), next = replaceRegion(source, generated.source, extracting);
  if (mode === '--write') {
    if (extracting) await writeFile(declarationPath, JSON.stringify(declaration, null, 2) + '\n', {flag: 'wx'});
    await writeFile(filename, next);
  } else if (next !== source) throw Error('generated Unicode property ranges differ');
  console.log(JSON.stringify({rows: declaration.rows.length, maximumRowBytes: generated.maximumBytes,
    generatedBytes: Buffer.byteLength(generated.source)}));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
