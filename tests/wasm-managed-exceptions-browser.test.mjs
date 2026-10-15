import { beforeAll, afterAll, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { buildBackends } from '../tools/backends/build.mjs';

let directory, backend, runtime, scenarios;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-exception-browser-'));
  backend = await buildBackends({ outputRoot: directory });
  runtime = await readFile('bootstrap/runtime/memory.eli', 'utf8');
  const catalog = JSON.parse(await readFile('tests/fixtures/wasm-managed-behavior.json', 'utf8'));
  scenarios = catalog.features.filter(feature => ['Source exceptions', 'Source Error construction', 'Catch destructuring'].includes(feature.name)).flatMap(feature => feature.scenarios);
  assert.equal(scenarios.length, 14);
}, 120000);
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

test('the real browser compiles and executes every shared exception scenario with identical zero-import WASM bytes', async () => {
  const entry = resolve(directory, 'exception-browser.mjs');
  await writeFile(entry,
    'export {compile_ir_string,emit_ir_string} from ' + JSON.stringify(resolve(directory, 'bootstrap/compiler.mjs')) + ';\n' +
    'export {emit_managed_wasm} from ' + JSON.stringify(resolve(directory, 'backends/managed.mjs')) + ';\n' +
    'export {instantiateManagedRuntime} from ' + JSON.stringify(resolve('tools/backends/managed-runtime.mjs')) + ';\n');
  const bundle = await Bun.build({ entrypoints: [entry], target: 'browser', format: 'esm' });
  assert(bundle.success);
  const references = [];
  for (const [index, scenario] of scenarios.entries()) {
    const source = '(defconst marker 1)\n' + scenario.source + '\n(export run)', filename = 'bdd-' + scenario.id + '.eli';
    const javascript = backend.compiler.emit_ir_string(backend.compiler.compile_ir_string(source, filename));
    const reference = resolve(directory, 'exception-reference-' + index + '.mjs');
    await writeFile(reference, javascript.replace(/from "eliscript\/([^"]+)"/g, (_, path) => 'from ' + JSON.stringify(resolve(path))));
    const result = await Bun.build({ entrypoints: [reference], target: 'browser', format: 'esm' });
    assert(result.success, scenario.id + ': bundle actual JavaScript runtime dependencies');
    references.push({ javascript, bundle: await result.outputs[0].text() });
  }

  const require = createRequire(import.meta.url);
  const playwright = require(require.resolve('playwright-core', { paths: [process.cwd(), ...(process.env.NODE_PATH ?? '').split(delimiter).filter(Boolean)] }));
  const name = process.env.ELISCRIPT_TEST_BROWSER ?? 'chromium';
  assert(['chromium', 'firefox', 'webkit'].includes(name));
  const browser = await playwright[name].launch();
  try {
    const page = await browser.newPage();
    const evidence = await page.evaluate(async ({ bundle, runtime, scenarios, references }) => {
      const url = URL.createObjectURL(new Blob([bundle], { type: 'text/javascript' }));
      try {
        const compiler = await import(url), runtimeIR = compiler.compile_ir_string(runtime, 'runtime.eli'), artifacts = [];
        const check = (value, label) => { if (!value) throw Error(label); };
        for (const [index, scenario] of scenarios.entries()) {
          const filename = 'bdd-' + scenario.id + '.eli', source = '(defconst marker 1)\n' + scenario.source + '\n(export run)';
          const program = compiler.compile_ir_string(source, filename), saved = JSON.stringify(program);
          const bytes = Uint8Array.from(compiler.emit_managed_wasm(program, runtimeIR));
          check(JSON.stringify(program) === saved, scenario.id + ': IR mutation');
          check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length === 0, scenario.id + ': imports');
          check(compiler.emit_ir_string(program) === references[index].javascript, scenario.id + ': JavaScript compiler bytes');
          const jsURL = URL.createObjectURL(new Blob([references[index].bundle], { type: 'text/javascript' }));
          const a = compiler.instantiateManagedRuntime(bytes); a.auto(1);
          try {
            const js = await import(jsURL);
            const read = value => {
              if (value?.kind === 4) return a.readNumber(value);
              if (value?.kind === 5) return a.readString(value);
              if (value?.kind === 14) return Array.from({ length: a.length(value) }, (_, index) => {
                const item = a.get(value, index); try { return read(item); } finally { a.release(item); }
              });
              return value;
            };
            const out = a.invoke('run');
            try {
              check(JSON.stringify(js.run()) === JSON.stringify(scenario.expected), scenario.id + ': JS oracle');
              check(JSON.stringify(read(out)) === JSON.stringify(scenario.expected), scenario.id + ': WASM behavior');
            } finally { a.release(out); }
          } finally {
            a.closeModule(); a.collect();
            check(a.live() === 0 && a.stats().frameDepth === 0, scenario.id + ': roots');
            URL.revokeObjectURL(jsURL);
          }
          artifacts.push({ id: scenario.id, bytes: [...bytes] });
        }
        return artifacts;
      } finally { URL.revokeObjectURL(url); }
    }, { bundle: await bundle.outputs[0].text(), runtime, scenarios, references });
    const runtimeIR = backend.compiler.compile_ir_string(runtime, 'runtime.eli');
    for (const [index, scenario] of scenarios.entries()) {
      const source = '(defconst marker 1)\n' + scenario.source + '\n(export run)', filename = 'bdd-' + scenario.id + '.eli';
      const expected = Uint8Array.from(backend.managed.emit_managed_wasm(backend.compiler.compile_ir_string(source, filename), runtimeIR));
      assert.equal(evidence[index].id, scenario.id);
      assert.deepEqual(Uint8Array.from(evidence[index].bytes), expected, scenario.id);
    }
  } finally { await browser.close(); }
}, 30000);
