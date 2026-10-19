// Maintenance only. Runtime compilation consumes checked-in packed data and
// never fetches Unicode files or delegates matching to a host RegExp engine.
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const write = process.argv.includes('--write');
if (!write && !process.argv.includes('--check')) throw Error('require --write or --check');
const initialize = process.argv.includes('--initialize-pins');
if (initialize && !write) throw Error('initializing input pins requires --write');
const manifestPath = fileURLToPath(new URL('./unicode-emoji-inputs.json', import.meta.url));
let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (initialize) throw Error('Unicode input pins already exist; refusing to replace them');
} catch (error) {
  if (!initialize || error.code !== 'ENOENT') throw error;
  manifest = {license: 'https://www.unicode.org/license.txt', inputs: {}};
}
const properties = ['Basic_Emoji', 'Emoji_Keycap_Sequence', 'RGI_Emoji_Modifier_Sequence',
  'RGI_Emoji_Flag_Sequence', 'RGI_Emoji_Tag_Sequence', 'RGI_Emoji_ZWJ_Sequence', 'RGI_Emoji'];
const versions = [['15.1', 151], ['16.0', 160], ['17.0', 170]];
const begin = '  ;; BEGIN GENERATED UNICODE EMOJI DATA';
const end = '  ;; END GENERATED UNICODE EMOJI DATA';
let generated = begin + '\n  ;; Unicode 15.1 / 16.0 / 17.0; Unicode-3.0: https://www.unicode.org/license.txt\n' +
  '  ;; Reproduce with tools/runtime/unicode-emoji-data.mjs --write.\n' +
  '  ;; Directory: seven [count, indexByteOffset] pairs, followed by sorted\n' +
  '  ;; offset indexes and shared [codePointCount, codePoints...] records.\n';
const compare = (a, b) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
};
const sizes = [];
for (const [version, id] of versions) {
  const sets = new Map(properties.map(name => [name, new Map()]));
  const add = (name, points) => {
    if (!points.length || points.length > 32 || points.some(p => !Number.isInteger(p) || p < 0 || p > 0x10ffff))
      throw Error('invalid Unicode emoji sequence');
    sets.get(name).set(points.join(','), points);
  };
  // Sequential downloads keep maintenance memory and network use bounded.
  for (const filename of ['emoji-sequences.txt', 'emoji-zwj-sequences.txt']) {
    const url = version === '17.0' ? `https://www.unicode.org/Public/17.0.0/emoji/${filename}` :
      `https://www.unicode.org/Public/emoji/${version}/${filename}`;
    const response = await fetch(url, {signal: AbortSignal.timeout(30000)});
    if (!response.ok) throw Error(`${url}: ${response.status}`);
    const chunks = [];let length = 0;
    for await (const chunk of response.body) {
      if (chunk.byteLength > 2097152 - length) throw Error('Unicode input exceeds maintenance bound');
      chunks.push(chunk);length += chunk.byteLength;
    }
    const bytes = new Uint8Array(length);let at = 0;
    for (const chunk of chunks) {bytes.set(chunk, at);at += chunk.byteLength;}
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const key = `${version}/${filename}`;
    if (initialize) manifest.inputs[key] = {url, sha256};
    else if (manifest.inputs[key]?.url !== url || manifest.inputs[key]?.sha256 !== sha256)
      throw Error(`${key}: unexpected Unicode data identity`);
    generated += `  ;; ${key} SHA-256 ${sha256}\n`;
    for (const line of new TextDecoder().decode(bytes).split('\n')) {
      const [field, property] = line.split('#', 1)[0].split(';').map(s => s.trim());
      if (!field) continue;
      if (!sets.has(property) || property === 'RGI_Emoji') throw Error(`unexpected emoji property: ${property}`);
      if (field.includes('..')) {
        const [lo, hi] = field.split('..').map(s => parseInt(s, 16));
        if (lo > hi || hi - lo > 4096) throw Error('invalid emoji range');
        for (let p = lo; p <= hi; p++) add(property, [p]);
      } else add(property, field.split(/\s+/).map(s => parseInt(s, 16)));
    }
  }
  for (const property of properties.slice(0, -1)) {
    if (!sets.get(property).size) throw Error(`missing ${property} in Unicode ${version}`);
    for (const points of sets.get(property).values()) add('RGI_Emoji', points);
  }
  const all = [...sets.get('RGI_Emoji').values()].sort(compare);
  const words = new Array(properties.length * 2).fill(0);
  const lists = properties.map(property => [...sets.get(property).values()].sort(compare));
  for (let i = 0; i < lists.length; i++) {
    words[i * 2] = lists[i].length; words[i * 2 + 1] = words.length * 4;
    for (let j = 0; j < lists[i].length; j++) words.push(0);
  }
  const offsets = new Map();
  for (const points of all) {
    offsets.set(points.join(','), words.length * 4);
    words.push(points.length, ...points);
  }
  for (let i = 0; i < lists.length; i++) {
    const at = words[i * 2 + 1] / 4;
    for (let j = 0; j < lists[i].length; j++) words[at + j] = offsets.get(lists[i][j].join(','));
  }
  // ASCII-only JSON escapes preserve every UTF16 unit, including zero words
  // and surrogate values. They are one data-copy node, never per-word code.
  const literal = '"' + words.map(word =>
    '\\u' + (word & 65535).toString(16).padStart(4, '0') +
    '\\u' + (word >>> 16).toString(16).padStart(4, '0')).join('') + '"';
  generated += `  (defun heap-regexp-string-property-copy-${id} (destination)\n    (copy-static-u16 destination ${literal}))\n`;
  sizes.push([id, words.length * 4]);
}
generated += '  (defun heap-regexp-string-property-bytes ()\n';
generated += `    (if (= (load-u32 16) 151) ${sizes[0][1]} (if (= (load-u32 16) 160) ${sizes[1][1]} ${sizes[2][1]})))\n`;
generated += '  (defun heap-regexp-string-property-id (heap source start length)\n    (cond\n';
for (let i = 0; i < properties.length; i++) {
  const name = properties[i];
  generated += `      ((and (= length ${name.length})\n        ` +
    [...name].map((character, j) => `(= (heap-regexp-unit heap source (+ start ${j})) ${character.charCodeAt(0)})`).join(' ') +
    `) ${i + 1})\n`;
}
generated += '      (t 0)))\n';
generated += end;
const filename = fileURLToPath(new URL('../../bootstrap/runtime/memory.eli', import.meta.url));
const source = await readFile(filename, 'utf8');
const first = source.indexOf(begin), last = source.indexOf(end);
if (first < 0 || last < first) throw Error('invalid Unicode emoji region');
const next = source.slice(0, first) + generated + source.slice(last + end.length);
if (write) {
  if (initialize) await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx'});
  await writeFile(filename, next);
} else if (next !== source) throw Error('Unicode emoji data differs');
console.log(JSON.stringify({versions: sizes.map(([version, bytes]) => ({version, bytes})), generatedBytes: Buffer.byteLength(generated)}));
