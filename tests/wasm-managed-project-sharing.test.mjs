import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {definition} from '../tools/compiler/controlled-baseline.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';

let directory,backend,guards,literalAliases,legacySnapshots;
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-project-sharing-'));backend=await buildBackends({outputRoot:directory});
 const source=await readFile('bootstrap/backends/managed.eli','utf8');
 const helpers=['managed-fail','word-node','word-constant','word-local','word-set','word-sequence','word-compare','word-if',
  'append-managed','new-managed-local','runtime-call','runtime-arguments','capture-error','managed-guard','finish-managed-bindings',
  'managed-local-backedge-p','managed-local-bank-compatible-p','compact-managed-function-locals'];
 // Compile the exact production helpers; the reference preserves the complete
 // original guard shape before per-state pure-node sharing was introduced.
 const reference=`(defun managed-guard-reference (state expression)
  (word-if
    (word-compare (word-local (get state :error)) (word-constant 0) "=")
    expression
    (word-constant 0)))`;
 const helperSource='(module managed.guard.sharing\n(import '+JSON.stringify(pathToFileURL(resolve(directory,'backends/numeric.mjs')).href)+
  ' backend-fail find-function)\n'+helpers.map(name=>definition(source,name+' ')).join('\n')+'\n'+reference+
  '\n(export managed-guard managed-guard-reference finish-managed-bindings compact-managed-function-locals))';
 guards=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.compile_string(helperSource,'managed-guard-sharing.eli')).toString('base64'));
 // Expose the exact private production entry without replacing any of its
 // dependencies. Its ordinary relative imports resolve to the same backend.
 const loweringSignature='(defun lower-managed-function (function functions runtime)';
 assert.equal(source.split(loweringSignature).length,2);
 const observedSource=source.replace(loweringSignature,'(defun lower-managed-function-under-test (function functions runtime)');
 const aliasSource=observedSource.slice(0,observedSource.lastIndexOf(')'))+`
 (defvar observed-lowering-functions (js-array))
 (defun lower-managed-function (function functions runtime)
   (let* ((nested (not (nil? (get function :outerState nil))))
          (result (lower-managed-function-under-test function functions runtime)))
     (js-call observed-lowering-functions :push (js-object :function function :nested nested)) result))
 (defun take-lowered-functions ()
   (let ((records observed-lowering-functions))
     (setq observed-lowering-functions (js-array)) records))
 (export managed-literal-context managed-literal-json-aliases lower-managed-function take-lowered-functions
   managed-result snapshot-managed clear-managed-temporary-roots))`;
 const aliasPath=resolve(directory,'backends/managed-alias-sharing.mjs');
 await writeFile(aliasPath,backend.compiler.compile_string(aliasSource,'managed-alias-sharing.eli'));
 literalAliases=await import(pathToFileURL(aliasPath).href);
 // Keep the previous snapshot algorithm as an independent lowering reference.
 // All other production helpers, root cleanup and backend dependencies match.
 const oldSnapshot=`(defun snapshot-managed (lowered state)
   (let ((snapshot (managed-result state (get lowered :result) nil)))
     (put snapshot :steps (word-sequence (js-array (get lowered :steps) (get snapshot :steps)))) snapshot))`;
 const legacySource=source.replace(definition(source,'snapshot-managed '),oldSnapshot);
 assert.notEqual(legacySource,source);
 const legacyPath=resolve(directory,'backends/managed-legacy-snapshots.mjs');
 await writeFile(legacyPath,backend.compiler.compile_string(legacySource,'managed-legacy-snapshots.eli'));
 legacySnapshots=await import(pathToFileURL(legacyPath).href);
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});

function nodes(program){
 const result=[],pending=[...program.body];
 while(pending.length){const node=pending.pop();result.push(node);for(const child of node.children)pending.push(child);}
 return result;
}
function freezeGraph(value){
 const seen=new Set(),pending=[value];
 while(pending.length){const current=pending.pop();if(!current||typeof current!=='object'||seen.has(current))continue;
  seen.add(current);for(const child of Object.values(current))pending.push(child);Object.freeze(current);
 }
}

test('snapshot provenance reuses only unchanged same-state private roots and expires after actual RHS root cleanup',()=>{
 const state=()=>({locals:[{name:'heap',index:0,type:'u32'},{name:'frame',index:1,type:'u32'},{name:'error',index:2,type:'u32'}],
  heap:{index:0},frame:{index:1},error:{index:2},roots:0,
  runtime:[{name:'frame-set',index:0},{name:'last-error',index:1},{name:'frame-clear-range',index:2}]});
 const first=state(),expression={kind:'literal',type:'u32',children:[],value:7};
 const stable=literalAliases.managed_result(first,expression,true),localCount=first.locals.length,rootCount=first.roots;
 assert.equal(literalAliases.snapshot_managed(stable,first),stable);
 assert.equal(literalAliases.snapshot_managed(literalAliases.snapshot_managed(stable,first),first),stable);
 assert.equal(first.locals.length,localCount);assert.equal(first.roots,rootCount);
 assert.equal(stable.snapshotRoot.stable,true);
 assert.deepEqual(Object.keys(stable.snapshotRoot.owner),[],'an empty identity token never retains its completed lowering state');
 assert(!Object.values(stable.snapshotRoot).includes(first));
 for(const local of first.locals)assert.deepEqual(Object.keys(local).sort(),local.rootIndex===undefined?['index','name','type']:['index','name','rootIndex','type']);
 assert.deepEqual(Object.keys(stable.result).sort(),['children','kind','type','value']);
 const foreign=state();assert.notEqual(literalAliases.snapshot_managed(stable,foreign),stable,'another state cannot claim a private root');
 const replaced={...stable,result:{...stable.result}};
 assert.notEqual(literalAliases.snapshot_managed(replaced,first),replaced,'rewritten results cannot inherit provenance');
 const wrapped={steps:stable.steps,result:stable.result};
 assert.notEqual(literalAliases.snapshot_managed(wrapped,first),wrapped,'rewrapped control-flow and binding results still snapshot');
 const named={name:'temporary',type:'u32',index:first.locals.length,rootIndex:first.roots++};first.locals.push(named);
 const binding={steps:{kind:'literal',type:'u32',children:[],value:0},result:{kind:'binding-get',type:'u32',children:[],value:named.index}};
 assert.notEqual(literalAliases.snapshot_managed(binding,first),binding,'a source binding named temporary is not private provenance');
 const beforeClear=literalAliases.managed_result(first,expression,false);
 const registration=first.temporaryRoots.length-1;
 literalAliases.clear_managed_temporary_roots(first,registration,registration+1);
 assert.notEqual(literalAliases.snapshot_managed(beforeClear,first),beforeClear,'cleared roots cannot be reused');
 const changed=literalAliases.managed_result(first,expression,false),entry=first.locals[changed.result.value];
 entry.rootIndex++;
 assert.notEqual(literalAliases.snapshot_managed(changed,first),changed,'changed root ownership requires a fresh snapshot');
});

