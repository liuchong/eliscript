// Deferred experiment, deliberately excluded from make test. No counter
// optimization is implemented or accepted. Run manually with Bun; the default
// ends at the still-Red code-shape contract. --semantics-only runs its reusable
// oracles without claiming that specialization or performance has passed.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,readdir,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
assert(process.argv.slice(2).every(arg=>arg==='--semantics-only'),'unknown experiment argument');
const source=String.raw`
(defun scan (values trace)
  (let ((index 0))
    (while (< index (get values :length))
      (when (> index 0) (js-call trace :push index))
      (setq index (1+ index))) index))
(defun fixed (trace)
  (let ((index 0)) (while (< index 3) (js-call trace :push index) (setq index (+ index 1))) index))
(defun captured (values trace install)
  (let ((index 0)) (funcall install (lambda (value) (setq index value)))
    (while (< index (get values :length)) (js-call trace :push index) (setq index (1+ index))) index))
(defun changed (values trace)
  (let ((index 0)) (setq index "0")
    (while (< index (get values :length)) (js-call trace :push index) (setq index (1+ index))) index))
(defun raw (values trace)
  (let ((index 0)) (js* "void index")
    (while (< index (get values :length)) (js-call trace :push index) (setq index (1+ index))) index))
(defun shadow (values trace)
  (let ((index 0)) (let ((index "1")) (js-call trace :push (< index (get values :length))))
    (while (< index (get values :length)) (js-call trace :push index) (setq index (1+ index))) index))
(defvar outside-index "2")
(defun outside (trace)
  (js-call trace :push (< outside-index "10"))
  (let ((outside-index 0)) (while (< outside-index 2) (js-call trace :push outside-index) (setq outside-index (1+ outside-index))))
  (< outside-index "10"))
(defun effectful-bound (trace)
  (let ((index 0)) (js-call trace :push (< index (progn (setq index 2) 1))) index))
(defasync asynchronous (values trace)
  (let ((index 0)) (while (< index (await values)) (js-call trace :push index) (setq index (1+ index))) index))
(export scan fixed captured changed raw shadow outside effectful-bound asynchronous)`;
function nativeScan(values,trace){let index=0;while(index<values.length){if(index>0)trace.push(index);index=index+1;}return index;}
function body(code,name){const start=code.indexOf('function '+name+'('),next=code.indexOf('\nfunction ',start+1);assert(start>=0,name);return code.slice(start,next<0?undefined:next);}
async function check(m){
  for(const length of[0,-0,-2,1,3,3.5,NaN,'3',null,undefined,3n]){
    const actual=[],expected=[];
    assert.equal(m.scan({length},actual),nativeScan({length},expected));
    assert.deepEqual(actual,expected);
  }
  const build=()=>{let reads=0;const events=[];return{events,value:{get length(){events.push('length');return{[Symbol.toPrimitive](hint){events.push(hint);return reads++<3?3:0;}};}}};};
  const a=build(),b=build(),ta=[],tb=[];
  assert.equal(m.scan(a.value,ta),nativeScan(b.value,tb));
  assert.deepEqual(a.events,b.events);assert.deepEqual(ta,tb);
  let reads=0;assert.equal(m.scan({get length(){reads++;return 3;}},[]),3);assert.equal(reads,4);
  const marker={};assert.throws(()=>m.scan({get length(){throw marker;}},[]),e=>e===marker);
  assert.throws(()=>m.scan({length:Symbol('x')},[]),TypeError);
  const trace=[];assert.equal(m.fixed(trace),3);assert.deepEqual(trace,[0,1,2]);
  let set;const captured=[];
  // On the last test the left operand is already 3 before the getter resets
  // index to 2. The comparison fails and the function therefore returns 2.
  assert.equal(m.captured({get length(){set(2);return 3;}},captured,fn=>{set=fn;}),2);
  assert.deepEqual(captured,[2]);
  const changed=[];assert.equal(m.changed({length:3},changed),'011');assert.deepEqual(changed,['0','01']);
  const raw=[];assert.equal(m.raw({length:2},raw),2);assert.deepEqual(raw,[0,1]);
  const shadow=[];assert.equal(m.shadow({length:2},shadow),2);assert.deepEqual(shadow,[true,0,1]);
  const outside=[];assert.equal(m.outside(outside),false);assert.deepEqual(outside,[false,0,1]);
  const effects=[];assert.equal(m.effectful_bound(effects),2);assert.deepEqual(effects,[true]);
  const log=[];assert.equal(await m.asynchronous(Promise.resolve(2),log),2);assert.deepEqual(log,[0,1]);
  for(const length of['-0x100000000000000000000000000000001','-1e300','0b0000'])assert.equal(m.scan({length},[]),nativeScan({length},[]));
}

