import {beforeAll, afterAll, describe, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
let directory, b;
beforeAll(async () => {directory = await mkdtemp(resolve(tmpdir(), 'eliscript-seed-reservation-'));b = await buildBackends({outputRoot: resolve(directory, 'backend')});}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});
function seed(input, output) {
  const child = spawnSync(resolve('bin/eliscript-seed'), ['--output', output, input], {encoding: 'utf8', timeout: 30000});
  assert.equal(child.status, 0, child.stderr);assert.equal(child.signal, null);assert.equal(child.error, undefined);
}
describe('Feature: Seed name reservation handles large modules without consuming Lisp call depth', () => {
  test('Given the complete memory runtime, when public Seed compiles it, then its JS exactly equals the self-hosted result', async () => {
    const input = resolve('bootstrap/runtime/memory.eli'), output = resolve(directory, 'memory.mjs'), source = await readFile(input, 'utf8');
    seed(input, output);const javascript = await readFile(output, 'utf8');assert.equal(javascript, b.compiler.compile_string(source, input));
    const child = spawnSync('node', ['--check', output], {encoding: 'utf8', timeout: 30000});assert.equal(child.status, 0, child.stderr);
  });
  test('Given 1200 sibling definitions and source name collisions, when Seed and self-hosted compilers expand a macro, then output and executed values agree', async () => {
    const source = '(module wide\n' + Array.from({length: 1200}, (_, index) => `(defun f${index} () ${index})`).join('\n') + '\n(defmacro once (form) `(let ((value$ ,form)) value$))\n(defun run (value$G1) (once (+ value$G1 (f1199))))\n(export run))';
    const input = resolve(directory, 'wide.eli'), output = resolve(directory, 'wide.mjs');await writeFile(input, source);seed(input, output);
    assert.equal(await readFile(output, 'utf8'), b.compiler.compile_string(source, input));
    const child = spawnSync('node', ['--input-type=module', '-e', `import assert from'node:assert/strict';const m=await import(process.argv[1]);for(const x of[-0,0,1,19,1e9])assert.equal(m.run(x),x+1199);`, pathToFileURL(output).href], {encoding: 'utf8', timeout: 30000});assert.equal(child.status, 0, child.stderr);
  });
});