test('private result reuse reduces actual source-body IR growth while binding mutation captures first errors and collecting caller roots retain values',async()=>{
 const runtime=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'snapshot-runtime.eli');
 const measure=(lowerer,count)=>{
  const source='(defun wide () (js-array '+Array.from({length:count},(_,index)=>'(+ '+index+' 1 2 3)').join(' ')+')) (export wide)';
  const program=backend.compiler.compile_ir_string(source,'snapshot-growth.eli'),before=JSON.stringify(program);
  const lowered=lowerer.lower_managed_program(program,runtime);
  const descriptor=lowered.descriptor.functions.find(fn=>fn.name==='wide');assert(descriptor);
  const alias=lowered.typed.aliases.find(entry=>entry.name===(descriptor.wireName??descriptor.name));assert(alias);
  const fn=lowered.typed.functions.find(entry=>entry.name===alias.function);assert(fn);
  const seen=new Set(),pending=[fn.body];let records=0;
  while(pending.length){const node=pending.pop();if(seen.has(node))continue;seen.add(node);records++;
   for(const child of node.children??[])pending.push(child);}
  assert.equal(JSON.stringify(program),before,'source IR remains caller-owned');
  return records;
 };
 // Measure emitted semantic nodes, rather than assuming a helper call or a
 // particular temporary display name proves a smaller generated program.
 const oldSmall=measure(legacySnapshots,8),oldLarge=measure(legacySnapshots,16);
 const small=measure(literalAliases,8),large=measure(literalAliases,16);
 assert(large<oldLarge,'the complete source function has fewer actual typed nodes');
 assert(large-small<oldLarge-oldSmall,'doubling real arithmetic/array operands adds fewer nodes than the previous snapshot algorithm');
 const source=`(defun select (first second third) (js-array first second third))
  (defun mutation (value)
    (let ((temporary value))
      (js-array temporary (setq temporary 9) temporary (select value (setq value 17) value))))
  (defun captures (value)
    (let ((write (lambda (next) (setq value next))) (read (lambda () value)))
      (js-array (funcall read) (funcall write 23) (funcall read))))
  (defun reuse (value) (let ((next (js-array value (+ 1 2)))) (js-array next next)))
  (defun first-error (marker) (select (throw false) (put marker 0 99) 0))
  (export mutation captures reuse first-error)`;
 const program=backend.compiler.compile_ir_string(source,'snapshot-values.eli'),saved=JSON.stringify(program);
 const reference=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(program)).toString('base64'));
 const lowered=literalAliases.lower_managed_program(program,runtime);assert.equal(JSON.stringify(program),saved);
 const seen=new Set(),pending=[lowered.typed,lowered.descriptor];
 while(pending.length){const value=pending.pop();if(!value||typeof value!=='object'||seen.has(value))continue;seen.add(value);
  assert(!Object.hasOwn(value,'snapshotRoot'));assert(!Object.hasOwn(value,'snapshotOwnerToken'));
  for(const child of Object.values(value))pending.push(child);}
 const bytes=Uint8Array.from(backend.wasm.append_metadata_section(backend.wasm.emit_typed_memory_wasm(lowered.typed),
  'eliscript-managed-control',JSON.stringify(lowered.descriptor)));
 assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
 const a=instantiateManagedRuntime(bytes,{maxSlots:1024,initialBytes:65536,maxBytes:16777216});a.auto(1);
 const input=a.number(-0),text=a.string('held'),traceZero=a.number(0),trace=a.sourceArray([traceZero]),caller=a.frame(2);
 a.frameSet(caller,0,input);a.frameSet(caller,1,text);
 const unpack=value=>{
  if(value?.kind===4)return a.readNumber(value);if(value?.kind===5)return a.readString(value);
  if(value?.kind===14)return Array.from({length:a.length(value)},(_,index)=>{const child=a.get(value,index);try{return unpack(child);}finally{a.release(child);}});
  return value;
 };
 try{
  for(let round=0;round<8;round++)for(const [value,expected]of[[input,-0],[text,'held']]){
   for(const name of['mutation','captures','reuse']){const result=a.invoke(name,[value]);
    try{a.collect();assert.deepEqual(unpack(result),reference[name](expected));
     if(name==='reuse'){const left=a.get(result,0),right=a.get(result,1);try{assert(a.keyEqual(left,right));}finally{a.release(left);a.release(right);}}
    }finally{a.release(result);}}
   let threw=false;try{a.invoke('first-error',[trace]);}catch(error){threw=true;assert.equal(error,false);}assert(threw);
   assert.throws(()=>reference.first_error([0]),error=>error===false);
   assert.deepEqual(unpack(trace),[0]);a.collect();assert.equal(a.stats().frameDepth,1);
   assert(Object.is(a.readNumber(input),-0));assert.equal(a.readString(text),'held');
  }
 }finally{a.leaveFrame(caller);a.release(input);a.release(text);a.release(trace);a.release(traceZero);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
},15000);