const directory=await mkdtemp(resolve(tmpdir(),'eliscript-counter-experiment-'));
try {
  const bootstrap=resolve(directory,'compiler');
  const build=spawnSync(resolve(root,'bin/eliscript-bootstrap'),[],{cwd:root,encoding:'utf8',timeout:30000,env:{...process.env,ELISCRIPT_BOOTSTRAP_OUT_DIR:bootstrap}});
  assert.equal(build.status,0,build.stderr);
  let compiler=await import(pathToFileURL(resolve(bootstrap,'compiler.mjs')).href);
  const input=resolve(directory,'counter.eli'),output=resolve(directory,'counter.mjs');
  await writeFile(input,source);
  const seed=spawnSync(resolve(root,'bin/eliscript-seed'),['--output',output,input],{cwd:root,encoding:'utf8',timeout:30000});
  assert.equal(seed.status,0,seed.stderr);
  const code=compiler.compile_string(source,input);
  assert.equal(await readFile(output,'utf8'),code);
  await check(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')));
  for(const name of['captured','changed','raw','shadow','outside','effectful_bound','asynchronous'])assert(body(code,name).includes('__eliscript_numeric_relation('),name+' must retain its original conversion path');
  for(const host of['node','bun']){
    const child=spawnSync(host,['--input-type=module','-e',`import assert from 'node:assert/strict';const m=await import(process.argv[1]);${nativeScan.toString()}\nawait (${check.toString()})(m);`,pathToFileURL(output).href],{cwd:root,encoding:'utf8',timeout:30000});
    assert.equal(child.status,0,host+': '+child.stderr);
  }
  const files=(await readdir(resolve(root,'bootstrap/compiler'))).filter(file=>file.endsWith('.eli')).sort();assert.equal(files.length,13);
  let previous;
  for(let generation=0;generation<3;generation++){
    assert.equal(compiler.compile_string(source,input),code);
    const out=resolve(directory,'g'+generation);await mkdir(out);const artifacts=[];
    for(const file of files){const filename=resolve(root,'bootstrap/compiler',file),text=await readFile(filename,'utf8'),target=file.replace(/\.eli$/,'.mjs'),result=compiler.compile_string_with_source_map(text,filename,target,file);artifacts.push([file,result.javascript,result.sourceMap]);await writeFile(resolve(out,target),result.javascript);}
    if(previous)assert.deepEqual(artifacts,previous);previous=artifacts;
    compiler=await import(pathToFileURL(resolve(out,'compiler.mjs')).href);
  }
  console.log('EXPERIMENT ONLY: semantic, Node/Bun, Seed and three-generation checks passed; specialization and performance remain unaccepted.');
  if(!process.argv.includes('--semantics-only')){
    assert.match(body(code,'scan'),/typeof __eliscript_value_\d+ === "number"/,'PENDING / NOT IMPLEMENTED: guarded private-counter dynamic bound');
    assert.match(body(code,'scan'),/if \(\(index > 0\)\)/,'PENDING / NOT IMPLEMENTED: direct proven Number comparison');
    assert(!body(code,'fixed').includes('__eliscript_numeric_relation'),'PENDING / NOT IMPLEMENTED: private Number loop');
  }
} finally {
  await rm(directory,{recursive:true,force:true});
}
