import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory,backend,runtimeProgram,program,bytes,js;
const hex='0xbcf8f9bdba22840724d028768a8a77b3e6b0f283670085477910eccc4e9d6b278a11db79c280d4e9c237774812029ac7ce82daaafca38';
const number=x=>typeof x==='string'&&/^(?:0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+)$/.test(x.trim())?Number(BigInt(x.trim())):Number(x);
const expected={
 add:(a,b)=>a+b,subtract:(a,b)=>number(a)-number(b),multiply:(a,b)=>number(a)*number(b),divide:(a,b)=>number(a)/number(b),remainder:(a,b)=>number(a)%number(b),
 negate:a=>-number(a),reciprocal:a=>1/number(a),increment:a=>a+1,decrement:a=>number(a)-1,'identity-add':a=>a,'identity-multiply':a=>a,
 signed:a=>number(a)|0,unsigned:a=>number(a)>>>0,invert:a=>~number(a),mask:(a,b)=>number(a)&number(b),union:(a,b)=>number(a)|number(b),exclusive:(a,b)=>number(a)^number(b),
 'shift-left':(a,b)=>number(a)<<number(b),'shift-right':(a,b)=>number(a)>>number(b),'logical-right':(a,b)=>number(a)>>>number(b),'product-word':(a,b)=>Math.imul(number(a),number(b)),equal:(a,b)=>a===b,
 less:(a,b)=>typeof a==='string'&&typeof b==='string'?a<b:number(a)<number(b),
 'less-equal':(a,b)=>typeof a==='string'&&typeof b==='string'?a<=b:number(a)<=number(b),
 greater:(a,b)=>typeof a==='string'&&typeof b==='string'?a>b:number(a)>number(b),
 'greater-equal':(a,b)=>typeof a==='string'&&typeof b==='string'?a>=b:number(a)>=number(b),
 'ordered-add':(a,b,c)=>(a+b)+c,'ordered-subtract':(a,b,c)=>(number(a)-number(b))-number(c),snapshot:(a,b)=>a+b,
 'comparison-snapshot':(a,b,c)=>expected.less(a,b)&&expected.less(b,c),'comparison-effects':()=>1,
 'scalar-loop':(n,seed)=>{let i=0,x=seed,total=0;while(i<n){x=(3.8*number(x))*(1-number(x));total+=x;i++;}return total;},
};
const box=(a,x)=>typeof x==='number'?a.number(x):typeof x==='string'?a.string(x):x;
const read=(a,x)=>x&&typeof x==='object'?x.kind===4?a.readNumber(x):x.kind===5?a.readString(x):x:x;
function check(a,name,inputs){const args=inputs.map(x=>box(a,x));let out;try{out=a.invoke(name,args);assert(Object.is(read(a,out),expected[name](...inputs)),`${name}: ${inputs.map(x=>String(x)).join(',')}`);}finally{a.release(out);args.forEach(x=>a.release(x));}a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-primitive-operators-'));backend=await buildBackends({outputRoot:directory});
 runtimeProgram=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
 program=backend.compiler.compile_ir_string(await readFile('tests/fixtures/wasm-managed-primitive-operators.eli','utf8'),'primitive-operators.eli');
 bytes=Uint8Array.from(backend.managed.emit_managed_wasm(program,runtimeProgram));assert(WebAssembly.validate(bytes));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
 js=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(program)).toString('base64'));
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
test('ordinary mixed primitive arithmetic, word and relational operators exactly implement source conversion semantics under GC',()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:256,initialBytes:16384,maxBytes:1048576});a.auto(1);
 const inputs=[null,false,true,undefined,0,-0,1,-1,NaN,Infinity,Number.MIN_VALUE,.5,'','0','-0','1.5',' 0x10 ','0b101','0o77','invalid','中😀\ud800'];
 for(const x of inputs){for(const name of['negate','reciprocal','increment','decrement','signed','unsigned','invert','identity-add','identity-multiply'])check(a,name,[x]);
  for(const y of inputs)for(const name of['add','subtract','multiply','divide','remainder','mask','union','exclusive','shift-left','shift-right','logical-right','product-word','equal','less','less-equal','greater','greater-equal'])check(a,name,[x,y]);}
 assert(a.stats().collections>1000);
});
test('mixed variadic operations keep intermediate conversion order, alias snapshots and all comparison operand effects',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);
 for(const inputs of[['1',2,3],[1,2,'3'],[null,false,'x'],['invalid',1,2],['10','2',3],[-0,'0',null],[undefined,1,'x']]){
  for(const name of['ordered-add','ordered-subtract','comparison-snapshot'])check(a,name,inputs);check(a,'snapshot',inputs.slice(0,2));check(a,'comparison-effects',inputs.slice(0,2));
 }
 for(const name of['identity-add','identity-multiply']){const object=a.sourceObject({}),out=a.invoke(name,[object]);assert(a.keyEqual(object,out));a.release(out);a.release(object);}a.collect();assert.equal(a.live(),0);
});
test('WASM implicit numeric conversions retain exact long-radix rounding and f64 primitive results',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);
 for(const name of['subtract','multiply','divide','remainder','less','less-equal','greater','greater-equal'])check(a,name,[hex,Number(BigInt(hex))]);
 check(a,'negate',[hex]);check(a,'decrement',[hex]);
 let state=0x57a39b21;const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;},bits=new DataView(new ArrayBuffer(8));
 for(let i=0;i<512;i++){bits.setUint32(0,next(),true);bits.setUint32(4,next(),true);const n=bits.getFloat64(0,true),text=String(n);for(const name of['add','subtract','multiply','remainder','less','greater-equal'])check(a,name,[text,n]);}
});
test('generated JS primitive coercions preserve exact nondecimal rounding while retaining BigInt and object behavior',()=>{
 for(const name of['subtract','multiply','divide','remainder','less','less-equal','greater','greater-equal'])assert(Object.is(js[name.replaceAll('-','_')](hex,Number(BigInt(hex))),expected[name](hex,Number(BigInt(hex)))),name);
 assert(Object.is(js.negate(hex),expected.negate(hex)));assert.equal(js.subtract(5n,2n),3n);assert.throws(()=>js.subtract(5n,2),TypeError);
 const effects=[],left={valueOf(){effects.push('left');return 5;}},right={valueOf(){effects.push('right');return 2;}};assert.equal(js.subtract(left,right),3);assert.deepEqual(effects,['left','right']);
 assert.equal(js.less({[Symbol.toPrimitive](){return '10';}},'2'),true);
 assert.equal(js.negate(5n),-5n);assert.equal(js.shift_left(5n,2n),20n);assert.throws(()=>js.product_word(5n,2n),TypeError);assert.throws(()=>js.signed(5n),TypeError);
 const precise={[Symbol.toPrimitive](hint){assert.equal(hint,'number');return hex;}};assert.equal(js.subtract(precise,Number(BigInt(hex))),0);
 const suppressed=[];assert.throws(()=>js.subtract(Symbol('left'),{valueOf(){suppressed.push('right');return 1;}}),TypeError);assert.deepEqual(suppressed,[]);
});
test('typed Number-only JS emission validates every source node and preserves the accepted optimized JS control bytes',async()=>{
 const source=await readFile('tools/experiments/native-wasm/kernels.eli','utf8')+'\n'+await readFile('tools/backends/batches.eli','utf8');
 const p=backend.compiler.compile_ir_string(source,'direct-batches.eli'),saved=JSON.stringify(p),code=backend.numeric.emit_numeric_javascript(p);
 const retained=JSON.parse(await readFile('tools/backends/results/direct-wasm-macos-arm64.json','utf8'));
 assert.equal(createHash('sha256').update(code).digest('hex'),retained.artifacts.javascriptSha256);assert.equal(JSON.stringify(p),saved);
 for(const expression of['"1"','(js-object)','(string-to-number x)']){
  const bad=backend.compiler.compile_ir_string(`(defun f (x) (if false ${expression} x)) (export f)`,'invalid-numeric-js.eli'),before=JSON.stringify(bad);
  assert.throws(()=>backend.numeric.emit_numeric_javascript(bad),error=>error.eliscriptDiagnostic?.code==='ELI-B0001'&&error.eliscriptDiagnostic.location.file==='invalid-numeric-js.eli');assert.equal(JSON.stringify(bad),before);
 }
});
test('subtracting the Number literal one uses a unary numeric result while preserving exact conversion and errors',async()=>{
 const source='(defun step (x) (1- x)) (defun literal (x) (- x 1)) (export step literal)',code=backend.compiler.compile_string(source,'decrement.eli');
 assert(code.includes('return __eliscript_numeric_decrement(x);'));assert(!code.includes('Math.'));
 const m=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 for(const x of[null,undefined,false,true,-0,NaN,Infinity,Number.MIN_VALUE,.25,'-0','1.25',hex,'invalid'])for(const f of[m.step,m.literal])assert(Object.is(f(x),number(x)-1));
 for(const f of[m.step,m.literal]){let calls=0;assert.equal(f({[Symbol.toPrimitive](hint){assert.equal(hint,'number');calls++;return '2.5';}}),1.5);assert.equal(calls,1);assert.throws(()=>f(5n),TypeError);assert.throws(()=>f({valueOf(){return 5n;}}),TypeError);assert.throws(()=>f(Symbol()),TypeError);}
});