test('completed nested sibling mutable and transitive captures execute after private parent lowering states are released',async()=>{
 // Reuse the complete original callable fixture rather than substituting
 // modeled closures. Only the private JS wrapper records production returns.
 const fixture=await readFile('tests/fixtures/wasm-managed-callables.eli','utf8');
 const program=backend.compiler.compile_ir_string(fixture,'callables.eli');
 const saved=JSON.stringify(program);
 const runtime=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
 literalAliases.take_lowered_functions();
 const lowered=literalAliases.lower_managed_program(program,runtime);
 const records=literalAliases.take_lowered_functions();
 assert(records.some(record=>record.nested&&record.function.captures.length>0));
 for(const{function:fn}of records){
  assert.equal(fn.outerState,null,'completed function retains no parent state');
  assert.equal(fn.outerScope,null,'completed function retains no parent scope array');
  assert(Array.isArray(fn.locals));assert(Array.isArray(fn.captures));assert(fn.body);
 }
 assert.equal(JSON.stringify(program),saved);
 const reference=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(program)).toString('base64'));
 const bytes=Uint8Array.from(backend.wasm.append_metadata_section(backend.wasm.emit_typed_memory_wasm(lowered.typed),
  'eliscript-managed-control',JSON.stringify(lowered.descriptor)));
 assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
 const a=instantiateManagedRuntime(bytes,{maxSlots:1024,initialBytes:65536,maxBytes:16777216});a.auto(1);
 const retained=[],keep=value=>{retained.push(value);return value;};
 const numeric=(name,args=[])=>{const value=a.invoke(name,args);try{return a.readNumber(value);}finally{a.release(value);}};
 const four=keep(a.number(4)),five=keep(a.number(5)),six=keep(a.number(6)),zero=keep(a.number(-0)),caller=a.frame(1);
 a.frameSet(caller,0,zero);
 try{
  const adder=keep(a.invoke('make-adder',[four]));a.collect();
  assert.equal(numeric('apply-one',[adder,five]),reference.make_adder(4)(5));
  const outer=keep(a.invoke('nested',[four])),inner=keep(a.invoke('apply-one',[outer,five]));a.collect();
  assert.equal(numeric('apply-one',[inner,six]),reference.nested(4)(5)(6));
  const pair=keep(a.invoke('make-pair',[four])),increment=keep(a.get(pair,0)),current=keep(a.get(pair,1)),oracle=reference.make_pair(4);
  for(let index=0;index<16;index++){
   assert.equal(numeric('apply-zero',[increment]),oracle[0]());a.collect();
   assert.equal(numeric('apply-zero',[current]),oracle[1]());
   assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(zero),-0));
  }
  for(const[name,expected]of[['outer-write',reference.outer_write(4)()],['shadow',reference.shadow(4)()],
   ['parallel-capture',reference.parallel_capture(4)()]]){
   const fn=keep(a.invoke(name,[four]));a.collect();assert.equal(numeric('apply-zero',[fn]),expected);
  }
  const sequential=keep(a.invoke('sequential-captures',[four])),expected=reference.sequential_captures(4);
  for(let index=0;index<2;index++){const fn=keep(a.get(sequential,index));a.collect();assert.equal(numeric('apply-zero',[fn]),expected[index]());}
  const recursive=keep(a.invoke('recursive'));a.collect();assert.equal(numeric('apply-one',[recursive,six]),reference.recursive()(6));
  assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(zero),-0));
 }finally{
  a.leaveFrame(caller);for(const value of retained)a.release(value);
  a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 }
 // Successful cleanup does not become a finally action on a failed lower.
 const parent={sentinel:true},scope=[{name:'held'}];
 const invalid={source:backend.compiler.compile_ir_string('(defun invalid (value) value)','bad-capture.eli').body[0],publicArity:99,parameterKinds:['required'],
  outerState:parent,outerScope:scope};
 assert.throws(()=>literalAliases.lower_managed_function(invalid,[],[]),error=>error.eliscriptDiagnostic?.code==='ELI-B0001');
 assert.equal(invalid.outerState,parent);assert.equal(invalid.outerScope,scope);
},15000);

test('persistent literal aliases scan every JSON string domain and numeric prefix without serializing a shared IR graph',()=>{
 const program=backend.compiler.compile_ir_string('(defun run () (js-array :key "$eliscript_persistent_30")) (export run)','alias.eli');
 const adapter=backend.compiler.compile_ir_string('(defun literal-kind (value) value) (export literal-kind)','adapter.eli');
 const shared={source:'$eliscript_persistent_0123 and $eliscript_persistent_1234',
  ['$eliscript_persistent_20-key']:'ordinary',number:-0,missing:undefined};
 const modules=[{id:'entry.mjs',program}],provided=[{id:'stdlib/managed-literals.mjs',program:adapter,
  source:'$eliscript_persistent_4',filename:'$eliscript_persistent_50',shared,again:shared,
  ['$eliscript_persistent_6']:undefined}];
 const text=JSON.stringify(modules)+JSON.stringify(provided);
 let salt=0;while(text.includes('$eliscript_persistent_'+salt))salt++;
 const expected='$eliscript_persistent_'+salt;
 const stringify=JSON.stringify,blocked=new Error('whole IR serialization is forbidden');
 try{
  JSON.stringify=value=>{if(value===modules||value===provided)throw blocked;return stringify(value);};
  // This is the removed production operation, with the same two graph roots.
  assert.throws(()=>JSON.stringify(modules)+JSON.stringify(provided),error=>error===blocked);
  const context=literalAliases.managed_literal_context(modules,{literalModules:provided});
  assert.equal(context.alias,expected);assert.equal(context.prefix,expected+'/');
  assert.equal(context.modules[0],provided[0]);assert.equal(context.adapter,expected+'/stdlib/managed-literals.mjs');
  const found=new Set();literalAliases.managed_literal_json_aliases([modules,provided],found);
  for(let index=0;index<=130;index++)assert.equal(found.has('$eliscript_persistent_'+index),text.includes('$eliscript_persistent_'+index),String(index));
  // Twenty-eight shared binary edges represent over 268 million JSON paths,
  // but only 29 plain records; no expanded character image is necessary.
  let dag={source:'$eliscript_persistent_77'};
  for(let depth=0;depth<28;depth++)dag={left:dag,right:dag};
  JSON.stringify=()=>{throw blocked;};
  const dagAliases=new Set();literalAliases.managed_literal_json_aliases(dag,dagAliases);
  assert.deepEqual([...dagAliases].sort(),['$eliscript_persistent_7','$eliscript_persistent_77']);
 }finally{JSON.stringify=stringify;}
 assert.equal(JSON.stringify(modules)+JSON.stringify(provided),text,'source graphs remain unchanged');
},5000);

