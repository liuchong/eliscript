import {readFile, writeFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Maintenance only: normal compilation emits the fixed literal and never runs
// a bundler. One identical offline URL shares guards across generated modules.
export async function renderArrayTextImport() {
  const result = await Bun.build({entrypoints: [resolve(root, 'runtime/array-text.mjs')], target: 'browser', format: 'esm', minify: true});
  if (!result.success || result.outputs.length !== 1) throw new Error('array text capsule build failed', {cause: result.logs});
  const source = (await result.outputs[0].text()).trim();
  const url = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  return `import { c as __eliscript_at } from ${JSON.stringify(url)};\n`;
}

export async function checkArrayTextCapsule({write = false} = {}) {
  const prelude = await renderArrayTextImport(), literal = JSON.stringify(prelude), changed = [];
  for (const [file, name] of [['compiler/eliscript-emitter.el', 'eliscript-emitter--array-text-import'], ['bootstrap/compiler/emitter.eli', 'array-text-import']]) {
    const path = resolve(root, file), source = await readFile(path, 'utf8');
    const pattern = new RegExp('(\\(defconst ' + name + '\\s+)("(?:[^"\\\\]|\\\\.)*")');
    const match = source.match(pattern);if (!match) throw new Error('missing array text capsule declaration: ' + file);
    if (JSON.parse(match[2]) !== prelude) {changed.push(file);if (write) await writeFile(path, source.replace(pattern, (_, prefix) => prefix + literal));}
  }
  if (changed.length && !write) throw new Error('array text capsule is stale: ' + changed.join(', '));
  return {bytes: Buffer.byteLength(prelude), changed};
}
if (import.meta.main) {
  if (process.argv.slice(2).some(arg => arg !== '--write')) throw new Error('unknown array text capsule argument');
  console.log(JSON.stringify(await checkArrayTextCapsule({write: process.argv.includes('--write')})));
}
