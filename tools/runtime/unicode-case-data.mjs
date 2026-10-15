// Maintenance only: normal compilation consumes the checked-in .eli functions.
// Unicode data is licensed under Unicode-3.0; see the generated region notice.
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const names = ['UnicodeData.txt', 'SpecialCasing.txt', 'DerivedCoreProperties.txt'];
const inputs = {
  '15.1.0': ['2fc713e6a31a87c4850a37fe2caffa4218180fadb5de86b43a143ddb4581fb86', '55a477efd933a52cd27e6a9bf70265bb2d8814af31aab07767abc8eb421f27ef', 'f55d0db69123431a7317868725b1fcbf1eab6b265d756d1bd7f0f6d9f9ee108b'],
  '16.0.0': ['ff58e5823bd095166564a006e47d111130813dcf8bf234ef79fa51a870edb48f', '8d5de354eef79f2395a54c9c7dcebbaf3d30fc962d0f85611ea97aa973a0c451', '39d35161f2954497f69e08bdb9e701493f476a3d30222de20028feda36c1dabd'],
  '17.0.0': ['2e1efc1dcb59c575eedf5ccae60f95229f706ee6d031835247d843c11d96470c', 'efc25faf19de21b92c1194c111c932e03d2a5eaf18194e33f1156e96de4c9588', '24c7fed1195c482faaefd5c1e7eb821c5ee1fb6de07ecdbaa64b56a99da22c08'],
};
const versions = await Promise.all(Object.entries(inputs).map(async ([version, digests]) => {
  const texts = await Promise.all(names.map(async (name, i) => {
    const response = await fetch('https://www.unicode.org/Public/' + version + '/ucd/' + name);
    if (!response.ok) throw Error(name + ': ' + response.status);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== digests[i]) throw Error(version + '/' + name + ': unexpected Unicode data identity');
    return new TextDecoder().decode(bytes);
  }));
  const mappings = {upper: new Map(), lower: new Map()}, properties = {Cased: new Uint8Array(0x110000), Case_Ignorable: new Uint8Array(0x110000)};
  for (const line of texts[0].split('\n')) {
    if (!line) continue;const fields = line.split(';'), point = parseInt(fields[0], 16);
    for (const [name, index] of [['upper', 12], ['lower', 13]]) if (fields[index]) mappings[name].set(point, [parseInt(fields[index], 16)]);
  }
  for (const line of texts[1].split('\n')) {
    const fields = line.split('#')[0].split(';').map(s => s.trim());
    if (!fields[0] || fields[4]) continue;
    for (const [name, index] of [['upper', 3], ['lower', 1]]) mappings[name].set(parseInt(fields[0], 16), fields[index].split(/\s+/).filter(Boolean).map(s => parseInt(s, 16)));
  }
  for (const line of texts[2].split('\n')) {
    const [range, property] = line.split('#')[0].split(';').map(s => s.trim());
    if (!Object.hasOwn(properties, property)) continue;
    const [a, b = a] = range.split('..').map(s => parseInt(s, 16));properties[property].fill(1, a, b + 1);
  }
  return {version, id: version === '15.1.0' ? 151 : parseInt(version) * 10, mappings, properties};
}));
const base = versions.at(-1);
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
let generated = begin + '\n  ;; Unicode 15.1.0 / 16.0.0 / 17.0.0, Unicode-3.0: https://www.unicode.org/license.txt\n  ;; Reproduce with tools/runtime/unicode-case-data.mjs; normal builds never fetch data.\n';
for (const [version, digests] of Object.entries(inputs)) for (let i = 0; i < names.length; i++) generated += `  ;; ${version}/${names[i]} SHA-256 ${digests[i]}\n`;
const differences = new Set();
function versionedFunction(name, baseEntries, perVersion, fallback, linear) {
  generated += `  (defun ${name}-17 (code)\n    ${tree(compress(baseEntries, linear), fallback, linear)})\n`;
  const defaultCall = `(${name}-17 code)`;let body = defaultCall;
  for (const version of versions.slice(0, -1).reverse()) {
    const delta = perVersion(version);for (const [point] of delta) differences.add(point);
    generated += `  (defun ${name}-${version.id} (code)\n    ${tree(compress(delta, linear), defaultCall, linear)})\n`;
    body = `(if (= (load-u32 16) ${version.id}) (${name}-${version.id} code) ${body})`;
  }
  generated += `  (defun ${name} (code)\n    ${body})\n`;
}
for (const [name, mapping] of Object.entries(base.mappings)) for (let part = 0; part < 3; part++) {
  const at = (m, p) => m.get(p)?.[part] ?? (part === 0 ? p : 0);
  const entries = [...mapping.keys()].sort((a, b) => a - b).filter(p => at(mapping, p) !== (part === 0 ? p : 0)).map(p => [p, at(mapping, p)]);
  versionedFunction('heap-unicode-' + name + '-' + part, entries, version => [...new Set([...mapping.keys(), ...version.mappings[name].keys()])].sort((a, b) => a - b).filter(p => at(mapping, p) !== at(version.mappings[name], p)).map(p => [p, at(version.mappings[name], p)]), part === 0 ? 'code' : '0', part === 0);
}
for (const [name, property] of Object.entries(base.properties)) {
  const entries = [];for (let p = 0; p < property.length; p++) if (property[p]) entries.push([p, 1]);
  versionedFunction('heap-unicode-' + (name === 'Cased' ? 'cased' : 'case-ignorable'), entries, version => {const delta = [];for (let p = 0; p < property.length; p++) if (property[p] !== version.properties[name][p]) delta.push([p, version.properties[name][p]]);return delta;}, '0', false);
}
generated += end;
const points = [...differences].sort((a, b) => a - b);
const signature = version => [points.map(p => String.fromCodePoint(...(version.mappings.upper.get(p) ?? [p]))).join('\0'), points.map(p => String.fromCodePoint(...(version.mappings.lower.get(p) ?? [p]))).join('\0'), points.map(p => Number(version.properties.Cased[p] && !version.properties.Case_Ignorable[p])).join(''), points.map(p => Number(!version.properties.Cased[p] && !version.properties.Case_Ignorable[p])).join('')];
let profiles = '// Generated by unicode-case-data.mjs from pinned Unicode data; Unicode-3.0.\n// Compare only version-dependent behavior once per JS realm, never per WASM call.\n';
profiles += 'const points = ' + JSON.stringify(points) + ';\nconst profiles = ' + JSON.stringify(versions.map(v => [v.id, signature(v)])) + ';\nlet cached;\n';
profiles += `export function hostUnicodeCaseVersion() {
  if (cached !== undefined) return cached;
  const chars = points.map(p => String.fromCodePoint(p));
  const actual = [chars.map(s => s.toUpperCase()).join('\\0'), chars.map(s => s.toLowerCase()).join('\\0'), chars.map(s => Number((s + 'Σ').toLowerCase().endsWith('ς'))).join(''), chars.map(s => Number(('AΣ' + s + 'A').toLowerCase().startsWith('aς'))).join('')];
  const profile = profiles.find(([, expected]) => expected.every((s, i) => s === actual[i]));
  if (!profile) throw new Error('unsupported host Unicode case data; select an explicit supported unicodeVersion');
  return cached = profile[0];
}
`;
// Independent fixture: scalar outputs are computed from the source mappings,
// not by interpreting emitted decision trees or executing the WASM runtime.
const reference = {format: 'eliscript-unicode-case-reference', versions: versions.map(v => {
  const hashes = {upper: createHash('sha256'), lower: createHash('sha256')};
  for (let start = 0; start < 0x110000; start += 512) for (const name of ['upper', 'lower']) {
    const text = [];for (let p = start; p < Math.min(start + 512, 0x110000); p++) if (p < 0xd800 || p > 0xdfff) text.push(String.fromCodePoint(...(v.mappings[name].get(p) ?? [p])));
    hashes[name].update(text.join(''), 'utf16le');
  }
  return {version: v.id === 151 ? 15.1 : v.id / 10, upper: hashes.upper.digest('hex'), lower: hashes.lower.digest('hex'), sigma: points.flatMap(p => {
    const letter = String.fromCodePoint(p), mapped = String.fromCodePoint(...(v.mappings.lower.get(p) ?? [p]));
    return [['AΣ' + letter + 'A', 'a' + (v.properties.Cased[p] || v.properties.Case_Ignorable[p] ? 'σ' : 'ς') + mapped + 'a'], [letter + 'Σ', mapped + (v.properties.Cased[p] && !v.properties.Case_Ignorable[p] ? 'ς' : 'σ')]];
  })};
})};
const referencePath = fileURLToPath(new URL('../../tests/fixtures/unicode-case-profiles.json', import.meta.url)), referenceText = JSON.stringify(reference, null, 2) + '\n';
const filename = fileURLToPath(new URL('../../bootstrap/runtime/memory.eli', import.meta.url)), source = await readFile(filename, 'utf8');
const first = source.indexOf(begin), last = source.indexOf(end);
if (first < 0 || last < first) throw Error('invalid Unicode region');
const next = source.slice(0, first) + generated + source.slice(last + end.length), profilePath = fileURLToPath(new URL('./unicode-case-profiles.mjs', import.meta.url));
if (process.argv.includes('--check')) {if (next !== source || profiles !== await readFile(profilePath, 'utf8') || referenceText !== await readFile(referencePath, 'utf8')) throw Error('Unicode case data differs');}
else if (process.argv.includes('--write')) {await writeFile(filename, next);await writeFile(profilePath, profiles);await writeFile(referencePath, referenceText);}
else throw Error('require --write or --check');
console.log(JSON.stringify({versions: versions.map(v => v.version), generatedBytes: Buffer.byteLength(generated), profilePoints: points.length}));