test('persistent literal alias compatibility preserves original JSON getters toJSON omissions cycles and validation first errors',()=>{
 const program=backend.compiler.compile_ir_string('(defun run () :key) (export run)','alias-errors.eli');
 const adapter=backend.compiler.compile_ir_string('(defun literal-kind (value) value) (export literal-kind)','adapter.eli');
 const modules=[{id:'entry.mjs',program}];
 const trace=[],shared={get source(){trace.push('shared');return '$eliscript_persistent_'+trace.length;}};
 const provided=[{id:'stdlib/managed-literals.mjs',program:adapter,
  first:shared,second:shared,toJSON(key){trace.push('toJSON:'+key);return{first:this.first,second:this.second,
    ['$eliscript_persistent_8']:undefined,['$eliscript_persistent_9']:()=>0,['$eliscript_persistent_6']:Symbol('omitted')};}}];
 const text=JSON.stringify(provided),expectedTrace=[...trace];trace.length=0;
 const found=new Set();literalAliases.managed_literal_json_aliases(provided,found);
 assert.deepEqual(trace,expectedTrace);
 for(let index=0;index<10;index++)assert.equal(found.has('$eliscript_persistent_'+index),text.includes('$eliscript_persistent_'+index),String(index));
 const context=literalAliases.managed_literal_context(modules,{literalModules:provided});assert.equal(context.alias,'$eliscript_persistent_0');
 const first=new Error('module getter first'),later=new Error('provided getter later');trace.length=0;
 const badModules=[{id:'entry.mjs',program,get source(){trace.push('module');throw first;}}];
 const badProvided=[{id:0,program:adapter,get source(){trace.push('provided');throw later;}}];
 assert.throws(()=>literalAliases.managed_literal_context(badModules,{literalModules:badProvided}),error=>error===first);
 assert.deepEqual(trace,['module']);trace.length=0;
 assert.throws(()=>literalAliases.managed_literal_context(modules,{literalModules:badProvided}),error=>error===later);
 assert.deepEqual(trace,['provided'],'serialization errors still precede invalid provided-record validation');
 const cyclic={};cyclic.self=cyclic;
 assert.throws(()=>literalAliases.managed_literal_json_aliases(cyclic,new Set()),TypeError);
 assert.throws(()=>literalAliases.managed_literal_json_aliases({value:1n},new Set()),TypeError);
 const omitted=new Set();literalAliases.managed_literal_json_aliases({['$eliscript_persistent_0']:undefined},omitted);
 assert.equal(omitted.size,0);
},5000);

test('private guard states share only the pure predicate and zero while changed IEEE indices rebuild independent guards',()=>{
 const word=(kind,value,children=[])=>({kind,type:'u32',children,value});
 const indices=[0,-0,1,NaN,NaN,Infinity,-Infinity,4294967295,0];
 const state={error:{index:0},locals:[],roots:0};let previous;
 for(const[index,errorIndex]of indices.entries()){
  state.error.index=errorIndex;
  const expression=word('literal',[0,-0,NaN,Infinity,-Infinity][index%5]);
  const guard=guards.managed_guard(state,expression),reference=guards.managed_guard_reference(state,expression);
  assert.deepEqual(guard,reference);assert.equal(JSON.stringify(guard),JSON.stringify(reference));
  assert.equal(guard.children[1],expression);assert(Object.is(guard.children[0].children[0].value,errorIndex));
  assert.equal(guard.children[0].children[1],guard.children[2]);
  const nextExpression=word('set',7,[word('literal',index)]),next=guards.managed_guard(state,nextExpression);
  assert.notEqual(next,guard);assert.notEqual(next.children,guard.children);assert.equal(next.children[1],nextExpression);
  assert.equal(next.children[0],guard.children[0]);assert.equal(next.children[2],guard.children[2]);
  if(previous){
   if(Object.is(previous.index,errorIndex))assert.equal(guard.children[0],previous.guard.children[0]);
   else{assert.notEqual(guard.children[0],previous.guard.children[0]);assert.notEqual(guard.children[2],previous.guard.children[2]);}
   assert(Object.is(previous.guard.children[0].children[0].value,previous.index),'later index changes must not rewrite earlier guards');
  }
  const otherState={error:{index:errorIndex},locals:[],roots:0},other=guards.managed_guard(otherState,expression);
  assert.deepEqual(other,reference);assert.notEqual(other.children[0],guard.children[0]);assert.notEqual(other.children[2],guard.children[2]);
  const copiedState={...state,error:{index:errorIndex}},copied=guards.managed_guard(copiedState,expression);
  assert.deepEqual(copied,reference);assert.notEqual(copied.children[0],guard.children[0]);assert.notEqual(copied.children[2],guard.children[2]);
  previous={index:errorIndex,guard};
 }
});