test('generated JS evaluates operands before conversion and preserves native hooks, BigInt and exception priority',async()=>{
 const p=backend.compiler.compile_ir_string('(defun observed (left right) (- (js-call left :operand) (js-call right :operand))) (export observed)','coercion-order.eli');
 const m=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(p)).toString('base64'));
 const effects=[],operand=(label,n)=>({operand(){effects.push('evaluate-'+label);return {valueOf(){effects.push('convert-'+label);return n;}};}});
 assert.equal(m.observed(operand('left',5),operand('right',2)),3);assert.deepEqual(effects,['evaluate-left','evaluate-right','convert-left','convert-right']);
 const hook=function(hint){assert.equal(hint,'number');return 3;};hook.call=()=>{throw Error('observable call property');};
 assert.equal(js.subtract({[Symbol.toPrimitive]:hook},1),2);assert.equal(js.subtract({valueOf(){return {};},toString(){return '2.5';}},1),1.5);
 assert.throws(()=>js.subtract({[Symbol.toPrimitive]:7,valueOf(){throw Error('must not fallback');}},1),TypeError);assert.throws(()=>js.subtract({[Symbol.toPrimitive](){return {};}},1),TypeError);
 assert.equal(js.negate(5n),-5n);assert.equal(js.shift_left(5n,2n),20n);assert.equal(js.less('10',2n),false);assert.equal(js.less('10','2'),true);
 let calls=0;const right={valueOf(){calls++;return 2;}};assert.throws(()=>js.subtract(Symbol(),right),TypeError);assert.equal(calls,0);assert.throws(()=>js.less(Symbol(),right),TypeError);assert.equal(calls,1);
 calls=0;assert.throws(()=>js.product_word({valueOf(){return 5n;}},right),TypeError);assert.equal(calls,0);
});
test('seed and self-hosted primitive operators emit identical JS and ignore constructor parameter shadowing',async()=>{
 const source=await readFile('tests/fixtures/wasm-managed-primitive-operators.eli','utf8')+'\n(defun shadow (Number BigInt Math Symbol Reflect value) (- value 0)) (export shadow)';
 const input=resolve(directory,'seed-input.eli'),output=resolve(directory,'seed-output.mjs');await writeFile(input,source);
 const child=spawnSync(resolve('bin/eliscript-seed'),['--output',output,input],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
 const seed=await readFile(output,'utf8'),p=backend.compiler.compile_ir_string(source,input);assert.equal(backend.compiler.emit_ir_string(p),seed);
 const m=await import('data:text/javascript;base64,'+Buffer.from(seed).toString('base64')),bad=()=>{throw Error('shadowed constructor');};assert.equal(m.shadow(bad,bad,bad,bad,bad,hex),Number(BigInt(hex)));assert.equal(m.subtract(hex,Number(BigInt(hex))),0);
 const executed=spawnSync(process.execPath,['--eval',`import(${JSON.stringify(pathToFileURL(output).href)}).then(m=>{if(m.subtract(${JSON.stringify(hex)},Number(BigInt(${JSON.stringify(hex)})))!==0)throw Error('seed file conversion');})`],{encoding:'utf8',timeout:30000});assert.equal(executed.status,0,executed.stderr);
 const plain=backend.compiler.emit_ir_string(backend.compiler.compile_ir_string('(defun identity (x) (+ x)) (export identity)','identity.eli'));assert(!plain.includes('__eliscript_numeric_sub'));assert(!plain.includes('__eliscript_to_number'));
});
test('closed scalar loops guard Number parameters once and retain complete mixed-input fallback without per-iteration boxing helpers',async()=>{
 const source='(defun closed (n seed) (let ((i 0) (x seed) (total 0)) (while (< i n) (setq x (* (* 3.8 x) (- 1 x))) (setq total (+ total x)) (setq i (1+ i))) total)) (export closed)';
 const code=backend.compiler.compile_string(source,'closed-loop.eli');assert(code.includes('if (typeof n === "number" && typeof seed === "number") {'));
 const fn=code.slice(code.indexOf('\nfunction closed(')),fast=fn.slice(0,fn.indexOf('} else {'));assert(!fast.includes('__eliscript_numeric_'));assert(!fn.includes('=>'));
 const m=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const a=instantiateManagedRuntime(bytes);a.auto(1);
 for(const n of[0,1,3,-0,NaN,-1,2.5,'3'])for(const seed of[-0,NaN,Infinity,.123,'0.123',hex]){assert(Object.is(m.closed(n,seed),expected['scalar-loop'](n,seed)));check(a,'scalar-loop',[n,seed]);}
 assert.throws(()=>m.closed(1,1n),TypeError);
 let random=0x79ac31;const bits=new DataView(new ArrayBuffer(8)),next=()=>{random^=random<<13;random^=random>>>17;random^=random<<5;return random>>>0;};
 for(let sample=0;sample<256;sample++){bits.setUint32(0,next(),true);bits.setUint32(4,next(),true);const seed=bits.getFloat64(0,true),n=sample%4;let x=seed,total=0;for(let i=0;i<n;i++){x=(3.8*x)*(1-x);total+=x;}assert(Object.is(m.closed(n,seed),total));}
 const input=resolve(directory,'closed-loop.eli'),output=resolve(directory,'closed-loop.mjs');await writeFile(input,source);const seeded=spawnSync(resolve('bin/eliscript-seed'),['--output',output,input],{encoding:'utf8',timeout:30000});assert.equal(seeded.status,0,seeded.stderr);assert.equal(await readFile(output,'utf8'),code);
 const bodies=['(progn (while (< n 0) (setq n (1+ n))) (* seed captured))','(let ((x captured)) (while (< n 0) (setq n (1+ n))) (* seed x))','(let ((captured 1) (x captured)) (while (< n 0) (setq n (1+ n))) (* seed x))','(progn (while (< n 0) (setq captured seed)) seed)','(progn (while (< n 0) (js-call seed :valueOf)) seed)'];
 for(const [index,body]of bodies.entries()){
  const rejected=backend.compiler.compile_string('(defvar captured "'+hex+'") (defun open (n seed) '+body+') (export open)','open-loop.eli');assert(!rejected.includes('if (typeof n === "number"'),'free reads, writes and callbacks cannot enter the closed Number profile');
  if(index<3){const rejectedModule=await import('data:text/javascript;base64,'+Buffer.from(rejected).toString('base64'));assert.equal(rejectedModule.open(0,1),Number(BigInt(hex)));}
 }
 const variants='(defun flip (n seed) (let ((i 0) (x seed)) (while (< i n) (setq x (- x)) (setq i (1+ i))) x)) '+
 '(defun sequential (n seed) (let* ((x seed) (y (* x 2))) (while (< n 0) (setq n (1+ n))) y)) '+
 '(defun parallel (n seed) (let ((seed (+ seed 1)) (x seed)) (while (< n 0) (setq n (1+ n))) (+ seed x))) '+
 '(defun choices (n seed) (let ((i 0) (x seed)) (while (< i n) (when (< i 1) (setq x (- x))) (unless (< i 1) (setq x (1- x))) (setq i (1+ i))) x)) '+
 '(export flip sequential parallel choices)';
 const variantCode=backend.compiler.compile_string(variants,'scalar-variants.eli'),v=await import('data:text/javascript;base64,'+Buffer.from(variantCode).toString('base64'));
 for(const seed of[-0,.5,-3,NaN,Infinity]){assert(Object.is(v.flip(3,seed),-seed));assert(Object.is(v.sequential(0,seed),seed*2));assert(Object.is(v.parallel(0,seed),(seed+1)+seed));assert(Object.is(v.choices(3,seed),(-seed-1)-1));}
 assert.equal(v.flip(3,5n),-5n);assert.equal(v.flip('3',5n),-5n);
 await writeFile(input,variants);const variantSeed=spawnSync(resolve('bin/eliscript-seed'),['--output',output,input],{encoding:'utf8',timeout:30000});assert.equal(variantSeed.status,0,variantSeed.stderr);assert.equal(await readFile(output,'utf8'),variantCode);
});
test('typed emission restores its private profile after an actual emitter failure and never contaminates dynamic emission',async()=>{
 const emitter=await import(pathToFileURL(resolve(directory,'bootstrap/emitter.mjs')).href);
 const p=backend.compiler.compile_ir_string('(defun f (a b) (- a b)) (export f)','profile.eli');
 const find=node=>node&&typeof node==='object'?(node.kind==='intrinsic'&&node.value==='-'?node:Object.values(node).map(find).find(Boolean)):undefined;
 const operation=find(p),before=emitter.emit_expression(operation).text;assert(before.includes('__eliscript_numeric_sub'));
 const bad=structuredClone(p);bad.body[0].kind='unsupported-module-node';assert.throws(()=>emitter.emit_module_numeric(bad));assert.equal(emitter.emit_expression(operation).text,before);
 backend.numeric.emit_numeric_javascript(p);assert.equal(emitter.emit_expression(operation).text,before);const m=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(p)).toString('base64'));assert.equal(m.f(hex,Number(BigInt(hex))),0);
});
test('conversion callbacks cannot replace the intrinsics used by later numeric conversion',()=>{
 const saved={Number:globalThis.Number,BigInt:globalThis.BigInt,Symbol:globalThis.Symbol,TypeError:globalThis.TypeError,apply:Reflect.apply,trim:String.prototype.trim,exec:RegExp.prototype.exec,imul:Math.imul};
 let result,failure,calls=0;
 const right={[saved.Symbol.toPrimitive](){calls++;return '2';}};
 const left={valueOf(){globalThis.Number=()=>99;globalThis.BigInt=()=>0n;globalThis.Symbol=()=>{};globalThis.TypeError=()=>{};Reflect.apply=()=>{throw Error('replaced apply');};String.prototype.trim=()=>{throw Error('replaced trim');};RegExp.prototype.exec=()=>{throw Error('replaced exec');};Math.imul=()=>99;return 1;}};
 try{result=js.subtract(left,right);}catch(error){failure=error;}finally{for(const key of['Number','BigInt','Symbol','TypeError'])globalThis[key]=saved[key];Reflect.apply=saved.apply;String.prototype.trim=saved.trim;RegExp.prototype.exec=saved.exec;Math.imul=saved.imul;}
 assert.equal(failure,undefined);assert.equal(result,-1);assert.equal(calls,1);
});
test('radix conversion bounds exact integer parsing after full grammar validation instead of allocating from unbounded prefixes',async()=>{
 const original=globalThis.BigInt;let calls=0,m;
 try{globalThis.BigInt=()=>{calls++;throw Error('integer parser called');};m=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(program)+'\n// bounded-radix-instance\n').toString('base64'));}finally{globalThis.BigInt=original;}
 for(const text of['0x'+'f'.repeat(4096),'0b'+'1'.repeat(4096),'0o'+'7'.repeat(4096)])assert.equal(m.subtract(text,0),Infinity);
 assert(Object.is(m.subtract('0x'+'0'.repeat(10000),0),0));assert(Number.isNaN(m.subtract('0x'+'f'.repeat(4096)+'z',0)));assert.equal(calls,0);
 assert.throws(()=>m.subtract('0xff',0),/integer parser called/);assert.equal(calls,1);
});
test('ordinary primitive method selection does not invoke a user replacement Array iterator',()=>{
 const key=Symbol.iterator,original=Array.prototype[key];let result,failure;
 try{Array.prototype[key]=()=>{throw Error('observable Array iterator');};result=js.subtract({valueOf(){return 5;}},2);}catch(error){failure=error;}finally{Array.prototype[key]=original;}
 assert.equal(failure,undefined);assert.equal(result,3);
});
test('a module binding named globalThis retains lexical references, raw JS and public exports without shadowing numeric intrinsics',async()=>{
 const source='(defvar globalThis 7) (defun value () globalThis) (defun raw () (js* "globalThis")) (defun change (x) (setq globalThis x)) (defun subtract (x y) (- x y)) (defun word (x y) (imul32 x y)) (export globalThis value raw change subtract word)';
 const p=backend.compiler.compile_ir_string(source,'global-root-shadow.eli'),code=backend.compiler.emit_ir_string(p),m=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 assert.equal(m.globalThis,7);assert.equal(m.value(),7);assert.equal(m.raw(),7);assert.equal(m.subtract(hex,Number(BigInt(hex))),0);m.change(8);assert.equal(m.globalThis,8);assert.equal(m.raw(),8);
 assert.equal(m.word(3,5),15);
 const input=resolve(directory,'global-root-shadow.eli'),output=resolve(directory,'global-root-shadow.mjs');await writeFile(input,source);const seed=spawnSync(resolve('bin/eliscript-seed'),['--output',output,input],{encoding:'utf8',timeout:30000});assert.equal(seed.status,0,seed.stderr);assert.equal(await readFile(output,'utf8'),code);
 const node=spawnSync('node',['--input-type=module','-e',`import assert from 'node:assert/strict';const m=await import(${JSON.stringify(pathToFileURL(output).href)});assert.equal(m.value(),7);assert.equal(m.raw(),7);assert.equal(m.subtract(${JSON.stringify(hex)},Number(BigInt(${JSON.stringify(hex)}))),0);m.change(9);assert.equal(m.globalThis,9);assert.equal(m.raw(),9);`],{encoding:'utf8',timeout:30000});assert.equal(node.status,0,node.stderr);
 const bundle=await Bun.build({entrypoints:[output],target:'browser',write:false});assert(bundle.success,bundle.logs.map(String).join('\n'));const bundled=await import('data:text/javascript;base64,'+Buffer.from(await bundle.outputs[0].text()).toString('base64'));assert.equal(bundled.subtract(hex,Number(BigInt(hex))),0);assert.equal(bundled.raw(),7);
});
test('unconvertible objects, invalid lifetimes and real traps preserve caller roots and the earlier error',async()=>{
 const a=instantiateManagedRuntime(bytes),b=instantiateManagedRuntime(bytes),bad=a.sourceObject({toString:false,valueOf:false}),one=a.number(1),foreign=b.string('1'),stale=a.string('2'),caller=a.frame(1);a.frameSet(caller,0,one);a.release(stale);a.collect();
 for(const [name,args,code]of[['add',[bad,one],'ELI-RT0003'],['subtract',[one,bad],'ELI-RT0003'],['signed',[bad],'ELI-RT0003'],['less',[one,bad],'ELI-RT0003'],['add',[foreign,one],'ELI-RT0001'],['add',[stale,one],'ELI-RT0001']]){assert.throws(()=>a.invoke(name,args),e=>e.eliscriptDiagnostic?.code===code);assert.equal(a.stats().frameDepth,1);assert.equal(a.readNumber(one),1);}
 a.leaveFrame(caller);a.release(bad);a.release(one);b.release(foreign);a.collect();b.collect();assert.equal(a.live(),0);
 const source=await readFile('bootstrap/runtime/memory.eli','utf8'),start=source.indexOf('  (defun value-truth (heap value)'),end=source.indexOf('  (defun ',start+3);assert(start>=0&&end>start);
 const rt=backend.compiler.compile_ir_string(source.slice(0,start)+'  (defun value-truth (heap value) (load-u32 4294967295))\n'+source.slice(end),'later-trap.eli');
 const ir=backend.compiler.compile_ir_string('(defun fault (x y) (progn (- x y) (if x 1 2))) (export fault)','primitive-fault.eli'),t=instantiateManagedRuntime(Uint8Array.from(backend.managed.emit_managed_wasm(ir,rt))),object=t.sourceObject({toString:false,valueOf:false}),text=t.string('2'),n=t.number(1),frame=t.frame(1);t.frameSet(frame,0,n);
 assert.throws(()=>t.invoke('fault',[object,n]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.throws(()=>t.invoke('fault',[text,n]),e=>e instanceof WebAssembly.RuntimeError);assert.equal(t.stats().frameDepth,1);assert.equal(t.readString(text),'2');t.leaveFrame(frame);for(const v of[object,text,n])t.release(v);t.collect();assert.equal(t.live(),0);
});
test('raw primitive conversion roots borrowed operands before its first frame allocation and survives growth and capacity failure',()=>{
 const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,call=(name,...args)=>{const out=e[name](...args)>>>0;assert.equal(e['last-error'](),0,name);return out;};
 const heap=call('heap-new',16,1024,65536),retained=call('value-number',heap,0,0x4058c000),frame=call('frame-new',heap,1);call('frame-set',heap,frame,0,retained);
 const text=s=>{const id=call('value-string',heap,s.length);for(let i=0;i<s.length;i++)call('value-unit-set',heap,id,i,s.charCodeAt(i));call('value-seal',heap,id);return id;};
 const left=text('-0'),right=text('2');call('heap-auto',heap,1);const result=call('value-primitive-binary',heap,left,right,2),data=call('value-data',heap,result,4);assert(Object.is(new DataView(e.memory.buffer).getFloat64(data,true),-0));assert.equal(call('frame-depth',heap),1);assert.equal(call('frame-get',heap,frame,0),retained);assert(call('heap-capacity',heap)>1024);assert(call('heap-collections',heap)>0);
 call('frame-pop',heap,frame);call('heap-collect',heap);assert.equal(call('heap-live',heap),0);
 const small=instantiateManagedRuntime(bytes,{maxSlots:32,initialBytes:1024,maxBytes:1024});small.auto(1);const s=small.string('1.5'),n=small.number(-0),caller=small.frame(1);small.frameSet(caller,0,n);
 assert.throws(()=>small.invoke('multiply',[s,n]),x=>x.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(small.stats().frameDepth,1);assert.equal(small.readString(s),'1.5');assert(Object.is(small.readNumber(n),-0));small.leaveFrame(caller);small.release(s);small.release(n);small.collect();assert.equal(small.live(),0);
});
test('Node executes the identical zero-import mixed primitive artifact and generated JS with exact Number and lifetime semantics',async()=>{
 const wasm=resolve(directory,'primitive.wasm'),module=resolve(directory,'primitive.mjs');await writeFile(wasm,bytes);await writeFile(module,backend.compiler.emit_ir_string(program));
 const child=spawnSync('node',['--input-type=module','-e',`
 import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {instantiateManagedRuntime} from ${JSON.stringify(resolve('tools/backends/managed-runtime.mjs'))};import * as js from ${JSON.stringify(module)};
 const a=instantiateManagedRuntime(readFileSync(${JSON.stringify(wasm)}));a.auto(1);const text=a.string('1.5'),two=a.number(2),sum=a.invoke('add',[text,two]);assert.equal(a.readString(sum),'1.52');const product=a.invoke('multiply',[text,two]);assert.equal(a.readNumber(product),3);assert.equal(js.multiply('1.5',2),3);for(const x of[text,two,sum,product])a.release(x);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 `],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
});
