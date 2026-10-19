// Maintenance only. The compiler consumes the checked-in packed dictionaries.
// Unicode-3.0: https://www.unicode.org/license.txt
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const digest = text => createHash('sha256').update(text).digest('hex');
const normalize = text => text.replace(/\s+/g, ' ').trim();
const print = value => Array.isArray(value) ? '(' + value.map(print).join(' ') + ')' : String(value);
const invalid = message => {throw new Error('invalid legacy property alias tree: ' + message);};

// This parser recognizes only the generated numeric trie grammar. It never
// evaluates source or invokes a compiler, RegExp engine, or Unicode host API.
function parse(text) {
  const stack = [];let result;
  for (const token of text.match(/\(|\)|[^\s()]+/g) ?? []) {
    if (token === '(') {const list = [];if (stack.length) stack.at(-1).push(list);stack.push(list);}
    else if (token === ')') {
      if (!stack.length) invalid('unbalanced close');
      const value = stack.pop();if (!stack.length) {if (result) invalid('multiple forms');result = value;}
    } else {
      if (!stack.length || !/^(?:[A-Za-z][A-Za-z0-9-]*|\d+|[+=<])$/.test(token)) invalid('token ' + token);
      stack.at(-1).push(/^\d+$/.test(token) ? Number(token) : token);
    }
  }
  if (stack.length || !result) invalid('unbalanced form');return result;
}
function definitions(source, rootName) {
  const result = new Map();
  for (const match of source.matchAll(/\(defun ([A-Za-z][A-Za-z0-9-]*) /g)) {
    const name = match[1];
    if (name !== rootName && !new RegExp('^' + rootName + '-part-\\d{4}$').test(name)) continue;
    let depth = 0, end = match.index;
    do {const char = source[end++];if (char === '(') depth++;else if (char === ')') depth--;}
    while (end < source.length && depth !== 0);
    if (depth || result.has(name)) invalid('duplicate/unclosed function');
    const tree = parse(source.slice(match.index, end));
    if (tree.length !== 4 || tree[0] !== 'defun' || tree[1] !== name) invalid('function schema');
    result.set(name, tree);
  }
  if (!result.has(rootName)) invalid('missing root');return result;
}
function restrict(state, field, operation, number, yes) {
  const next = {...state, units: new Map(state.units), excludedLengths: new Set(state.excludedLengths)};
  if (field === 'length') {
    if (operation !== '=') invalid('length comparator');
    if (yes) {
      if ((next.length !== null && next.length !== number) || next.excludedLengths.has(number)) return null;
      next.length = number;
    } else {if (next.length === number) return null;next.excludedLengths.add(number);}
  } else {
    if (field !== 'unit' || !Number.isInteger(state.unit)) invalid('unit comparator');
    const old = state.units.get(state.unit) ?? {low: 0, high: 65535, except: []};
    const domain = {...old, except: old.except.slice()};
    if (operation === '<') {if (yes) domain.high = Math.min(domain.high, number - 1);else domain.low = Math.max(domain.low, number);}
    else if (operation === '=') {
      if (yes) {domain.low = Math.max(domain.low, number);domain.high = Math.min(domain.high, number);}
      else domain.except.push(number);
    } else invalid('unit comparator');
    if (domain.low > domain.high || (domain.low === domain.high && domain.except.includes(domain.low))) return null;
    next.units.set(state.unit, domain);
  }
  return next;
}
export function extractLegacyPropertyAliases(source, rootName = 'regexp-property-id-base', runtime = false) {
  const funcs = definitions(source, rootName), aliases = new Map();
  const params = runtime ? ['heap', 'source', 'start', 'length'] : ['source', 'start', 'length'];
  const unitReader = runtime ? 'heap-regexp-unit' : 'string-code-unit-at';
  const visit = (value, state, active) => {
    if (!state) return;
    if (Number.isInteger(value)) {
      if (!value) return;
      if (value < 1 || value > 65535) invalid('property ID');
      if (!state.units.size) invalid('empty alias path');
      const count = Math.max(...state.units.keys()) + 1, characters = [];
      for (let index = 0; index < count; index++) {
        const domain = state.units.get(index);
        if (!domain || domain.low !== domain.high || domain.except.includes(domain.low) || domain.low > 127)
          invalid('nonliteral alias path');
        characters.push(domain.low);
      }
      if (!count || (state.length !== null && state.length !== count) || state.excludedLengths.has(count))
        invalid('terminal length');
      const entry = [String.fromCharCode(...characters), value, state.length === null ? 0 : 1];
      const previous = aliases.get(entry[0]);
      if (previous && JSON.stringify(previous) !== JSON.stringify(entry)) invalid('conflicting alias');
      aliases.set(entry[0], entry);return;
    }
    if (!Array.isArray(value)) invalid('non-numeric leaf');
    if (value[0] === 'if' && value.length === 4) {
      const condition = value[1];
      if (!Array.isArray(condition) || condition.length !== 3 || !Number.isInteger(condition[2])) invalid('condition');
      visit(value[2], restrict(state, condition[1], condition[0], condition[2], true), active);
      visit(value[3], restrict(state, condition[1], condition[0], condition[2], false), active);return;
    }
    if (value[0] === 'let' && value.length === 3 && value[1].length === 1) {
      const binding = value[1][0], read = binding?.[1];
      const expected = runtime ? ['heap', 'source'] : ['source'];
      if (!Array.isArray(binding) || binding.length !== 2 || binding[0] !== 'unit' || !Array.isArray(read) ||
          read[0] !== unitReader || JSON.stringify(read.slice(1, -1)) !== JSON.stringify(expected)) invalid('unit binding');
      const offset = read.at(-1);
      if (!Array.isArray(offset) || offset.length !== 3 || offset[0] !== '+' || offset[1] !== 'start' ||
          !Number.isInteger(offset[2]) || offset[2] < 0 || offset[2] > 65535) invalid('unit offset');
      visit(value[2], {...state, unit: offset[2]}, active);return;
    }
    const name = value[0], fn = funcs.get(name);
    if (!fn || name === rootName || active.has(name) || JSON.stringify(value.slice(1)) !== JSON.stringify(fn[2]) ||
        JSON.stringify(fn[2]) !== JSON.stringify([...params, 'unit'])) invalid('private call');
    visit(fn[3], state, new Set([...active, name]));
  };
  if (JSON.stringify(funcs.get(rootName)[2]) !== JSON.stringify(params)) invalid('root parameters');
  visit(funcs.get(rootName)[3], {units: new Map(), excludedLengths: new Set(), length: null, unit: null}, new Set([rootName]));
  const inline = value => {
    if (!Array.isArray(value)) return value;
    if (typeof value[0] === 'string' && value[0].startsWith(rootName + '-part-')) return inline(funcs.get(value[0])[3]);
    return value.map(inline);
  };
  return {records: [...aliases.values()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
    sourceSHA256: digest(normalize(print(inline(funcs.get(rootName)))))};
}

// The exceptional JS input path may expose charCodeAt reads. Keep the old
// decisions as data instead of retaining its enormous executable if tree.
export function compileLegacyPropertyAliasDecisions(source) {
  const rootName = 'regexp-property-id-base', funcs = definitions(source, rootName);
  const provenance = extractLegacyPropertyAliases(source), nodes = [], seen = new Map();
  const compile = value => {
    if (seen.has(value)) return seen.get(value);
    if (Array.isArray(value) && typeof value[0] === 'string' && value[0].startsWith(rootName + '-part-'))
      return compile(funcs.get(value[0])[3]);
    const index = nodes.length;nodes.push(null);seen.set(value, index);
    if (Number.isInteger(value)) nodes[index] = [0, value, 0, 0];
    else if (value[0] === 'let') nodes[index] = [4, value[1][0][1][2][2], compile(value[2]), 0];
    else {
      const [operation, field, number] = value[1];
      const kind = field === 'length' ? 3 : operation === '<' ? 1 : 2;
      nodes[index] = [kind, number, compile(value[2]), compile(value[3])];
    }
    return index;
  };
  return {root: compile(funcs.get(rootName)[3]), nodes, sourceSHA256: provenance.sourceSHA256};
}

function validateDeclaration(data) {
  if (data?.format !== 'eliscript-unicode-property-aliases' || data.version !== 1 || data.license !== 'Unicode-3.0' ||
      JSON.stringify(data.unicodeVersions) !== JSON.stringify(['15.1.0', '16.0.0', '17.0.0']) ||
      !/^[a-f0-9]{64}$/.test(data.sourceSHA256 ?? '') || !/^[a-f0-9]{64}$/.test(data.runtimeSourceSHA256 ?? '') ||
      !Array.isArray(data.records) || !data.records.length) throw new TypeError('invalid Unicode property alias declaration');
}

export function packPropertyAliases(data) {
  validateDeclaration(data);
  const units = new Array(data.records.length * 4).fill(0);let previous = '';
  for (let index = 0; index < data.records.length; index++) {
    const row = data.records[index];
    if (!Array.isArray(row) || row.length !== 3 || typeof row[0] !== 'string' || !/^[A-Za-z0-9_=]+$/.test(row[0]) ||
        row[0] <= previous || row[0].length > 65535 || !Number.isInteger(row[1]) || row[1] < 1 || row[1] > 65535 ||
        (row[2] !== 0 && row[2] !== 1)) throw new TypeError('invalid Unicode property alias record');
    previous = row[0];const offset = units.length;
    units[index * 4] = offset & 65535;units[index * 4 + 1] = offset >>> 16;
    units[index * 4 + 2] = row[1];units[index * 4 + 3] = row[2];
    units.push(row[0].length);for (const char of row[0]) units.push(char.charCodeAt(0));
  }
  if (units.length > 0x7fffffff) throw new TypeError('Unicode property alias dictionary is too large');
  return {count: data.records.length, byteLength: units.length * 2, units,
    literal: '"' + units.map(unit => '\\u' + unit.toString(16).padStart(4, '0')).join('') + '"'};
}

const staticBegin = '  ;; BEGIN GENERATED UNICODE PROPERTY ALIASES';
const staticEnd = '  ;; END GENERATED UNICODE PROPERTY ALIASES';
export function generatePropertyAliasSources(data) {
  const packed = packPropertyAliases(data);
  const legacy = data.legacyDecisions;
  if (!legacy || legacy.sourceSHA256 !== data.sourceSHA256 || !Array.isArray(legacy.nodes) || !legacy.nodes.length ||
      !Number.isInteger(legacy.root) || legacy.root < 0 || legacy.root >= legacy.nodes.length)
    throw new TypeError('invalid Unicode property legacy decisions');
  for (const node of legacy.nodes) {
    if (!Array.isArray(node) || node.length !== 4 || node.some(value => !Number.isInteger(value) || value < 0 || value > 0xffffffff) ||
        node[0] > 4 || (node[0] !== 0 && (node[2] >= legacy.nodes.length || (node[0] !== 4 && node[3] >= legacy.nodes.length))))
      throw new TypeError('invalid Unicode property legacy decision node');
  }
  const active = new Set(), visited = new Set(), pending = [[legacy.root, false]];
  while (pending.length) {
    const [index, done] = pending.pop();
    if (done) {active.delete(index);visited.add(index);continue;}
    if (active.has(index)) throw new TypeError('cyclic Unicode property legacy decisions');
    if (visited.has(index)) continue;
    active.add(index);pending.push([index, true]);const node = legacy.nodes[index];
    if (node[0] !== 0) {if (node[0] !== 4) pending.push([node[3], false]);pending.push([node[2], false]);}
  }
  const legacyLiteral = '"' + legacy.nodes.flatMap(node => node.flatMap(value => [value & 65535, value >>> 16]))
    .map(unit => '\\u' + unit.toString(16).padStart(4, '0')).join('') + '"';
  const notice = `\n  ;; Unicode 15.1 / 16.0 / 17.0, Unicode-3.0: https://www.unicode.org/license.txt\n  ;; Reproduce with tools/runtime/unicode-property-aliases.mjs --write.\n  ;; Original normalized trie SHA-256 ${data.sourceSHA256}\n  ;; Original runtime trie SHA-256 ${data.runtimeSourceSHA256}\n  ;; Directory: u32 unit offset, u16 original ID, u16 exact-terminal flag.\n`;
  const staticSource = staticBegin + notice + `  (defconst regexp-property-name-data ${packed.literal})
  (defun regexp-property-legacy-table () ${legacyLiteral})
  (defun regexp-property-name-table () regexp-property-name-data)
  (defun regexp-property-legacy-word (table index)
    (+ (string-code-unit-at table (* index 2)) (* (string-code-unit-at table (1+ (* index 2))) 65536)))
  (defun regexp-property-legacy-lookup (source start length)
    (let ((table (regexp-property-legacy-table)) (pc ${legacy.root}) (unit 0) (done nil) (result 0))
      (while (not done)
        (let* ((at (* pc 4)) (kind (regexp-property-legacy-word table at))
               (number (regexp-property-legacy-word table (1+ at)))
               (yes (regexp-property-legacy-word table (+ at 2)))
               (no (regexp-property-legacy-word table (+ at 3))))
          (cond
            ((= kind 0) (setq result number) (setq done t))
            ((= kind 1) (setq pc (if (< unit number) yes no)))
            ((= kind 2) (setq pc (if (= unit number) yes no)))
            ((= kind 3) (setq pc (if (= length number) yes no)))
            (t (setq unit (string-code-unit-at source (+ start number))) (setq pc yes))))) result))
  (defun regexp-property-id-base (source start length)
    (if (= length 0) 0
      (if (or (/= (js* "typeof source") "string") (not (Number/isInteger start))
              (not (Number/isInteger length)) (< start 0) (< length 0) (> (+ start length) (js-length source)))
        (regexp-property-legacy-lookup source start length)
        (let ((table (regexp-property-name-table)) (low 0) (high ${packed.count}) (found 0))
        (while (and (= found 0) (< low high))
          (let* ((middle (unsigned-bit-shift-right (+ low high) 1)) (entry (* middle 4))
                 (offset (+ (string-code-unit-at table entry) (* (string-code-unit-at table (1+ entry)) 65536)))
                 (size (string-code-unit-at table offset)) (at 0) (order 1))
            (while (and (= order 1) (< at size) (< at length))
              (let ((actual (string-code-unit-at source (+ start at)))
                    (expected (string-code-unit-at table (+ offset 1 at))))
                (if (< actual expected) (setq order 0) (when (> actual expected) (setq order 2))))
              (setq at (1+ at)))
            (when (= order 1)
              (if (< at size) (setq order 0)
                (when (and (/= length size) (= (string-code-unit-at table (+ entry 3)) 1)) (setq order 2))))
            (if (= order 1) (setq found (string-code-unit-at table (+ entry 2)))
              (if (= order 0) (setq high middle) (setq low (1+ middle)))))) found))))
` + staticEnd;
  const runtimeSource = staticBegin + notice + `  (defun heap-regexp-property-name-copy (destination)
    (copy-static-u16 destination ${packed.literal}))
  (defun heap-regexp-property-name-table ()
    (initialize)
    (let ((table (load-u32 52)))
      (when (= table 0)
        (setq table (allocate ${packed.byteLength}))
        (when (/= table 0)
          (heap-regexp-property-name-copy table)
          (store-u32 52 table))) table))
  (defun heap-regexp-property-id-base (heap source start length)
    (if (= length 0) 0
      (let ((table (heap-regexp-property-name-table)) (low 0) (high ${packed.count}) (found 0))
        (when (/= table 0)
          (let ((data table))
            (while (and (= found 0) (< low high))
              (let* ((middle (word-div (+ low high) 2)) (entry (+ data (* middle 8)))
                     (offset (load-u32 entry)) (record (+ data (* offset 2)))
                     (size (load-u16 record)) (at 0) (order 1))
                (while (and (= order 1) (< at size) (< at length))
                  (let ((actual (heap-regexp-unit heap source (+ start at)))
                        (expected (load-u16 (+ (+ record 2) (* at 2)))))
                    (if (< actual expected) (setq order 0) (when (> actual expected) (setq order 2))))
                  (setq at (1+ at)))
                (when (= order 1)
                  (if (< at size) (setq order 0)
                    (when (and (/= length size) (= (load-u16 (+ entry 6)) 1)) (setq order 2))))
                (if (= order 1) (setq found (load-u16 (+ entry 4)))
                  (if (= order 0) (setq high middle) (setq low (1+ middle)))))))) found)))
` + staticEnd;
  return {staticSource, runtimeSource};
}
function replace(source, generated, runtime) {
  const begin = source.indexOf(staticBegin), end = source.indexOf(staticEnd, begin);
  if (begin >= 0 && end >= begin) return source.slice(0, begin) + generated + source.slice(end + staticEnd.length);
  const expression = runtime ? /^  \(defun heap-regexp-property-id-base .*$/gm
    : /^  \(defun regexp-property-id-base(?:-part-\d{4})? .*$/gm;
  let count = 0;
  const result = source.replace(expression, () => count++ === 0 ? generated : '')
    .replace('  ;; Exact private trie partitions retain all branches and lexical unit values.\n', '');
  if (runtime ? count !== 1 : count !== 69) throw new Error('unexpected original property alias definition inventory');
  return result;
}

function main(args) {
  const rootAt = args.indexOf('--root'), root = rootAt < 0 ? resolve(dirname(fileURLToPath(import.meta.url)), '../..') : resolve(args[rootAt + 1]);
  const modes = args.filter(arg => ['--import-legacy', '--import-compatibility', '--write', '--check'].includes(arg));
  if (modes.length !== 1 || args.some((arg, at) => !modes.includes(arg) && arg !== '--root' && (rootAt < 0 || at !== rootAt + 1)))
    throw new TypeError('usage: unicode-property-aliases.mjs [--root DIR] --import-legacy|--import-compatibility|--write|--check');
  const paths = [resolve(root, 'bootstrap/backends/regexp.eli'), resolve(root, 'bootstrap/runtime/memory.eli')];
  const declaration = resolve(root, 'tools/runtime/unicode-property-aliases.json');
  const sources = paths.map(path => readFileSync(path, 'utf8'));let data;
  if (modes[0] === '--import-legacy') {
    const original = extractLegacyPropertyAliases(sources[0]);
    const runtime = extractLegacyPropertyAliases(sources[1], 'heap-regexp-property-id-base', true);
    if (JSON.stringify(original.records) !== JSON.stringify(runtime.records)) throw new Error('static and dynamic Unicode alias dictionaries disagree');
    data = {format: 'eliscript-unicode-property-aliases', version: 1, license: 'Unicode-3.0',
      unicodeVersions: ['15.1.0', '16.0.0', '17.0.0'], sourceSHA256: original.sourceSHA256,
      runtimeSourceSHA256: runtime.sourceSHA256, records: original.records,
      legacyDecisions: compileLegacyPropertyAliasDecisions(sources[0])};
    writeFileSync(declaration, JSON.stringify(data, null, 2) + '\n');
  } else {
    data = JSON.parse(readFileSync(declaration, 'utf8'));
    if (modes[0] === '--import-compatibility') {
      const original = readFileSync(resolve(root, 'tests/fixtures/regexp-property-original-trie.eli'), 'utf8');
      data.legacyDecisions = compileLegacyPropertyAliasDecisions(original);
      if (data.legacyDecisions.sourceSHA256 !== data.sourceSHA256) throw new Error('legacy compatibility source identity mismatch');
      writeFileSync(declaration, JSON.stringify(data, null, 2) + '\n');
    }
  }
  const generated = generatePropertyAliasSources(data), outputs = [generated.staticSource, generated.runtimeSource];
  for (let index = 0; index < paths.length; index++) {
    const output = replace(sources[index], outputs[index], index === 1);
    if (modes[0] === '--check') {if (sources[index] !== output) throw new Error('Unicode property aliases need regeneration: ' + paths[index]);}
    else writeFileSync(paths[index], output);
  }
  const packed = packPropertyAliases(data);
  process.stdout.write(JSON.stringify({aliases: packed.count, byteLength: packed.byteLength, sourceSHA256: data.sourceSHA256}) + '\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