test('binding finalization is idempotent on shared guard leaves and changes only the guarded binding expression',()=>{
 const state={error:{index:0},locals:[],roots:0},entry={index:9,captured:false};
 const binding={kind:'binding-get',type:'u32',children:[],value:null,binding:entry};
 const first=guards.managed_guard(state,binding),second=guards.managed_guard(state,{kind:'literal',type:'u32',children:[],value:7});
 const condition=first.children[0],zero=first.children[2],before=structuredClone(condition);
 for(let iteration=0;iteration<3;iteration++){
  assert.equal(guards.finish_managed_bindings(first,state),first);assert.equal(guards.finish_managed_bindings(second,state),second);
  assert.equal(first.children[0],condition);assert.equal(second.children[0],condition);
  assert.equal(first.children[2],zero);assert.equal(second.children[2],zero);assert.deepEqual(condition,before);
  assert.deepEqual(first.children[1],{kind:'local',type:'u32',children:[],value:9});
 }
 assert.equal(state.locals.length,0);assert.equal(state.roots,0);
 assert.deepEqual(Object.keys(condition).sort(),Object.keys(before).sort());
});

test('shared guard predicates emit identical ordinary and debug bytes and reload changing errors before effects and traps',()=>{
 const word=(kind,value,children=[],extra={})=>({kind,type:'u32',children,value,...extra});
 const literal=value=>word('literal',value),local=index=>word('local',index),set=(index,value)=>word('set',index,[value]);
 const span={filename:'guard-中😀.eli',start:2,end:9,line:1,column:3,endLine:1,endColumn:10};
 const program=guard=>{
  const state={error:{index:0}},trapState={error:{index:0}};
  const first=guard(state,set(1,literal(7))),second=guard(state,set(1,literal(99)));
  const third=guard(state,set(1,word('word-arithmetic','+',[local(1),literal(5)])));
  const trap=guard(trapState,word('memory-op','load-u32',[literal(65536)],{span}));
  const body=word('sequence',null,[first,set(0,literal(1)),second,set(0,literal(0)),third,local(1)]);
  return{input:{abi:'memory-u32',filename:'guard-sharing.eli',functions:[
   {name:'run',index:0,arity:1,locals:[{name:'error',type:'u32',index:0},{name:'result',type:'u32',index:1}],body},
   {name:'trap',index:1,arity:1,locals:[{name:'error',type:'u32',index:0}],body:trap},
  ],exports:['run','trap']},first,second,third,trap};
 };
 const shared=program(guards.managed_guard),reference=program(guards.managed_guard_reference);
 assert.equal(shared.first.children[0],shared.second.children[0]);assert.equal(shared.first.children[0],shared.third.children[0]);
 assert.notEqual(shared.first.children[0],shared.trap.children[0]);
 assert.deepEqual(shared.input,reference.input);const before=structuredClone(shared.input);freezeGraph(shared.input);
 const options={initialPages:1,maximumPages:1};
 const bytes=Uint8Array.from(backend.wasm.emit_typed_memory_wasm(shared.input,options));
 assert.deepEqual(bytes,Uint8Array.from(backend.wasm.emit_typed_memory_wasm(reference.input,options)));
 const debug=backend.wasm.emit_typed_memory_wasm_artifact(shared.input,options);
 const referenceDebug=backend.wasm.emit_typed_memory_wasm_artifact(reference.input,options);
 assert.deepEqual(debug.bytes,referenceDebug.bytes);assert.deepEqual(debug.debug,referenceDebug.debug);
 for(const artifact of[bytes,Uint8Array.from(debug.bytes)]){
  const module=new WebAssembly.Module(artifact);assert.deepEqual(WebAssembly.Module.imports(module),[]);
  const e=new WebAssembly.Instance(module).exports;
  assert.equal(e.run(0),12);assert.equal(e.run(7),5);assert.equal(e.run(0),12);
  assert.equal(e.trap(1),0);assert.throws(()=>e.trap(0),WebAssembly.RuntimeError);assert.equal(e.trap(1),0);
 }
 assert(debug.debug.ranges.some(range=>range.kind==='memory-op'&&range.span?.filename===span.filename));
 assert.deepEqual(shared.input,before);assert.equal(shared.first.children[0],shared.third.children[0]);
});

const word=(kind,value,children=[],type='u32',extra={})=>({kind,type,children,value,...extra});
const literal=(value,type='u32')=>word('literal',value,[],type);
const local=(index,type='u32')=>word('local',index,[],type);
const set=(index,value)=>word('set',index,[value],value.type);
const sequence=(children,type='u32')=>word('sequence',null,children,type);
const add=(left,right)=>word('word-arithmetic','+',[left,right]);
function compactFunction(body,types,arity=0){return{name:'run',index:0,arity,
 locals:types.map((type,index)=>({name:'local-'+index,type,index,rootIndex:100+index})),body};}
function executeTyped(fn,debug=false){
 const input={abi:'memory-u32',filename:'compact-locals.eli',functions:[fn],exports:['run']};
 const options={initialPages:1,maximumPages:1};
 const artifact=debug?backend.wasm.emit_typed_memory_wasm_artifact(input,options):{bytes:backend.wasm.emit_typed_memory_wasm(input,options)};
 const module=new WebAssembly.Module(Uint8Array.from(artifact.bytes));assert.deepEqual(WebAssembly.Module.imports(module),[]);
 return{e:new WebAssembly.Instance(module).exports,artifact};
}

