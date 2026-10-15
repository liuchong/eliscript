// Maintenance only: normal compilation consumes the checked-in .eli functions.
// Unicode data is licensed under Unicode-3.0; see the generated region notice.
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const inputs = {
  'UnicodeData.txt': '2e1efc1dcb59c575eedf5ccae60f95229f706ee6d031835247d843c11d96470c',
  'SpecialCasing.txt': 'efc25faf19de21b92c1194c111c932e03d2a5eaf18194e33f1156e96de4c9588',
  'DerivedCoreProperties.txt': '24c7fed1195c482faaefd5c1e7eb821c5ee1fb6de07ecdbaa64b56a99da22c08',
};
const texts = {};
await Promise.all(Object.entries(inputs).map(async ([name, expected]) => {
  const response = await fetch('https://www.unicode.org/Public/17.0.0/ucd/' + name);
  if (!response.ok) throw Error(name + ': ' + response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw Error(name + ': unexpected Unicode data identity');
  texts[name] = new TextDecoder().decode(bytes);
}));
const mappings = {upper: new Map(), lower: new Map()}, properties = {Cased: [], Case_Ignorable: []};
for (const line of texts['UnicodeData.txt'].split('\n')) {
  if (!line) continue;const fields = line.split(';'), point = parseInt(fields[0], 16);
  for (const [name, index] of [['upper', 12], ['lower', 13]]) if (fields[index]) mappings[name].set(point, [parseInt(fields[index], 16)]);
}
for (const line of texts['SpecialCasing.txt'].split('\n')) {
  const fields = line.split('#')[0].split(';').map(s => s.trim());
  if (!fields[0] || fields[4]) continue;
  for (const [name, index] of [['upper', 3], ['lower', 1]]) mappings[name].set(parseInt(fields[0], 16), fields[index].split(/\s+/).filter(Boolean).map(s => parseInt(s, 16)));
}
for (const line of texts['DerivedCoreProperties.txt'].split('\n')) {
  const [range, property] = line.split('#')[0].split(';').map(s => s.trim());
  if (!Object.hasOwn(properties, property)) continue;
  const [a, b = a] = range.split('..').map(s => parseInt(s, 16));properties[property].push({a, b, step: 1, value: 1});
}
function compress(entries, linear) {
  const rows = entries.map(([point, value]) => ({point, value: linear ? value - point : value}));
  const rules = [];
  for (let i = 0; i < rows.length;) {
    const first = rows[i], step = rows[i + 1]?.point - first.point;let j = i + 1;
    if (step === 1 || step === 2) while (j < rows.length && rows[j].point - rows[j - 1].point === step && rows[j].value === first.value) j++;
    rules.push({a: first.point, b: rows[j - 1].point, step: j > i + 1 ? step : 1, value: first.value});i = j;
  }
  return rules;
}
function tree(rules, fallback, linear) {
  if (!rules.length) return fallback;
  const middle = rules.length >>> 1, rule = rules[middle];
  const value = linear ? rule.value < 0 ? `(- code ${-rule.value})` : `(+ code ${rule.value})` : String(rule.value);
  const hit = rule.step === 2 ? `(if (= (word-and (- code ${rule.a}) 1) 0) ${value} ${fallback})` : value;
  return `(if (< code ${rule.a}) ${tree(rules.slice(0, middle), fallback, linear)}\n    (if (<= code ${rule.b}) ${hit} ${tree(rules.slice(middle + 1), fallback, linear)}))`;
}
const begin = '  ;; BEGIN GENERATED UNICODE CASE DATA', end = '  ;; END GENERATED UNICODE CASE DATA';
let generated = begin + '\n  ;; Unicode 17.0.0, Unicode-3.0 data license: https://www.unicode.org/license.txt\n  ;; Reproduce with tools/runtime/unicode-case-data.mjs; no generator runs during compilation.\n';
for (const [name, digest] of Object.entries(inputs)) generated += `  ;; ${name} SHA-256 ${digest}\n`;
for (const [name, mapping] of Object.entries(mappings)) {
  for (let part = 0; part < 3; part++) {
    const entries = [...mapping].filter(([point, values]) => values[part] !== undefined && (part !== 0 || values[0] !== point)).sort((a, b) => a[0] - b[0]).map(([point, values]) => [point, values[part]]);
    generated += `  (defun heap-unicode-${name}-${part} (code)\n    ${tree(compress(entries, part === 0), part === 0 ? 'code' : '0', part === 0)})\n`;
  }
}
for (const [name, rules] of Object.entries(properties)) generated += `  (defun heap-unicode-${name === 'Cased' ? 'cased' : 'case-ignorable'} (code)\n    ${tree(rules.sort((a, b) => a.a - b.a), '0', false)})\n`;
generated += end;
const filename = fileURLToPath(new URL('../../bootstrap/runtime/memory.eli', import.meta.url)), source = await readFile(filename, 'utf8');
const first = source.indexOf(begin), last = source.indexOf(end);
const next = first < 0 ? source.replace('  (defun heap-code-point ', generated + '\n  (defun heap-code-point ') : source.slice(0, first) + generated + source.slice(last + end.length);
if (first >= 0 && last < first) throw Error('invalid Unicode region');
if (process.argv.includes('--check')) {if (next !== source) throw Error('Unicode case data differs');}
else if (process.argv.includes('--write')) await writeFile(filename, next);
else throw Error('require --write or --check');
console.log(JSON.stringify({unicode: '17.0.0', generatedBytes: Buffer.byteLength(generated), mappings: Object.fromEntries(Object.entries(mappings).map(([name, values]) => [name, values.size]))}));
