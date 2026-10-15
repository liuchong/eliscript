import {afterAll, beforeAll, describe, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';

const catalog = JSON.parse(await readFile(new URL('./fixtures/wasm-managed-behavior.json', import.meta.url), 'utf8'));
assert.equal(catalog.format, 'eliscript-managed-bdd');assert.equal(catalog.version, 1);
assert.deepEqual(catalog.features.map(feature => feature.name), ['Array text conversion', 'Represented type and null queries', 'Text formatting and decomposition', 'Stable array sorting', 'Integer rounding', 'Live collection callbacks', 'Sequence concatenation', 'Value identity']);
assert.deepEqual(catalog.features.flatMap(feature => feature.scenarios.map(scenario => scenario.id)), [
  'empty-and-holes', 'exact-primitive-text', 'shared-arrays', 'length-before-separator', 'live-element-reads', 'conversion-fallback',
  'capture-before-arguments', 'toString-late-join-lookup', 'custom-result-identity', 'self-cycle-and-recovery', 'mutual-cycle-and-recovery',
  'primitive-labels', 'capture-and-live-member', 'missing-member', 'null-predicate-family', 'nil-is-distinct', 'null-member-fails', 'unrepresented-global-refusal',
  'indexed-member-path', 'indexed-capture-live-write', 'indexed-intermediate-fails', 'computed-index-refusal', 'intrinsic-type-evaluates-once', 'intrinsic-own-brands',
  'unicode-case-expansion', 'padding-code-units', 'number-radix-text', 'replace-all-original-text', 'literal-split-zero-effects', 'regexp-split-captures', 'invalid-number-radix-recovery',
  'sort-sparse-identity', 'sort-stable-equal-keys', 'sort-nan-ties', 'sort-captured-method', 'to-sorted-dense-copy', 'to-sorted-source-mutation', 'sort-invalid-comparator-recovery', 'to-sorted-invalid-comparator-recovery',
  'math-round-half-and-zero', 'math-floor-ceil-trunc', 'math-number-hint-after-arguments', 'math-conversion-error-recovery',
  'map-for-each-live-clear', 'set-for-each-reinsert', 'collection-for-each-empty-error',
  'concat-sparse-shallow-copy', 'concat-ordered-string-conversions', 'concat-own-method-capture',
  'same-value-ieee', 'same-value-object-identity', 'same-value-missing-effects', 'same-value-lexical-method',
]);
let directory, b, runtime;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-managed-bdd-'));b = await buildBackends({outputRoot: directory});
  runtime = b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});

function observe(a, value) {
  if (value === null || typeof value !== 'object') return value;
  if (value.kind === 4) return a.readNumber(value);
  if (value.kind === 5) return a.readString(value);
  assert.equal(value.kind, 14, 'BDD results use ordinary source arrays');
  return Array.from({length: a.length(value)}, (_, index) => {const item = a.get(value, index);try {return observe(a, item);} finally {a.release(item);}});
}
const ids = new Set();
for (const feature of catalog.features) describe('Feature: ' + feature.name + ' — ' + feature.description, () => {
  for (const scenario of feature.scenarios) {
    assert(!ids.has(scenario.id), 'unique BDD scenario identity');ids.add(scenario.id);
    for (const field of ['given', 'when', 'then', 'source']) assert.equal(typeof scenario[field], 'string');
    test('Scenario: ' + scenario.id + '\nGiven ' + scenario.given + '\nWhen ' + scenario.when + '\nThen ' + scenario.then, async () => {
      const filename = 'bdd-' + scenario.id + '.eli', source = ';中😀\n(defconst marker 1)\n' + scenario.source + '\n(export run' + (Object.hasOwn(scenario, 'recover') ? ' recover' : '') + ')';
      const program = b.compiler.compile_ir_string(source, filename), before = JSON.stringify(program);
      const js = await import('data:text/javascript;base64,' + Buffer.from(b.compiler.emit_ir_string(program)).toString('base64'));
      if (scenario.compileError) {
        assert.deepEqual(js.run(), scenario.expected);
        assert.throws(() => b.managed.emit_managed_wasm(program, runtime), error => error.eliscriptDiagnostic?.code === scenario.compileError && error.eliscriptDiagnostic.location.file === filename && error.eliscriptDiagnostic.location.start.line >= 2);
        assert.equal(JSON.stringify(program), before);return;
      }
      const bytes = Uint8Array.from(b.managed.emit_managed_wasm(program, runtime));assert.equal(JSON.stringify(program), before);
      assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
      const a = instantiateManagedRuntime(bytes);a.auto(1);
      try {
        if (scenario.runtimeError) {
          assert.throws(() => js.run(), error => error.name === scenario.jsError && (scenario.runtimeError !== 'ELI-RT0009' || error.eliscriptDiagnostic?.code === scenario.runtimeError));
          assert.throws(() => a.invoke('run'), error => error.eliscriptDiagnostic?.code === scenario.runtimeError && (!scenario.wasmError || error.name === scenario.wasmError));
          assert.equal(a.stats().frameDepth, 0);
          if (Object.hasOwn(scenario, 'recover')) {const out = a.invoke('recover');try {assert.deepEqual(observe(a, out), scenario.recover);assert.deepEqual(js.recover(), scenario.recover);} finally {a.release(out);}}
        } else {
          const out = a.invoke('run');try {assert.deepEqual(js.run(), scenario.expected);assert.deepEqual(observe(a, out), scenario.expected);} finally {a.release(out);}
        }
      } finally {a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);}
    });
  }
});