test('exclusive sibling storage resets initial zero while parameters shared DAG nodes metadata and original frame slots remain intact',()=>{
 const shared=local(3),body=sequence([
  sequence([set(1,literal(9)),set(3,local(1))]),
  sequence([set(3,add(shared,local(2))),set(2,literal(4))]),shared,
 ]);
 const fn=compactFunction(body,['u32','u32','u32','u32','u32'],1),original=structuredClone(fn);
 const originalEntries=fn.locals.slice(),metadata=structuredClone(originalEntries);
 const capturedSource={index:19,rootIndex:701};fn.locals[3].source=capturedSource;metadata[3].source=structuredClone(capturedSource);
 assert.equal(guards.compact_managed_function_locals(fn),fn);assert.equal(fn.locals.length,3);
 assert.deepEqual(originalEntries,metadata);assert.equal(fn.locals[1].source,capturedSource);
 assert.equal(fn.locals[1].rootIndex,103);assert.equal(fn.locals[2].rootIndex,101);
 assert.equal(shared.value,1);assert.equal(body.children[1].children.at(-1).children[0].children[0].children[0],shared);
 assert.equal(body.children[0].children[0].kind,'set');assert.equal(body.children[0].children[0].children[0].value,0);
 const {e}=executeTyped(fn),reference=executeTyped(original).e;
 for(const input of[0,1,0xffffffff])assert.equal(e.run(input),reference.run(input));
 assert.equal(e.run(0),9,'a newly reused bank must not inherit the earlier sibling value 9');
 const once=structuredClone(fn);guards.compact_managed_function_locals(fn);assert.deepEqual(fn,once);
 const returning=compactFunction(sequence([sequence([set(1,literal(7)),local(1)]),sequence([set(2,literal(9)),local(2)])]),['u32','u32','u32']);
 const returningReference=structuredClone(returning);guards.compact_managed_function_locals(returning);
 assert.equal(returning.locals.length,1);assert.equal(executeTyped(returning).e.run(),9);
 assert.equal(executeTyped(returningReference).e.run(),9,'reset wrappers keep the final child result rather than appending zero');
});

test('source steps take precedence over a wider literal expansion only when that exact sequence occurs once outside every backedge',()=>{
 const build=()=>{
  const wide=sequence([...Array.from({length:12},()=>literal(0)),set(1,literal(9))]);
  const preferred=sequence([sequence([wide,set(3,local(1))]),sequence([set(3,add(local(3),local(2))),set(2,literal(4))]),local(3)]);
  return{fn:compactFunction(sequence([literal(0),preferred]),Array(4).fill('u32')),preferred};
 };
 const reference=build(),fallback=build(),selected=build();
 guards.compact_managed_function_locals(fallback.fn);assert.equal(fallback.fn.locals.length,3);
 assert.equal(guards.finish_managed_bindings(selected.fn.body,{locals:[],roots:0}),selected.fn.body);
 assert.equal(selected.fn.body.children[1],selected.preferred,'binding finalization preserves the private source-steps identity');
 guards.compact_managed_function_locals(selected.fn,selected.preferred);assert.equal(selected.fn.locals.length,2);
 for(const {fn}of[reference,fallback,selected])assert.equal(executeTyped(fn).e.run(),9);
 const absent=build(),beforeAbsent=structuredClone(absent.fn);
 guards.compact_managed_function_locals(absent.fn,sequence([literal(0),literal(0)]));assert.deepEqual(absent.fn,beforeAbsent);
 const repeated=build();repeated.fn.body=sequence([repeated.preferred,repeated.preferred]);const beforeRepeated=structuredClone(repeated.fn);
 guards.compact_managed_function_locals(repeated.fn,repeated.preferred);assert.deepEqual(repeated.fn,beforeRepeated);
 for(const kind of['while','loop','remainder-while','guarded-while','guarded-counter-while']){
  const nested=build();nested.fn.body=word(kind,null,[literal(0),nested.preferred],'i32');const before=structuredClone(nested.fn);
  guards.compact_managed_function_locals(nested.fn,nested.preferred);assert.deepEqual(nested.fn,before);
 }
});

test('exclusive word and f64 banks remain separate and preserve branch effects signed zero exact NaN memory bits and trap spans',()=>{
 const store=(at,value)=>word('memory-op',value.type==='f64'?'store-f64':'store-u32',[literal(at),value]);
 const trapSpan={filename:'compact-trap-中😀.eli',start:4,end:12,line:2,column:3,endLine:2,endColumn:11};
 const body=sequence([
  sequence([set(1,literal(-0,'f64')),store(0,local(1,'f64'))]),
  sequence([store(8,local(2,'f64'))]),
  sequence([set(3,word('memory-op','load-f64',[literal(32)],'f64')),store(16,local(3,'f64'))]),
  sequence([set(4,literal(7)),word('if',null,[word('word-compare','=',[local(0),literal(0)],'i32'),store(24,local(4)),store(24,literal(11))])]),
  sequence([store(28,local(5)),word('if',null,[word('word-compare','=',[local(0),literal(2)],'i32'),
   word('memory-op','load-u32',[literal(65536)],'u32',{span:trapSpan}),literal(0)])]),literal(0),
 ]);
 const fn=compactFunction(body,['u32','f64','f64','f64','u32','u32'],1),original=structuredClone(fn);
 guards.compact_managed_function_locals(fn);assert.equal(fn.locals.length,3);
 assert.deepEqual(fn.locals.map(entry=>entry.type),['u32','f64','u32']);
 for(const debug of[false,true]){
  const compiled=executeTyped(fn,debug),reference=executeTyped(original,debug);
  for(const {e}of[compiled,reference]){
   const view=new DataView(e.memory.buffer);view.setUint32(32,0x12345678,true);view.setUint32(36,0x7ff80001,true);
   assert.equal(e.run(0),0);assert(Object.is(view.getFloat64(0,true),-0));assert(Object.is(view.getFloat64(8,true),0));
   assert.equal(view.getUint32(16,true),0x12345678);assert.equal(view.getUint32(20,true),0x7ff80001);
   assert.equal(view.getUint32(24,true),7);assert.equal(view.getUint32(28,true),0);
   assert.equal(e.run(1),0);assert.equal(view.getUint32(24,true),11);assert.throws(()=>e.run(2),WebAssembly.RuntimeError);
   assert.equal(e.run(0),0);
  }
  if(debug)assert(compiled.artifact.debug.ranges.some(range=>range.span?.filename===trapSpan.filename&&range.span.start===4&&range.span.end===12));
 }
});

