import {beforeAll, afterAll, describe, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
let directory, memory, wide, deep, tdz, compiler;
// Prepare full compiler fixtures under the existing setup deadline. Assertions
// keep the default test deadline; every real child still has its 30s deadline.
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-seed-reservation-'));const b = await buildBackends({outputRoot: resolve(directory, 'backend')});compiler=b.compiler;
  const input = resolve('bootstrap/runtime/memory.eli'), output = resolve(directory, 'memory.mjs'), source = await readFile(input, 'utf8');
  seed(input, output);memory = {output, javascript: await readFile(output, 'utf8'), expected: b.compiler.compile_string(source, input)};
  const wideSource = '(module wide\n' + Array.from({length: 1200}, (_, index) => `(defun f${index} () ${index})`).join('\n') + '\n(defmacro once (form) `(let ((value$ ,form)) value$))\n(defun run (value$G1) (once (+ value$G1 (f1199))))\n(export run))';
  const wideInput = resolve(directory, 'wide.eli'), wideOutput = resolve(directory, 'wide.mjs');await writeFile(wideInput, wideSource);seed(wideInput, wideOutput);
  wide = {output: wideOutput, javascript: await readFile(wideOutput, 'utf8'), expected: b.compiler.compile_string(wideSource, wideInput)};
  const deepLayers=96;
  let deepExpression='(once value$G1)';
  for(let index=deepLayers-1;index>=0;index--)deepExpression=
    `(let ((unit (progn (js-call trace :push ${index}) value$G1))) (if (= unit ${index}) unit ${deepExpression}))`;
  const deepSource='(module deep-ordinary\n'+
    '(defmacro once (form) `(let ((value$ ,form)) value$))\n'+
    `(defun run (value$G1 trace) ${deepExpression})\n(export run))`;
  const deepInput=resolve(directory,'deep-ordinary.eli'),deepOutput=resolve(directory,'deep-ordinary.mjs');
  await writeFile(deepInput,deepSource);seed(deepInput,deepOutput);
  deep={output:deepOutput,layers:deepLayers,javascript:await readFile(deepOutput,'utf8'),
    expected:b.compiler.compile_string(deepSource,deepInput)};
  const tdzSource='(defvar value -0.0) (defun replace-value (next) (setq value next)) (defun read-value () value) (export value replace-value read-value)',
    tdzInput=resolve(directory,'tdz-value.eli'),tdzOutput=resolve(directory,'tdz-value.mjs');
  await writeFile(tdzInput,tdzSource);seed(tdzInput,tdzOutput);
  tdz={output:tdzOutput,javascript:await readFile(tdzOutput,'utf8'),expected:b.compiler.compile_string(tdzSource,tdzInput),reserved:[]};
  for(const name of['__eliscript_tdz_value_0','__eliscript-tdz-value-0']){
    const source=`(defvar ${name} 1)`,input=resolve(directory,`reserved-${tdz.reserved.length}.eli`),output=resolve(directory,`reserved-${tdz.reserved.length}.mjs`);
    await writeFile(input,source);
    tdz.reserved.push({name,source,input,child:spawnSync(resolve('bin/eliscript-seed'),['--diagnostic-format','json','--output',output,input],{encoding:'utf8',timeout:30000})});
  }
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});
function seed(input, output) {
  const child = spawnSync(resolve('bin/eliscript-seed'), ['--output', output, input], {encoding: 'utf8', timeout: 30000});
  assert.equal(child.status, 0, child.stderr);assert.equal(child.signal, null);assert.equal(child.error, undefined);
}
function exactJavaScript(actual, expected, label) {
  // Keep strict byte-product equality without asking assert to format two
  // complete runtime programs when one code unit differs.
  if (actual === expected) return;
  let first = 0;
  while (first < actual.length && first < expected.length && actual.charCodeAt(first) === expected.charCodeAt(first)) first++;
  const start = Math.max(0, first - 40);
  assert.fail(`${label}: firstMismatch UTF16=${first}; actualLength=${actual.length}; expectedLength=${expected.length}; ` +
    `actualContext=${JSON.stringify(actual.slice(start, start + 80))}; expectedContext=${JSON.stringify(expected.slice(start, start + 80))}`);
}
describe('Feature: Seed name reservation handles large modules without consuming Lisp call depth', () => {
  test('Given a mutable module named value, when Seed and self-hosted emit TDZ writers, then exact JS and live assignments agree without exposing the reserved temporary',()=>{
    exactJavaScript(tdz.javascript,tdz.expected,'module value TDZ writer');
    assert.match(tdz.javascript,/function __eliscript_tdz_write_0\(__eliscript_tdz_value_0\)/);
    assert(tdz.javascript.includes('return (value = __eliscript_tdz_value_0);'));
    const child=spawnSync('node',['--input-type=module','-e',`import assert from 'node:assert/strict';
      const m=await import(process.argv[1]);assert(Object.is(m.value,-0));
      const object={marker:7};
      for(const value of[undefined,null,false,true,-0,0,NaN,Infinity,'updated',object]){
        assert(Object.is(m.replace_value(value),value));
        assert(Object.is(m.value,value));assert(Object.is(m.read_value(),value));
      }`,pathToFileURL(tdz.output).href],{encoding:'utf8',timeout:30000});
    assert.equal(child.status,0,child.stderr);assert.equal(child.signal,null);assert.equal(child.error,undefined);
    for(const {name,source,input,child:rejected} of tdz.reserved){
      assert.equal(rejected.status,1,rejected.stderr);assert.equal(rejected.signal,null);assert.equal(rejected.error,undefined);
      assert.match(rejected.stderr,/reserved compiler prefix/);
      const message=`binding name uses reserved compiler prefix: ${name}`,
        diagnostic={format:'eliscript-diagnostic',version:1,code:'ELI-A0001',severity:'error',phase:'analysis',message,
          location:{file:input,start:{offset:8,line:1,column:9},end:{offset:8+name.length,line:1,column:9+name.length}}};
      assert.deepEqual(JSON.parse(rejected.stderr),diagnostic);
      assert.throws(()=>compiler.compile_string(source,input),error=>{
        assert.equal(error.message,`${input}:1:9: ${message}`);
        assert.deepEqual(error.eliscriptDiagnostic,diagnostic);return true;
      });
    }
  });
  test('Given the complete memory runtime, when public Seed compiles it, then its JS exactly equals the self-hosted result', async () => {
    exactJavaScript(memory.javascript, memory.expected, 'complete memory runtime');
    const child = spawnSync('node', ['--check', memory.output], {encoding: 'utf8', timeout: 30000});assert.equal(child.status, 0, child.stderr);
  });
  test('Given 1200 sibling definitions and source name collisions, when Seed and self-hosted compilers expand a macro, then output and executed values agree', async () => {
    exactJavaScript(wide.javascript, wide.expected, '1200 sibling definitions');
    const child = spawnSync('node', ['--input-type=module', '-e', `import assert from'node:assert/strict';const m=await import(process.argv[1]);for(const x of[-0,0,1,19,1e9])assert.equal(m.run(x),x+1199);`, pathToFileURL(wide.output).href], {encoding: 'utf8', timeout: 30000});assert.equal(child.status, 0, child.stderr);
  });
  test('Given a deep ordinary if and let tree, when public Seed and self-hosted compilers expand it, then exact JS and ordered effects agree',()=>{
    exactJavaScript(deep.javascript,deep.expected,'96 ordinary if/let levels');
    const child=spawnSync('node',['--input-type=module','-e',`import assert from 'node:assert/strict';
      const m=await import(process.argv[1]),layers=Number(process.argv[2]);
      for(const value of[undefined,null,false,true,-0,0,1,47,95,96,-1,NaN,Infinity,-Infinity,Number.MIN_VALUE]){
        const trace=[],result=m.run(value,trace);
        assert(Object.is(result,value));
        const count=typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<layers?value+1:layers;
        assert.deepEqual(trace,Array.from({length:count},(_,index)=>index));
      }`,pathToFileURL(deep.output).href,String(deep.layers)],{encoding:'utf8',timeout:30000});
    assert.equal(child.status,0,child.stderr);assert.equal(child.signal,null);assert.equal(child.error,undefined);
  });
});
