import { beforeAll, afterAll, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
let directory, compiler;
const source=String.raw`
(defun control (n)
  (let ((index 0) (total 0) (trace (js-array)))
    (while (< index n)
      (if (= (% index 2) 0)
          (progn (js-call trace :push "even") (setq total (+ total index)))
        (progn (js-call trace :push "odd") (setq total (- total index))))
      (when (= index 1) (js-call trace :push "when") (setq total (+ total 4)))
      (unless (= index 2) (js-call trace :push "unless") (setq total (+ total 1)))
      (cond ((= index 0) (js-call trace :push "zero") (setq total (+ total 2)))
            ((= index 3) (js-call trace :push "three") (setq total (+ total 3)))
            (t (setq total (+ total 0))))
      (setq index (1+ index)))
    (if (> n 2) (progn (js-call trace :push "large") (js-array total trace))
      (progn (js-call trace :push "small") (js-array total trace)))))
(defun sugar (value) (when value (progn 1 value)))
(defun inverse (value) (unless value (progn 2 value)))
(defun choose (value) (cond ((= value 1) (progn 2 "one")) ((= value 2)) (t "other")))
(defun absent (value) (if value 7))
(export control sugar inverse choose absent)`;
const truth=value=>value!==false&&value!=null;
function oracle(n) {let index=0,total=0;const trace=[];while(index<n){if(index%2===0){trace.push('even');total+=index;}else{trace.push('odd');total-=index;}if(index===1){trace.push('when');total+=4;}if(index!==2){trace.push('unless');total+=1;}if(index===0){trace.push('zero');total+=2;}else if(index===3){trace.push('three');total+=3;}else{total+=0;}index++;}trace.push(n>2?'large':'small');return[total,trace];}
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-control-context-'));const out=resolve(directory,'bootstrap'),child=spawnSync(resolve('bin/eliscript-bootstrap'),[],{encoding:'utf8',timeout:30000,env:{...process.env,ELISCRIPT_BOOTSTRAP_OUT_DIR:out}});assert.equal(child.status,0,child.stderr);compiler=await import(pathToFileURL(resolve(out,'compiler.mjs')).href);},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
const load=async code=>import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function bodies(code){return code.slice(code.indexOf('\nfunction control('));}
test('discarded and returning if, when, unless and cond emit statement blocks without branch IIFEs',()=>{const code=compiler.compile_string(source,'control.eli'),body=bodies(code);assert(body.includes('if ('));assert(!body.includes('=>'),body);assert(!body.includes(' ? '),body);assert(body.includes('return null;'));});
test('all control contexts agree with independent effects, null and Lisp truth semantics',async()=>{const m=await load(compiler.compile_string(source,'control.eli'));for(const n of[-1,0,1,2,3,4,10,3.5,NaN,'3'])assert.deepEqual(m.control(n),oracle(n));for(const value of[false,null,undefined,true,0,-0,'',NaN,[],{}]){assert(Object.is(m.sugar(value),truth(value)?value:null));assert(Object.is(m.inverse(value),truth(value)?null:value));assert.equal(m.absent(value),truth(value)?7:null);}for(const value of[1,2,0,null])assert.equal(m.choose(value),value===1?'one':value===2?null:'other');});

const boundarySource=String.raw`
(defun scopes ()
  (let ((x 9) (functions (js-array)))
    (if t (let ((x 2) (outer x)) (js-call functions :push (lambda () (js-array x outer)))))
    (when t (let* ((x (1+ x)) (next (1+ x))) (js-call functions :push (lambda () next))))
    (unless false (let ((x 7)) (js-call functions :push (lambda () x))))
    (cond (t (let ((x 4)) (js-call functions :push (lambda () x))))
          (t (js-call functions :push (lambda () 99))))
    (js-array x (js-call functions :map (lambda (function) (funcall function))))))
(defun values (v log)
  (js-array (if v (progn (js-call log :push "yes") 4) (progn (js-call log :push "no") 5))
            (when v (js-call log :push "when") 6)
            (unless v (js-call log :push "unless") 7)
            (cond ((= v 1) (js-call log :push "one") 8) (t (js-call log :push "other") 9))))
(defun thrown (v log)
  (try
    (progn (if v (progn (js-call log :push "before") (throw v))
               (progn (js-call log :push "fallback") 9))
           (js-call log :push "after") 17)
    (catch error (js-call log :push "caught") error)
    (finally (js-call log :push "finally"))))
(defun branches (value log)
  (cond ((progn (js-call log :push "first") (= value 0)) (js-call log :push "zero") 0)
        ((progn (js-call log :push "second") (= value 1)) (js-call log :push "one") 1)))
(defasync asynchronous (flag log)
  (js-call log :push "outer")
  (if flag (progn (js-call log :push "branch") (await (Promise/resolve 3))
                  (js-call log :push "resume") 7)
    (progn (js-call log :push "else") 8)))
(defasync discarded-async (flag log)
  (if flag (progn (js-call log :push "branch") (await (Promise/resolve 3))
                  (js-call log :push "resume") 7))
  (js-call log :push "after") 9)
(export scopes values thrown branches asynchronous discarded-async)`;
function checkBoundary(m) {
  assert.deepEqual(m.scopes(),[9,[[2,9],11,7,4]]);
  for(const v of[false,null,undefined,true,0,'',NaN,1,{},[]]){
    const log=[],yes=truth(v),out=m.values(v,log);assert.deepEqual(out,[yes?4:5,yes?6:null,yes?null:7,v===1?8:9]);assert.deepEqual(log,[yes?'yes':'no',yes?'when':'unless',v===1?'one':'other']);
    const thrown=[],value=m.thrown(v,thrown);assert(Object.is(value,yes?v:17));assert.deepEqual(thrown,yes?['before','caught','finally']:['fallback','after','finally']);
  }
  for(const v of[0,1,2]){const log=[];assert.equal(m.branches(v,log),v<2?v:null);assert.deepEqual(log,v===0?['first','zero']:v===1?['first','second','one']:['first','second']);}
}
async function asyncOracle(flag,log){log.push('outer');return truth(flag)?await(async()=>{log.push('branch');await Promise.resolve(3);log.push('resume');return 7;})():(()=>{log.push('else');return 8;})();}
async function discardedOracle(flag,log){if(truth(flag))await(async()=>{log.push('branch');await Promise.resolve(3);log.push('resume');return 7;})();log.push('after');return 9;}
async function timeline(fn,flag){const log=[],pending=fn(flag,log).then(value=>{log.push('done:'+value);return value;});queueMicrotask(()=>log.push('queued'));Promise.resolve().then(()=>log.push('promise'));const value=await pending;await Promise.resolve();return{value,log};}
test('statement branches retain nested lexical scopes, sequential bindings, captured closures, operand values, throws and clause effects',async()=>{const code=compiler.compile_string(boundarySource,'boundary.eli'),m=await load(code);checkBoundary(m);assert(code.includes(' ? '),'branches in Array operands must retain value expressions');assert.throws(()=>compiler.compile_string('(defun bad () (let* ((x 1) (x 2)) x))','duplicate.eli'),/duplicate local binding/);});
test('async conditional branches retain their original await IIFE and promise scheduling boundaries',async()=>{const code=compiler.compile_string(boundarySource,'boundary.eli'),m=await load(code);assert(code.includes('await (async () =>'),'async sequence boundary must remain');for(const flag of[true,false,0,'',null]){assert.deepEqual(await timeline(m.asynchronous,flag),await timeline(asyncOracle,flag));assert.deepEqual(await timeline(m.discarded_async,flag),await timeline(discardedOracle,flag));}});

test('Node and Bun independently verify conditional effects, closures and async microtask scheduling',async()=>{
  const file=resolve(directory,'boundary.mjs');await writeFile(file,compiler.compile_string(boundarySource,'boundary.eli'));
  const script=`import assert from 'node:assert/strict';const m=await import(process.argv[1]),truth=${truth.toString()};${checkBoundary.toString()}\n${asyncOracle.toString()}\n${discardedOracle.toString()}\n${timeline.toString()}\ncheckBoundary(m);for(const flag of[true,false,0,'',null]){assert.deepEqual(await timeline(m.asynchronous,flag),await timeline(asyncOracle,flag));assert.deepEqual(await timeline(m.discarded_async,flag),await timeline(discardedOracle,flag));}`;
  for(const host of['node','bun']){const child=spawnSync(host,['--input-type=module','-e',script,pathToFileURL(file).href],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,host+': '+child.stderr);}
});

test('public Seed and all thirteen compiler modules retain three-generation JS and Source Map fixed points',async()=>{
  const input=resolve(directory,'control.eli'),output=resolve(directory,'control.mjs');await writeFile(input,source);const seeded=spawnSync(resolve('bin/eliscript-seed'),['--source-map','--output',output,input],{encoding:'utf8',timeout:30000});assert.equal(seeded.status,0,seeded.stderr);
  const first=compiler.compile_string_with_source_map(source,input,'control.mjs','control.eli');assert.equal(await readFile(output,'utf8'),first.javascript+'//# sourceMappingURL=control.mjs.map\n');assert.deepEqual(JSON.parse(await readFile(output+'.map','utf8')),JSON.parse(first.sourceMap));
  const files=(await readdir('bootstrap/compiler')).filter(file=>file.endsWith('.eli')).sort();assert.equal(files.length,13);let current=compiler,canonical;
  for(let generation=0;generation<3;generation++){
    const out=resolve(directory,'g'+generation);await mkdir(out);const artifacts=[];
    for(const file of files){const filename=resolve('bootstrap/compiler',file),text=await readFile(filename,'utf8'),target=file.replace(/\.eli$/,'.mjs'),program=current.compile_ir_string(text,filename),saved=JSON.stringify(program),emission=current.emit_ir_string_with_source_map(program,text,target,file);assert.equal(JSON.stringify(program),saved);artifacts.push([file,emission.javascript,emission.sourceMap]);await writeFile(resolve(out,target),emission.javascript);}
    if(canonical)assert.deepEqual(artifacts,canonical);else canonical=artifacts;
    const emitted=current.compile_string_with_source_map(source,input,'control.mjs','control.eli');assert.deepEqual(emitted,first);checkBoundary(await load(current.compile_string(boundarySource,'boundary.eli')));
    current=await import(pathToFileURL(resolve(out,'compiler.mjs')).href);
  }
},30000);

const sequentialSource=String.raw`
(defun compact (state callback)
  (let* ((source (aref state "source")) (index (aref state "index"))
         (next (+ index 1)) (code (js-call source :codePointAt index))
         (answer (funcall callback code)))
    (js-array source index next code (js* "!!answer"))))
(defun forward () (let ((later 9)) (let* ((first later) (later 2)) (js-array first later))))
(defun self () (let ((x 4)) (let* ((x (1+ x)) (y (1+ x))) (js-array x y))))
(defun closure-forward () (let ((later 9)) (let* ((read (lambda () later)) (later 2)) (funcall read))))
(defun closure-self () (let ((read (lambda () "outer"))) (let* ((read (lambda () (funcall read))) (value (funcall read))) value)))
(defun raw-forward () (let ((later 9)) (let* ((first (js* "later")) (later 2)) (js-array first later))))
(defun write-forward () (let ((later 9)) (let* ((first (setq later 3)) (later 2)) (js-array first later))))
(defun reserved () (let* ((class 7) (next (+ class 1))) (js-array class next)))
(defun captures ()
  (let ((index 0) (callbacks (js-array)))
    (while (< index 3)
      (let* ((snapshot index) (next (+ snapshot 1))) (js-call callbacks :push (lambda () (js-array snapshot next))))
      (setq index (1+ index)))
    (js-call callbacks :map (lambda (callback) (funcall callback)))))
(export compact forward self closure-forward closure-self raw-forward write-forward reserved captures)`;
test('safe sequential initializers share a direct declaration block without temporary copies or nested per-binding scopes',()=>{const code=compiler.compile_string(sequentialSource,'sequential.eli'),body=code.slice(code.indexOf('\nfunction compact('),code.indexOf('\nfunction forward('));assert(body.includes('let source = (state)["source"];'),body);assert(body.includes('let answer = callback(code);'),body);assert(!body.includes('const __eliscript_value_'),body);});

function checkSequential(m){assert.deepEqual(m.forward(),[9,2]);assert.deepEqual(m.self(),[5,6]);assert.equal(m.closure_forward(),9);assert.equal(m.closure_self(),'outer');assert.deepEqual(m.raw_forward(),[9,2]);assert.deepEqual(m.write_forward(),[3,2]);assert.deepEqual(m.reserved(),[7,8]);assert.deepEqual(m.captures(),[[0,1],[1,2],[2,3]]);const events=[],state={get source(){events.push('source');return 'a😀';},get index(){events.push('index');return 1;}};assert.deepEqual(m.compact(state,code=>{events.push('callback:'+code);return NaN;}),['a😀',1,2,128512,false]);assert.deepEqual(events,['source','index','callback:128512']);const thrown={identity:1};for(const stage of['source','index','callback']){const trace=[],object={get source(){trace.push('source');if(stage==='source')throw thrown;return 'a😀';},get index(){trace.push('index');if(stage==='index')throw thrown;return 1;}};assert.throws(()=>m.compact(object,()=>{trace.push('callback');throw thrown;}),e=>e===thrown);assert.deepEqual(trace,stage==='source'?['source']:stage==='index'?['source','index']:['source','index','callback']);}}
const sequentialAsyncSource=String.raw`
(defasync ordered (log)
  (let* ((first (await (Promise/resolve 1))) (second (await (Promise/resolve 2))))
    (js-call log :push "body") (js-array first second)))
(export ordered)`;
async function sequentialAsyncOracle(_,log){return await(async(first)=>((second)=>{log.push('body');return[first,second];})(await Promise.resolve(2)))(await Promise.resolve(1));}
test('sequential grouping preserves outer self and forward references, closure captures, raw initializers, writes, reserved names, per-iteration scopes and failures',async()=>{const code=compiler.compile_string(sequentialSource,'sequential.eli');checkSequential(await load(code));for(const name of['forward','self','closure_forward','closure_self','raw_forward','write_forward']){const start=code.indexOf('\nfunction '+name+'('),next=code.indexOf('\nfunction ',start+1),body=code.slice(start,next<0?undefined:next);assert(body.includes('const __eliscript_value_'),name+' requires its original scope boundary');}});
test('sequential await scopes retain the original async IIFE boundaries and microtask order',async()=>{const code=compiler.compile_string(sequentialAsyncSource,'sequential-async.eli'),m=await load(code);assert(code.includes('return (await (async (first) =>'));assert.deepEqual(await timeline((_,log)=>m.ordered(log),true),await timeline(sequentialAsyncOracle,true));});
test('public Seed, Node, Bun and three compiler generations agree on safe and unsafe sequential scope cases',async()=>{const text=sequentialSource+'\n'+sequentialAsyncSource,input=resolve(directory,'sequential.eli'),output=resolve(directory,'sequential.mjs');await writeFile(input,text);const child=spawnSync(resolve('bin/eliscript-seed'),['--output',output,input],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);const code=compiler.compile_string(text,input);assert.equal(await readFile(output,'utf8'),code);const script=`import assert from 'node:assert/strict';const m=await import(process.argv[1]);${checkSequential.toString()}\n${timeline.toString()}\n${sequentialAsyncOracle.toString()}\ncheckSequential(m);assert.deepEqual(await timeline((_,log)=>m.ordered(log),true),await timeline(sequentialAsyncOracle,true));`;for(const host of['node','bun']){const result=spawnSync(host,['--input-type=module','-e',script,pathToFileURL(output).href],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,host+': '+result.stderr);}let current=compiler;const files=(await readdir('bootstrap/compiler')).filter(file=>file.endsWith('.eli')).sort();for(let generation=0;generation<3;generation++){assert.equal(current.compile_string(text,input),code);checkSequential(await load(current.compile_string(sequentialSource,'sequential.eli')));const out=resolve(directory,'sequential-g'+generation);await mkdir(out);for(const file of files){const filename=resolve('bootstrap/compiler',file);await writeFile(resolve(out,file.replace(/\.eli$/,'.mjs')),current.compile_string(await readFile(filename,'utf8'),filename));}current=await import(pathToFileURL(resolve(out,'compiler.mjs')).href);}},30000);