test('one reset before a loop-containing sibling preserves carried state while every backedge ancestor and repeated sequence DAG stays excluded',()=>{
 const loopBody=sequence([set(1,add(local(1),literal(1))),set(2,add(local(2),local(1))),literal(0),literal(0),literal(0)]);
 const loop=word('while',null,[word('word-compare','<',[local(1),literal(3)],'i32'),loopBody],'i32');
 const body=sequence([sequence([loop,set(3,local(2))]),sequence([set(4,literal(9)),set(3,add(local(3),local(5)))]),local(3)]);
 const fn=compactFunction(body,Array(7).fill('u32')),original=structuredClone(fn);
 guards.compact_managed_function_locals(fn);assert.equal(fn.locals.length,3);assert.equal(loopBody.children.length,5);
 assert.equal(executeTyped(fn).e.run(),6);assert.equal(executeTyped(original).e.run(),6);
 for(const kind of['while','loop','remainder-while','guarded-while','guarded-counter-while']){
  const nested=compactFunction(word(kind,null,[literal(0),sequence([set(1,literal(1)),local(1),set(2,literal(2)),local(2),literal(0)])],'i32'),['u32','u32','u32']);
  const before=structuredClone(nested);assert.equal(guards.compact_managed_function_locals(nested),nested);assert.deepEqual(nested,before);
 }
 const repeated=sequence([set(1,literal(1)),local(1),set(2,literal(2)),local(2)]);
 const dag=compactFunction(sequence([repeated,repeated,literal(0)]),['u32','u32','u32']);
 const before=structuredClone(dag);guards.compact_managed_function_locals(dag);assert.deepEqual(dag,before);
 for(const key of['binding','bindings','sources']){
  const hidden=compactFunction(sequence([sequence([set(1,literal(1)),local(1)]),sequence([set(2,literal(2)),local(2)]),literal(0)]),['u32','u32','u32']);
  hidden.body[key]={index:1};const saved=structuredClone(hidden);guards.compact_managed_function_locals(hidden);assert.deepEqual(hidden,saved);
 }
});

test('production managed local compaction keeps exact values live caller GC roots and capacity error cleanup in real WASM',async()=>{
 const runtime=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'compact-real-runtime.eli');
 freezeGraph(runtime);
 const commonSource='(defconst wider-literal (js-array '+Array(64).fill('nil').join(' ')+'))\n'+
  '(defun run (value) (let ((first (js-array value 7))) (get first 0)) (let ((second (js-array value 9))) (get second 0)) value) '+
  '(defun capacity (value) (js-call value :repeat 100000)) (export run capacity)';
 // Only retain the scalar count from this reference lower, not its complete
 // typed graph while the actual module is lowered and emitted below.
 const referenceLocalCount=(()=>{
  const referenceProgram=backend.compiler.compile_ir_string(commonSource,'compact-real-source.eli');
  const reference=backend.managed.lower_managed_program(referenceProgram,runtime);
  const initializer=reference.typed.functions.find(fn=>fn.name==='__eliscript_module_body');
  assert(initializer);return initializer.locals.length;
 })();
 const source=Array.from({length:32},(_,index)=>'(defconst retained-'+index+' '+index+')').join('\n')+'\n'+commonSource;
 const program=backend.compiler.compile_ir_string(source,'compact-real-source.eli');
 const lowered=backend.managed.lower_managed_program(program,runtime);
 const initializer=lowered.typed.functions.find(fn=>fn.name==='__eliscript_module_body');
 assert(initializer);assert.equal(initializer.locals.length,referenceLocalCount,
  '32 independent scalar globals add no local declarations beyond the existing wider-child temporary bank');
 assert(lowered.typed.functions.every(fn=>!Object.hasOwn(fn,'localStorageSequence')),'private source-steps pointers stay out of typed records');
 const bytes=Uint8Array.from(backend.wasm.append_metadata_section(backend.wasm.emit_typed_memory_wasm(lowered.typed),
  'eliscript-managed-control',JSON.stringify(lowered.descriptor)));
 const a=instantiateManagedRuntime(bytes,{maxSlots:256,initialBytes:16384,maxBytes:65536,initializeModule:false});a.auto(1);a.initializeModule();
 const held=a.number(-0),text=a.string('held'),caller=a.frame(2);a.frameSet(caller,0,held);a.frameSet(caller,1,text);
 try{
  for(let round=0;round<16;round++)for(const input of[held,text]){
   const result=a.invoke('run',[input]);try{assert(a.keyEqual(result,input));}finally{a.release(result);}
   a.collect();assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));assert.equal(a.readString(text),'held');
  }
  assert.throws(()=>a.invoke('capacity',[text]),error=>error.eliscriptDiagnostic?.code==='ELI-RT0002');
  a.collect();assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));assert.equal(a.readString(text),'held');
  const recovered=a.invoke('run',[held]);try{assert(Object.is(a.readNumber(recovered),-0));}finally{a.release(recovered);}
 }finally{a.leaveFrame(caller);a.release(held);a.release(text);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
},120000);

test('linking frozen wide literal graphs shares unchanged source leaves and retains exact executable values and function source',async()=>{
 const source='(defun sample () (js-array -0.0 "中😀\\ud800" '+Array.from({length:4096},(_,index)=>index).join(' ')+')) (export sample)';
 const program=backend.compiler.compile_ir_string(source,'sharing-中.eli');
 const originalLeaves=nodes(program).filter(node=>node.kind==='literal'),identities=new Set(originalLeaves);
 const javascript=backend.compiler.emit_ir_string(program);
 const reference=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));
 const oracle=spawnSync('node',['--input-type=module','-e',
  "let source='';for await(const chunk of process.stdin)source+=chunk;const m=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));process.stdout.write(JSON.stringify(m.sample.toString()));"],
  {input:javascript,encoding:'utf8',timeout:30000});
 assert.equal(oracle.error,undefined);assert.equal(oracle.status,0,oracle.stderr);
 freezeGraph(program);
 const modules=[{id:'main.mjs',program}],first=backend.managed.link_managed_project(modules,'main.mjs');
 const linkedLeaves=nodes(first.program).filter(node=>node.kind==='literal');
 assert.equal(linkedLeaves.length,originalLeaves.length);
 assert(linkedLeaves.every(node=>identities.has(node)),'unchanged literal records must not form another complete graph generation');
 assert.deepEqual(backend.managed.link_managed_project(modules,'main.mjs'),first);
 const declaration=first.program.body.find(node=>node.kind==='function-declaration');
 assert.equal(declaration.managedOriginal,program.body[0]);
 assert.equal(declaration.managedSourceText,JSON.parse(oracle.stdout));
 const linkedJS=backend.compiler.emit_ir_string(first.program);
 const executable=await import('data:text/javascript;base64,'+Buffer.from(linkedJS).toString('base64'));
 assert.deepEqual(executable[first.exports[0].internalName](),reference.sample());
 assert(Object.is(executable[first.exports[0].internalName]()[0],-0));
});

