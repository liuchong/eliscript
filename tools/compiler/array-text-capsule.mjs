import {readFile, writeFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Maintenance only: normal compilation emits the fixed literal and never runs
// a bundler. One identical offline URL shares guards and the bundled exact
// Number radix formatter across generated modules; no runtime fetch is needed.
export async function renderArrayTextImport() {
  const result = await Bun.build({entrypoints: [resolve(root, 'runtime/array-text.mjs')], target: 'browser', format: 'esm', minify: true});
  if (!result.success || result.outputs.length !== 1) throw new Error('array text capsule build failed', {cause: result.logs});
  const source = (await result.outputs[0].text()).trim();
  const url = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  return `import { c as __eliscript_at, d as __eliscript_at_direct } from ${JSON.stringify(url)};\n`;
}

export async function checkArrayTextCapsule({write = false} = {}) {
  const prelude = await renderArrayTextImport(), literal = JSON.stringify(prelude), changed = [], updates = [];
  const importUrl = text => {
    const match = /from ("(?:[^"\\]|\\.)*");\n$/.exec(text);
    if (!match) throw new Error('invalid array text capsule import');
    return JSON.parse(match[1]);
  };
  const previousUrls = new Set(), specifier = importUrl(prelude);
  for (const [file, name] of [['compiler/eliscript-emitter.el', 'eliscript-emitter--array-text-import'], ['bootstrap/compiler/emitter.eli', 'array-text-import']]) {
    const path = resolve(root, file), source = await readFile(path, 'utf8');
    const pattern = new RegExp('(\\(defconst ' + name + '\\s+)("(?:[^"\\\\]|\\\\.)*")');
    const match = source.match(pattern);if (!match) throw new Error('missing array text capsule declaration: ' + file);
    previousUrls.add(importUrl(JSON.parse(match[2])));
    if (JSON.parse(match[2]) !== prelude) {changed.push(file);updates.push([path, source.replace(pattern, (_, prefix) => prefix + literal)]);}
  }
  // Pin the exact compiler-owned URL at its two checked-in consumers. This
  // never permits arbitrary data imports or expands the core package boundary.
  const contractFile = 'contracts/repository-integrity.json', contractPath = resolve(root, contractFile);
  const contract = JSON.parse(await readFile(contractPath, 'utf8'));
  const records = contract.imports?.specialSpecifiers;
  if (!Array.isArray(records)) throw new Error('missing integrity special specifiers');
  const allowedRoots = ['runtime/core/protocol-impl.mjs', 'tests/snapshots/core.mjs'];
  const existing = records.find(record => record.specifier === specifier);
  if (existing && JSON.stringify(existing.allowedRoots) !== JSON.stringify(allowedRoots))
    throw new Error('array text capsule integrity roots differ');
  const next = records.filter(record => record.specifier === specifier || !previousUrls.has(record.specifier));
  if (!existing) next.push({specifier, allowedRoots});
  const selector = record => record.specifier === undefined ? '^' + record.prefix : '=' + record.specifier;
  next.sort((left, right) => selector(left) < selector(right) ? -1 : selector(left) > selector(right) ? 1 : 0);
  if (JSON.stringify(next) !== JSON.stringify(records)) {
    contract.imports.specialSpecifiers = next;changed.push(contractFile);
    updates.push([contractPath, JSON.stringify(contract, null, 2) + '\n']);
  }
  if (write) for (const [path, source] of updates) await writeFile(path, source);
  if (changed.length && !write) throw new Error('array text capsule is stale: ' + changed.join(', '));
  return {bytes: Buffer.byteLength(prelude), changed};
}
if (import.meta.main) {
  if (process.argv.slice(2).some(arg => arg !== '--write')) throw new Error('unknown array text capsule argument');
  console.log(JSON.stringify(await checkArrayTextCapsule({write: process.argv.includes('--write')})));
}