test('private persistent implementation imports retain the real dependency graph while unchanged literal records share their supplied source identity',async()=>{
 const {literalModules}=await backend.loadLiteralModules();
 const user=backend.compiler.compile_ir_string('(defun sample () [7 "中😀\\ud800"]) (export sample)','sharing-persistent.eli');
 const originalLeaves=new Set();for(const module of literalModules)for(const node of nodes(module.program))if(node.kind==='literal')originalLeaves.add(node);
 for(const module of literalModules)freezeGraph(module.program);freezeGraph(user);
 const options={literalModules},input=[{id:'main.mjs',program:user}],linked=backend.managed.link_managed_project(input,'main.mjs',options);
 assert(linked.privateModules.length>0);assert(linked.privateModules.some(id=>id.endsWith('/stdlib/managed-literals.mjs')));
 const leaves=nodes(linked.program).filter(node=>node.kind==='literal');
 assert(leaves.some(node=>originalLeaves.has(node)),'private import relocation must not deep-copy unchanged implementation data');
 assert.equal(linked.exports[0].name,'sample');
 const declaration=linked.program.body.find(node=>node.kind==='function-declaration'&&node.sourceFunctionName==='sample');
 assert(declaration);assert.equal(declaration.managedOriginal,user.body[0]);
 assert(declaration.managedSourceText.includes('function sample()'));
 assert.deepEqual(backend.managed.link_managed_project(input,'main.mjs',options),linked);
 // Both textual identities and actual normalized lexical names must keep the
 // generated import out of the way of user parameters and local bindings.
 const collision=backend.compiler.compile_ir_string(
  '(defun sample ($eliscript-persistent-1) (let (($eliscript_persistent_0 "held")) [7 $eliscript_persistent_0 $eliscript-persistent-1])) (export sample)',
  'persistent-alias-collision.eli');
 collision.body[0].properties['quoted"\\\n$eliscript_persistent_2']='identity';freezeGraph(collision);
 const salted=backend.managed.link_managed_project([{id:'main.mjs',program:collision}],'main.mjs',options);
 assert(salted.privateModules.length>0);
 assert(salted.privateModules.every(id=>id.startsWith('$eliscript_persistent_3/')));
 assert.equal(salted.exports[0].name,'sample');
 const originalNames=nodes(collision).filter(node=>['parameter-binding','lexical-binding'].includes(node.kind)).map(node=>node.value);
 assert(originalNames.includes('$eliscript-persistent-1'));assert(originalNames.includes('$eliscript_persistent_0'));
 for(const name of['__eliscript_persistent_0','__eliscript-persistent-0']){
  assert.throws(()=>backend.compiler.compile_string(`(defun ${name} () 1) (export ${name})`,'reserved-user.eli'),/reserved compiler prefix/);
 }
 const invalid=structuredClone(user);invalid.body[0].value='__eliscript_persistent_0';
 invalid.body.at(-1).children[0].value='__eliscript_persistent_0';freezeGraph(invalid);
 assert.throws(()=>backend.managed.link_managed_project([{id:'main.mjs',program:invalid}],'main.mjs',options),error=>{
  const message='binding name uses reserved compiler prefix: __eliscript_persistent_0';
  assert.equal(error.message,message);
  assert.deepEqual(error.eliscriptDiagnostic,{format:'eliscript-diagnostic',version:1,code:'ELI-B0001',severity:'error',
   phase:'managed-backend',message,location:{file:'sharing-persistent.eli',
    start:{line:invalid.body[0].span.line,column:invalid.body[0].span.column}}});
  return true;
 });
},120000);

test('frozen top-level literal expressions receive private project roots while literal data remains unchanged',()=>{
 const program=backend.compiler.compile_ir_string('7 (defun sample () 9) (export sample)','top-level-literal.eli');
 const expression=program.body[0];assert.equal(expression.kind,'expression-statement');
 const literal=expression.children[0];assert.equal(literal.kind,'literal');freezeGraph(program);
 const linked=backend.managed.link_managed_project([{id:'main.mjs',program}],'main.mjs');
 const root=linked.program.body.find(node=>node.kind==='expression-statement');
 assert(root);assert.notEqual(root,expression);assert.equal(root.projectModule,'main.mjs');
 assert.equal(root.children[0],literal);assert.equal(literal.value,7);
 assert(!Object.hasOwn(expression,'projectModule'));assert(!Object.hasOwn(literal,'projectModule'));
 assert(!Object.hasOwn(expression,'projectPrepare'));assert(!Object.hasOwn(literal,'projectPrepare'));
 // The existing independent source prepass rejects raw literal declarations
 // before project wiring. Preserve that first Error rather than inventing a
 // backend diagnostic or writing project metadata onto a frozen node.
 const raw={filename:'raw-top-level-literal.eli',body:[literal]};freezeGraph(raw);
 assert.throws(()=>backend.managed.link_managed_project([{id:'main.mjs',program:raw}],'main.mjs'),
  error=>error instanceof Error&&error.message==='IR node is not valid at module top level: literal'&&error.eliscriptDiagnostic===undefined);
 assert(!Object.hasOwn(literal,'projectModule'));assert(!Object.hasOwn(literal,'projectPrepare'));
});
