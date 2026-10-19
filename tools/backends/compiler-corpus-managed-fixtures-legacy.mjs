import {posix} from 'node:path';
import {loadCompilerSources} from './compiler-build.mjs';

// Public fixture observations and the complete original suite replay serve
// separate roles. The latter retains the original raw heap/descriptor/trap
// assertions and runs them with the actual selected compiler namespaces.
// Every observation calls the selected product's real exported functions. The
// comparison product is independently emitted by the original Seed oracle.
const prelude = `import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT;
const product=process.argv[2], entry=process.argv[3];
const reference=process.env.ELISCRIPT_ORIGINAL_REFERENCE_PRODUCT_ROOT;
if(!root||!reference)throw new Error('original fixture execution requires its independent Seed product');
const m=await import(pathToFileURL(resolve(product,entry)).href);
const oracle=await import(pathToFileURL(resolve(reference,entry)).href);
let runtime;
if(process.env.ELISCRIPT_ORIGINAL_TARGET!=='javascript'){
 const configuration=process.env.ELISCRIPT_ORIGINAL_PROGRAM_CONTEXT;
 if(!configuration)throw new Error('selected binary fixture requires its real runtime context');
 const {readCompilerMetadata}=await import(pathToFileURL(resolve(root,'tools/backends/compiler-metadata.mjs')).href);
 const input=await readCompilerMetadata(configuration);
 const {openOriginalProgramContext}=await import(pathToFileURL(resolve(root,'tools/backends/compiler-corpus-host-context.mjs')).href);
 runtime=(await openOriginalProgramContext(input,{identity:configuration})).runtime;
 runtime.auto(__ELISCRIPT_ORIGINAL_AUTO__);
}
let observations=0;
function compare(label,observe){
 const expected=observe(oracle),actual=observe(m);
 assert.deepEqual(actual,expected,label);observations++;
 if(runtime){runtime.collect();assert.equal(runtime.stats().frameDepth,0,label+' restores private frames');}
}
function outcome(action){try{return{value:action()};}catch(error){return{error:{name:error?.name}};}}
function named(module,name,...args){return module[name.replaceAll('-','_')](...args);}
function finish(){
 assert(observations>0,'a fixture must execute assertions, not merely compile');
 if(runtime){runtime.closeModule();runtime.collect();assert.equal(runtime.live(),0);assert.equal(runtime.stats().frameDepth,0);}
 console.log(JSON.stringify({observations}));
}
`;

const arithmetic = `
const numbers=[0,-0,1,-1,NaN,Infinity,-Infinity,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,2**53,1e16,.1,-.25];
for(const x of numbers){
 for(const name of['negate','reciprocal','increment','decrement','unary-add','unary-multiply'])compare(name,mod=>named(mod,name,x));
 for(const y of numbers)for(const name of['add','subtract','multiply','divide','equal','distinct','not-equal','less','less-equal','greater','greater-equal','snapshot'])compare(name,mod=>named(mod,name,x,y));
}
for(const name of['zero','one'])compare(name,mod=>named(mod,name));
for(const x of[undefined,null,false,true,'',' ','x','-0','0x10','中\\ud800'])for(const name of['increment','decrement'])compare(name,mod=>named(mod,name,x));
const triples=[[1,1e16,-1e16],[1e16,-1e16,1],[Number.MAX_VALUE,2,.5],[-0,0,-0],[NaN,1,2],[1,NaN,2],[1,1,2],[1,2,1],[3,2,1],[0,1,1],[Infinity,-Infinity,Number.MIN_VALUE]];
for(const inputs of triples)for(const name of['ordered-sum','ordered-product','ordered-subtract','ordered-divide','equal-three','distinct-three','less-three','compare-snapshot'])compare(name,mod=>named(mod,name,...inputs));
for(const pair of[[2,1],[NaN,NaN]])compare('comparison effects',mod=>mod.comparison_effects(...pair));
const values=[null,false,true,undefined,...numbers,'','x','中😀\\ud800'];
for(const left of values)for(const right of values)for(const name of['equal','identical','distinct','not-equal'])compare(name,mod=>named(mod,name,left,right));
for(const [a,b]of[[{},{}],[[],[]],[{},[]]])for(const name of['equal','identical','distinct'])compare('opaque '+name,mod=>[named(mod,name,a,a),named(mod,name,a,b)]);
const strings=['','a','aa','\\0','中','😀','\\ud800','\\udfff','\\ud800x'];
for(const left of strings)for(const right of strings)for(const name of['less','less-equal','greater','greater-equal'])compare(name,mod=>named(mod,name,left,right));
for(const name of['sum-to','recursive-sum'])for(const n of[0,1,8,32])compare(name,mod=>named(mod,name,n));
for(let i=0;i<100;i++)compare('repeated numeric loop',mod=>mod.sum_to(32));
let state=0x6239c71;const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;},view=new DataView(new ArrayBuffer(8));
const random=()=>{view.setUint32(0,next(),true);view.setUint32(4,next(),true);return view.getFloat64(0,true);};
for(let i=0;i<512;i++){const pair=[random(),random()];for(const name of['add','subtract','multiply','divide','equal','distinct','less','less-equal','greater','greater-equal'])compare(name,mod=>named(mod,name,...pair));}
`;

const word = `
const numbers=[0,-0,1,-1,.1,-.1,3.5,-3.5,NaN,Infinity,-Infinity,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE,2**31-1,2**31,2**32-1,2**32+1,-(2**32)-1,2**52+1,2**53-1,2**53+2,2**83,2**84];
for(const x of numbers){for(const name of['signed','unsigned','invert'])compare(name,mod=>named(mod,name,x));for(const y of numbers)for(const name of['remainder','modulo','mask','union','exclusive','shift-left','shift-right','logical-right','multiply','snapshot','remainder-snapshot'])compare(name,mod=>named(mod,name,x,y));}
for(const pair of[[1,.1],[1e16,3],[Number.MAX_VALUE,3],[Number.MAX_VALUE,Number.MIN_VALUE],[Number.MIN_VALUE*3,Number.MIN_VALUE*2],[1,Number.MIN_VALUE*3],[-4,2],[-0,3],[3,-0],[1,Infinity],[Infinity,1]])compare('subnormal remainder',mod=>mod.remainder(...pair));
for(const triple of[[17,5,2],[-17,5,2],[Number.MAX_VALUE,3,.1],[NaN,1,2],[17,0,2]])compare('remainder-many',mod=>mod.remainder_many(...triple));
for(let e=-1074;e<=1023;e++)for(const x of[2**e,-(2**e)])for(const name of['signed','unsigned','invert'])compare(name,mod=>named(mod,name,x));
for(let e=0;e<85;e++)for(const x of[2**e+1,2**e+.5,-(2**e+1),-(2**e+.5)])for(const name of['signed','unsigned'])compare(name,mod=>named(mod,name,x));
for(const x of[-1,-2,2**31,2**32-1,0x7fffffff,0x80000001,0xfffffffd])for(const count of[-65,-33,-32,-31,-1,0,1,20,31,32,33,63,64,65,2**32+1,NaN,Infinity])for(const name of['shift-left','shift-right','logical-right'])compare(name,mod=>named(mod,name,x,count));
for(const pair of[[0xffffffff,0xffffffff],[0xffffffff,0xfffffffd],[0x80000001,0x80000001],[0x7fffffff,0x7fffffff]])compare('multiply',mod=>mod.multiply(...pair));
let state=0x4e69537;const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;},bits=new DataView(new ArrayBuffer(8));
const random=()=>{bits.setUint32(0,next(),true);bits.setUint32(4,next(),true);return bits.getFloat64(0,true);};
for(let i=0;i<2048;i++){const x=random(),y=random();for(const name of['remainder','signed','unsigned','mask','exclusive','multiply','logical-right'])compare(name,mod=>named(mod,name,...(name==='signed'||name==='unsigned'?[x]:[x,y])));const pair=[next(),next()];compare('integer imul',mod=>mod.multiply(...pair));}
for(const seed of[0,-0,NaN,Infinity,Number.MAX_VALUE,0x80000001])compare('loop-mix',mod=>mod.loop_mix(128,seed));
for(let x=0;x<64;x++)for(let y=1;y<32;y++)for(const sign of[1,-1])compare('exhaustive subnormal remainder',mod=>mod.remainder(sign*x*Number.MIN_VALUE,y*Number.MIN_VALUE));
`;

const callbacks = `
const methods=[['map','map'],['filter','filter'],['for-each','forEach'],['some','some'],['every','every'],['find','find'],['find-index','findIndex'],['find-last','findLast'],['find-last-index','findLastIndex']];
const sparse=[];sparse.length=6;sparse[1]=false;sparse[3]=3;sparse[5]=undefined;
for(const values of[[0,-0,NaN,'',null,undefined,false,Number.MIN_VALUE,'中😀',true,Infinity],sparse])for(const[name,method]of methods)compare(name,mod=>named(mod,name+'-with',values.slice(),mod.identity()));
for(const[name]of methods)compare('arguments '+name,mod=>{const values=[false,true,false],log=[];named(mod,name+'-with',values,mod.collect_arguments(log));return log.map(args=>[args[0],args[1],args[2]===values,args.length]);});
for(const values of[[],[undefined],[1],[1,2,3],[-0],[-0,Number.MIN_VALUE,Infinity],Array(5)])for(const[name]of[['reduce'],['reduce-right']])compare(name,mod=>[outcome(()=>named(mod,name+'-with',values.slice(),mod.sum_callback())),named(mod,name==='reduce'?'reduce-initial':'reduce-right-initial',values.slice(),mod.sum_callback(),-0)]);
for(const name of['reduce-initial','reduce-right-initial'])compare(name,mod=>{const values=[1,2,3],log=[];const out=named(mod,name,values,mod.ordered_callback(log),0);return[out,log.map(row=>[row[0],row[1],row[2]===values])];});
for(const[name]of methods)compare('live '+name,mod=>{const values=[1,2,3,4];const out=named(mod,name+'-with',values,mod.mutation_callback(values));return[out,values];});
compare('capture order',mod=>{const values=[1,2],other=[8],marker=[false];const out=mod.evaluation_order(values,other,marker);return[out,marker];});
for(const receiver of[null,undefined])compare('nullish lookup',mod=>{const marker=[false];return[outcome(()=>mod.nullish_order(receiver,marker)),marker];});
compare('own captured method',mod=>mod.map_shadow([1,2],mod.shadow_value()));
compare('replaced builtin',mod=>{const values=[1,2],first=mod.map_replaced(values,mod.identity());return[first,outcome(()=>mod.map_with(values,mod.identity()))];});
compare('reentrant map',mod=>mod.map_recursive([0,1,2,-0,Number.MIN_VALUE]));
for(const[name]of[...methods,['reduce'],['reduce-right']])for(const bad of[null,undefined,false,true])compare('invalid '+name,mod=>outcome(()=>named(mod,name+'-with',[],bad)));
compare('first error',mod=>{const marker=[false];return[outcome(()=>mod.first_error([1,2],marker)),marker];});
compare('stable sort',mod=>mod.sort_stable());
for(const values of[[3,1,2],[-0,NaN,1],['b','a'],[undefined,,3,1]])for(const name of['sort-default','sort-copy','sort-nan-ties'])compare(name,mod=>{const items=values.slice(),out=named(mod,name,items);return[out,out===items,items,Object.keys(out)];});
for(const reverse of[false,true])compare('numeric sort',mod=>mod.sort_numeric([3,1,2],reverse));
compare('sort copy mutation',mod=>{const items=[3,1,2];return[mod.sort_copy_mutation(items),items];});
compare('concat shared children',mod=>mod.concat_summary());
compare('concat one level',mod=>{const nested=[7],items=[,undefined,nested],out=mod.concat_copy(items,items);assert.equal(out[2],out[5]);nested[0]=9;return[out,Object.keys(out),out===items];});
`;

const arrays = `
for(const values of[[undefined,null,false],[true,-0,NaN],['中😀',Number.MIN_VALUE,Infinity]])compare('array construction',mod=>{const out=mod.make(...values);return[out,mod.size(out),mod.nth_value(1,out),mod.at(out,2),mod.get_value(out,'missing',7)];});
compare('array identity and copy',mod=>{const a=mod.empty();assert.equal(mod.write(a,1,undefined),undefined);mod.write(a,3,'last');const b=mod.copy(a);assert.notEqual(a,b);return[a,b,mod.keys(a),mod.keys(b),mod.has(a,0),mod.has(a,1),mod.has(a,'length')];});
for(const[start,end]of[['1','5'],['0x2','Infinity'],['-2',undefined],['not-number','4'],[true,false],[null,'3.5'],['0xbcf8f9bdba22840724d028768a8a77b3e6b0f283670085477910eccc4e9d6b278a11db79c280d4e9c237774812029ac7ce82daaafca38',undefined]])compare('primitive slice',mod=>{const out=mod.interval([true,,undefined,false,,true],start,end);return[out,Object.keys(out)];});
compare('mutations',mod=>{const a=[];const out=[mod.append(a,1,2),mod.append_none(a),mod.remove_last(a),mod.truncate(a,5)];out.push(a.slice(),mod.keys(a));return out;});
compare('self cycle',mod=>{const out=mod.nested(1,2);assert.equal(out[0],out);return[out[1],out.length];});
compare('operand order',mod=>{const a=[1,2,3],b=[8],marker=[false];return[mod.key_order(a),mod.fallback_order(a),mod.append_order(a,b),a,b,mod.pop_extra(a,marker),marker,mod.slice_extra(a,0,2,marker),mod.write_order(a,b),a[0]===b];});
for(const n of[0,1,8,32,128])compare('grow loop',mod=>mod.grow_loop(n));
for(const receiver of[null,undefined])compare('nullish write',mod=>{const marker=[false];return[outcome(()=>mod.null_write(receiver,marker)),marker];});
compare('named properties and assoc',mod=>{const a=[];for(const key of['tag','2','01','1','__proto__'])mod.write(a,key,key==='__proto__'?null:key);const b=mod.assoc(a,'other',7);return[mod.keys(a),mod.keys(b),mod.at(a,'tag'),mod.has(a,'other'),mod.at(b,'other')];});
for(const name of['append-shadow','pop-shadow','slice-shadow'])compare(name,mod=>{const a=[1,2],marker=[false];a[name.split('-')[0]==='append'?'push':name.split('-')[0]]=false;return[outcome(()=>named(mod,name,a,marker)),marker];});
compare('captured push',mod=>{const a=[];return[mod.append_replace(a),a,a.push];});
`;

const construction = `
compare('canonical constructors',mod=>[mod.identities(),mod.empty_of(),mod.exercise()]);
const sparse=[];sparse.length=4;sparse[1]=undefined;sparse[3]=false;
for(const values of[[],sparse,'A😀\\ud800Z',new Set(['a','b']),new Map([[1,'a'],[2,'b']]),{length:2.9,0:'x'},[8,9].values()])compare('Array.from',mod=>{const input=typeof values?.next==='function'?[8,9].values():values;return[mod.from(input),mod.of(undefined,false,null),mod.direct(typeof values?.next==='function'?[8,9].values():values),mod.member(typeof values?.next==='function'?[8,9].values():values)];});
compare('mapper',mod=>mod.map([4,5],mod.mapper()));
for(const values of[undefined,null,false,1])compare('from rejection or arraylike',mod=>outcome(()=>mod.from(values)));
for(const mapper of[null,false,true,1,{}])compare('mapper validation',mod=>outcome(()=>mod.from([],mapper)));
compare('collection iterator',mod=>{const set=mod.collection([1,2,2],false),map=mod.collection([[1,'a'],[2,'b']],true);return[mod.from(mod.iterator(set)),mod.from(map),mod.own(mod.of(undefined),0)];});
`;

const search = `
const values=[0,-0,NaN,'中😀',false,null,undefined,0];const sparse=Array(5);sparse[1]=undefined;sparse[3]=NaN;
const starts=[undefined,null,false,true,NaN,Infinity,-Infinity,-0,0,.9,-.9,1.9,-1.9,4,5,9,-9,2**31,-(2**31),2**32,-(2**32),2**53,-(2**53),Number.MIN_VALUE,-Number.MIN_VALUE,'2','-2','x'];
for(const items of[[],values,sparse])for(const needle of[undefined,null,false,NaN,0,-0,'中😀','missing'])for(const start of starts)for(const name of['includes','index','last'])compare(name,mod=>named(mod,name,items,needle,start));
for(const items of[[],values,sparse])for(const name of['missing-includes','missing-index','missing-last'])compare(name,mod=>named(mod,name,items));
for(const items of[[],values,sparse])for(const needle of values)compare('default last',mod=>mod.default_last(items,needle));
let seed=0x831ac519;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0,pool=[undefined,null,false,true,NaN,-0,0,Number.MIN_VALUE,'','中😀','\\ud800',-3,2];
for(let k=0;k<128;k++){const values=Array.from({length:next()%32},()=>pool[next()%pool.length]);for(let i=0;i<values.length;i++)if(next()%4===0)delete values[i];for(let t=0;t<8;t++){const needle=pool[next()%pool.length],start=(next()%100-50)/3;for(const name of['includes','index','last'])compare('seeded '+name,mod=>named(mod,name,values,needle,start));}}
`;

const properties = `
compare('identities and integer order',mod=>[mod.identities(),mod.exercise()]);
for(const source of[{},[1,,undefined],'😀',false,1,Symbol('key'),null,undefined])compare('keys/hasOwn',mod=>[outcome(()=>mod.keys(source)),outcome(()=>mod.direct_keys(source)),...['0','1','length','missing','__proto__'].map(key=>[outcome(()=>mod.own(source,key)),outcome(()=>mod.direct_own(source,key))])]);
for(const factory of[()=>({2:'two',1:'one',z:3}),()=>[1,,undefined],()=>new Map([[1,2]]),()=>new Set([1]),()=>[1,2].values()])compare('assign own properties',mod=>{const source=factory();source.tag=7;const target={first:0};assert.equal(mod.assign(target,null,source,undefined,'😀'),target);return[mod.keys(target),target.tag,target[0],target[1],mod.member(target,'first')];});
compare('assign effects and partial mutation',mod=>{const trace=[],source={get a(){trace.push('a');return 1;},get b(){trace.push('b');throw 'marker';}},target={};let error;try{mod.direct_assign(target,source);}catch(value){error=value;}return[target,trace,error];});
compare('own property key hook',mod=>{const trace=[],key={[Symbol.toPrimitive](hint){trace.push(hint);return 'x';}};return[mod.own({x:1},key),trace];});
compare('frozen target',mod=>outcome(()=>mod.assign(Object.freeze({x:1}),{x:2})));
compare('own proto assignment',mod=>{const source=Object.create(null);source.__proto__={inherited:7};const target={};mod.assign(target,source);return[Object.getPrototypeOf(target).inherited,Object.hasOwn(target,'__proto__')];});
`;

const emptyBindings = `
for(const value of[undefined,null,false,true,-0,NaN,Infinity,Number.MIN_VALUE,'中😀\\ud800'])for(const name of['parallel-value','sequential-value','capture-value'])compare(name,mod=>named(mod,name,value));
compare('nil default',mod=>mod.default_value());
for(const n of[0,1,8,32])compare('binding loop',mod=>mod.loop_value(n));
compare('escaped cells',mod=>{const a=mod.escape_value(),b=mod.escape_value();return[a(null),a(-0),a(null),b(null),a(NaN),a(null),b(7),b(null)];});
compare('initializer effects',mod=>{const trace={};return[mod.effect_value(trace),trace];});
`;

const control = `
const values=[null,false,true,undefined,0,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,42.5,'','中😀\\ud800',{},[]];
for(const value of values)for(const name of['identity','truth','invert','once','optional-result','unless-result','recurse'])compare(name,mod=>named(mod,name,value));
for(const a of values)for(const b of values)for(const name of['both','either','parallel','sequential','effects','clauses','call-choose'])compare(name,mod=>named(mod,name,a,b));
for(const condition of values)compare('choose',mod=>mod.choose(condition,-0,'no'));
for(const name of['unicode','negative-zero','finite-number','undefined-result','empty-and','empty-or'])compare(name,mod=>named(mod,name));
`;

const variadic = `
for(const args of[[],[undefined],[null],[false],[1],[1,undefined],[1,null,2,false,undefined],[-0,NaN,Infinity,-Infinity,Number.MIN_VALUE]])for(const name of['mixed','optional-one','pack'])compare(name,mod=>named(mod,name,...args));
compare('source and rest identity',mod=>[mod.source_calls(),mod.fresh_rest(),mod.call_none(mod.mixed_value()),mod.call_three(mod.mixed_value(),1,undefined,2)]);
compare('shared capture',mod=>{const fn=mod.make_capture(1,2);return[undefined,null,2,false].map(value=>mod.call_capture(fn,value,1));});
compare('rest snapshots',mod=>{const items=[1];return[mod.rest_snapshots(items),items];});
compare('callee capture',mod=>mod.apply_callee_order([]));
for(const input of[()=>Array(4),()=>'A😀\\ud800Z',()=>new Set([1,2]),()=>new Map([[1,2]]),()=>[1,2].values()])compare('spread iterable',mod=>mod.apply_values(mod.pack_value(),input()));
for(const value of[null,undefined,false,true,1,{}])compare('spread failure',mod=>outcome(()=>mod.apply_values(mod.pack_value(),value)));
compare('partially consumed iterator',mod=>{const iterator=mod.values_iterator([1,2]);assert.equal(mod.iterator_done(iterator),false);const out=mod.apply_values(mod.pack_value(),iterator);assert.equal(mod.iterator_done(iterator),true);return out;});
compare('noncallable consumes iterable',mod=>{const iterator=mod.values_iterator([1,2]);const out=outcome(()=>mod.apply_values(false,iterator));return[out,mod.iterator_done(iterator)];});
compare('earlier spread failure',mod=>{const marker=[false];return[outcome(()=>mod.first_error(false,marker)),marker];});
`;

const exceptions = `
for(const value of[undefined,null,false,true,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,'中😀\\ud800',{},[]])compare('source throw identity',mod=>{assert.equal(mod.caught(value),value);assert.equal(mod.indirect(value),value);assert.equal(mod.across(24,value),value);assert.equal(mod.call_handler(mod.handler_closure(value)),value);const trace=[];assert.equal(mod.normal(value,trace),value);const nested=[];assert.equal(mod.nested(value,nested),value);const shadow=mod.shadow(value);assert.equal(shadow[0],value);return[trace,nested,shadow[1]];});
compare('finally replacement',mod=>{const first={},second={},trace=[];let out;try{mod.replaced(first,second,trace);}catch(error){assert.equal(error,second);out=true;}assert.equal(trace[0],first);return[out,trace.slice(1),mod.handler_throw(first,second)===second];});
for(let kind=0;kind<4;kind++)for(const message of[undefined,'','中😀\\ud800'])compare('Error constructors',mod=>{const marker={},error=mod.make_error(kind,message,{cause:marker});assert.equal(error.cause,marker);return[mod.error_summary(error),Object.keys(error),error instanceof [Error,TypeError,RangeError,SyntaxError][kind]];});
`;

const catchBindings = `
for(const value of[[],[1],[1,2,3,4,5],'A😀\\ud800Z',new Set([1,2,3,4])])compare('iterator destructuring',mod=>mod.array(value));
for(const value of[{}, {left:undefined,right:null}, {left:false,right:3}])compare('object defaults',mod=>[mod.object(value),mod.captured(value),mod.tdz(value)]);
for(const value of[null,undefined,false,7,{}])compare('invalid iterator',mod=>mod.invalid(value));
compare('protocol failure',mod=>mod.protocol());
`;

const symbols = `
compare('symbol identities and protocols',mod=>[mod.identities(),mod.exercise()]);
for(const args of[[],[undefined],[null],[''],['中😀\\ud800'],[7]])compare('unique symbols',mod=>{const a=mod.create(...args),b=mod.create(...args);return[mod.equal(a,a),mod.equal(a,b),mod.description(a),mod.label(a),mod.text(a),mod.key(a)];});
for(const name of['','shared','中😀\\ud800'])compare('registered symbols',mod=>{const a=mod.registered(name),b=mod.registered(name);return[mod.equal(a,b),mod.key(a),mod.description(a)];});
compare('well known symbols',mod=>[mod.iterator()===Symbol.iterator,mod.primitive()===Symbol.toPrimitive]);
compare('symbol property identity',mod=>{const key=mod.create('x'),a={},b={};mod.write(a,key,7);mod.assign(b,a);assert.equal(mod.symbols(b)[0],key);return[mod.own(a,key),mod.member(b,key),mod.keys(a),mod.json(a)];});
`;

const collections = `
for(const source of[[],[[1,'a'],[2,'b'],[1,'changed']]])compare('Map constructor and iterators',mod=>{const map=mod.from_map(source),alias=mod.set_value(map,3,'c');assert.equal(alias,map);return[mod.size(map),mod.lookup(map,1),mod.has(map,3),Array.from(mod.entries(map)),Array.from(mod.keys(map)),Array.from(mod.values(map)),mod.lookup_none(map)];});
for(const source of[[],[1,2,2,NaN,-0,0],'A😀'])compare('Set constructor and iterators',mod=>{const set=mod.from_set(source);assert.equal(mod.add_value(set,7),set);return[mod.size(set),mod.has(set,7),Array.from(mod.entries(set)),Array.from(mod.keys(set)),Array.from(mod.values(set)),mod.delete_value(set,7),mod.delete_value(set,7),mod.clear(set),mod.size(set)];});
for(const set of[false,true])for(let mode=0;mode<4;mode++)compare('live forEach mutation',mod=>mod.for_each_mutate(set,mode));
for(const set of[false,true])compare('forEach capture and reentry',mod=>{const items=set?mod.from_set([1,2]):mod.from_map([[1,'a'],[2,'b']]),trace=[false],log=[];mod.visit(items,log);const reentrant=mod.for_each_reentrant(items);const captured=mod.for_each_builtin_capture(items,[],trace);return[log,reentrant,captured,trace];});
for(const set of[false,true])compare('own methods and effects',mod=>{const items=set?mod.empty_set():mod.empty_map(),trace=[false];const result=mod.for_each_own_capture(items,trace);return[result,trace];});
for(const set of[false,true])for(const bad of[null,undefined,false,true])compare('empty callback validation',mod=>outcome(()=>mod.for_each_with(set?mod.empty_set():mod.empty_map(),bad)));
for(const count of[0,1,8,32,128])for(const name of['map-loop','set-loop'])compare(name,mod=>Array.from(named(mod,name,count)));
compare('collection own properties',mod=>{const map=mod.raw_map(),set=mod.raw_set();mod.write(map,'tag',7);mod.write(set,'tag',9);return[mod.own(map,'tag'),mod.own(map,'size'),mod.own_keys(map),mod.read_value(map,'tag'),mod.read_value(set,'tag'),mod.assoc(map,'other',11)];});
`;

const objects = `
compare('ordinary construction',mod=>[mod.make(-0,NaN),mod.duplicate(1,2),mod.computed('😀',7),mod.empty()]);
compare('own order and prototypes',mod=>{const parent={inherited:7},object=mod.inherit(parent,9);assert.equal(mod.proto(object),parent);const nullProto=mod.null_proto();assert.equal(Object.getPrototypeOf(nullProto),null);const data=mod.proto_data(7);return[mod.read_value(object,'inherited'),mod.has(object,'inherited'),mod.keys(object),mod.has(data,'__proto__'),mod.read_value(data,'__proto__')];});
compare('copy and exact getters',mod=>{const object=mod.make(undefined,null),copy=mod.assoc(object,'extra',7);return[object,copy,mod.nth_value('x',object),mod.default_value(object,'absent',-0),mod.default_order(object,'x'),mod.size(object)];});
compare('object evaluation order',mod=>{const object={old:1},key='tag',copy=mod.assoc_order(object,key),other={};assert.equal(mod.write_order(object,other),other);assert.equal(object.saved,other);return[copy,object.old,mod.read_value(copy,key)];});
compare('cycle and mutation',mod=>{const object=mod.self_cycle(-0);assert.equal(object.self,object);assert.equal(mod.write(object,'tag',7),7);return[object.v,mod.keys(object),mod.has(object,'tag')];});
for(const count of[0,1,8,32,128])compare('object growth',mod=>{const object=mod.grow_loop(count);return[Object.keys(object),Object.values(object)];});
for(const object of[null,undefined])compare('member first error',mod=>outcome(()=>mod.fault(object,'x')));
`;

const moduleBindings = `
compare('initializers and live exports',mod=>{assert(Object.is(mod.negative_zero,-0));assert.equal(mod.state.self,mod.state);assert.equal(mod.read_state(),mod.state);assert.equal(mod.identity_value(),mod.identity);const out=[mod.initialization_log.slice(),mod.first,mod.second,mod.counter,mod.unset,mod.missing];for(let i=0;i<8;i++)out.push(mod.tick());mod.write_counter(9);out.push(mod.counter,mod.read_counter(),mod.local_counter(3),mod.emitted_alias(99));const closure=mod.captured_global();out.push(closure(2),closure(3),mod.read_counter());for(let i=0;i<96;i++)mod.allocate();assert.equal(mod.read_state(),mod.state);out.push(mod.state.values.slice(),mod.state.label);return out;});
compare('dynamic export reassignment',mod=>{const first=mod.current,initial=mod.call_current(-0,NaN,true);mod.set_current(mod.identity);assert.equal(mod.current,mod.identity);assert.notEqual(mod.current,first);return[initial,mod.call_current(-0)];});
`;

const project = `
compare('linked defaults namespaces and live bindings',mod=>{assert.equal(mod.api.history,mod.history);assert.equal(mod.api.identity,mod.identity);assert.equal(mod.initial.self,mod.initial);const initial=[mod.counter,mod.current(),mod.read(),mod.history.slice(),mod.order.slice(),mod.alias(99)];for(const delta of[4,-0,-1,2]){mod.increment(delta);assert.equal(mod.counter,mod.current());}const snapshot=mod.snapshot();assert.equal(snapshot.extra,7);assert.equal(snapshot.history,mod.history);const names=mod.names();const denied=outcome(()=>mod.forbidden());return[initial,mod.counter,mod.history.slice(),names,denied.error?.name,mod.initial.values,mod.initial.label];});
`;

const builtin = `
const values=[undefined,null,false,true,0,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,Number.MAX_VALUE,'',' ','12','-0','x','中😀\\ud800',[],{},[1]];
for(const input of values)for(const name of['number-call','string-call','boolean-call','finite-call','nan-call','integer-call','safe-call','array-call','coercive-finite','coercive-nan','math-round-call','math-floor-call','math-ceil-call','math-trunc-call'])compare(name,mod=>named(mod,name,input));
for(const name of['number-empty','string-empty','boolean-empty','same-number','same-finite','math-empty','same-round','object-same-empty','same-object-is','freeze-empty','frozen-empty','same-freeze'])compare(name,mod=>named(mod,name));
for(const input of values)compare('apply and held builtins',mod=>[mod.number_apply([input]),mod.invoke_one(mod.held_number(),input)]);
compare('extra argument effects',mod=>{const trace={};return[mod.number_extra('12',trace),trace];});
compare('callback firstclass',mod=>[mod.number_map(['1','2','x']),mod.finite_map([1,NaN,'2'])]);
for(const left of values)for(const right of values)compare('Object.is exact',mod=>[mod.object_same(left,right),mod.object_same_alias(left,right)]);
for(const primitive of[undefined,null,false,1,'x'])compare('primitive integrity',mod=>[mod.freeze_call(primitive),mod.frozen_call(primitive)]);
compare('frozen source object',mod=>{const object={tag:1};assert.equal(mod.freeze_alias(object),object);return[mod.frozen_call(object),outcome(()=>mod.integrity_write(object)).error?.name];});
`;

const typeofFixture = `
const values=[undefined,null,false,true,0,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,Number.MAX_VALUE,'','中😀\\ud800',{},[],()=>1];
for(const value of values)compare('typeof and captured member',mod=>[mod.type_value(value),mod.type_underscore(value),mod.type_member({item:value}),mod.type_deep({child:{item:value}}),mod.type_shadow(value),mod.invoke(mod.capture(value))]);
for(const value of values)compare('existing predicates and imported paths',mod=>[mod.type_intrinsic(value),mod.is_nil(value),mod.is_undefined(value),mod.is_null(value),mod.is_nullish(value),mod.type_index([{item:value}]),mod.type_index_key([{'a.b':value}]),mod.invoke(mod.capture_index([{item:value}]))]);
for(const value of[undefined,null,false,-0,NaN,'中😀\\ud800'])compare('module typeof writes',mod=>[mod.write_global(value),mod.type_global()]);
compare('missing member',mod=>mod.type_member({}));
for(const value of[null,undefined])compare('member error',mod=>outcome(()=>mod.type_member(value)).error?.name);
let state=0x294f61d7;const next=()=>state=(Math.imul(state,1664525)+1013904223)>>>0,bits=new DataView(new ArrayBuffer(8));
for(let i=0;i<1024;i++){bits.setUint32(0,next());bits.setUint32(4,next());const value=bits.getFloat64(0);compare('IEEE type identity',mod=>[mod.type_value(value),Object.is(mod.make_box(value).item,value)]);}
`;

const regexp = `
for(const value of['0','-0','+1','.5','1.','1.e2','1e-2','+1e','0x10','x','','1\\n',null,true,65,NaN,Infinity])compare('numeric regexp',mod=>mod.numeric(value));
for(const value of['','a','aa','bc','abc','ab','1','a\\nb','a\\nb\\nc','wordx','words','\\0','😀','\\ud800','zzab12'])for(const name of['groups','nullable','unicode'])compare(name,mod=>{const match=named(mod,name,value);return match===null?null:{values:Array.from(match),index:mod.meta(match,'index'),input:mod.meta(match,'input'),groups:mod.meta(match,'groups'),keys:mod.keys(match)};});
for(const text of['b','a\\nb','ab','b\\n','a\\nb\\nc'])compare('multiline',mod=>mod.line(text));
compare('regexp call capture',mod=>{const trace={};return[mod.capture('12',trace),trace];});
`;

const replacement = `
for(const text of['','a','aa','aba','中😀a\\ud800','a b  ','a\\t'])for(const search of['','a','b','中','😀',undefined,null,false,1])for(const replacement of['','$&',"$\x60","$'",'$$','$1','$01','$12',undefined,null,false,-0])compare('replace',mod=>mod.replace_value(text,search,replacement));
for(const text of['','a','b','ab','xaba','中😀a'])for(const template of['$1/$2','$01/$02','$12','$99','$&',"$\x60/$'",'$$'])compare('captured replacement',mod=>mod.replace_captures(text,template));
for(const text of['','x','x ','x\\t','x \\t','中😀\\ud800  '])compare('regexp replacement callback',mod=>[mod.trim_comment(text),mod.replace_callback(text)]);
`;

const arrayText = `
const shared=[1,null,'中😀\\ud800'];
for(const values of[[],Array(4),[null,undefined,false,true,-0,.5,NaN,Infinity,-Infinity,Number.MIN_VALUE,'中😀\\ud800'],[shared,shared]])for(const separator of[undefined,null,false,-0,.5,'',',','😀\\ud800'])compare('join primitives and holes',mod=>mod.join_value(values,separator));
for(const value of[undefined,null,false,-0,NaN,Number.MIN_VALUE,'中😀\\ud800'])for(const factory of['custom-value','fallback-value'])compare('join conversion hooks',mod=>{const trace={},out=mod.default_value([named(mod,factory,trace,value)]);return[out,trace];});
compare('separator length snapshot',mod=>{const items=['x'],trace={};return[mod.join_value(items,mod.growing_separator(items,trace)),items,trace];});
compare('empty separator conversion',mod=>{const items=[],trace={};return[mod.join_value(items,mod.growing_separator(items,trace)),items,trace];});
compare('live values',mod=>{const items=[null,'old'];items[0]=mod.live_element(items);return[mod.join_value(items,'|'),items[1]];});
compare('shrinking values',mod=>{const items=[null,null,null];items[0]=mod.shrinking_element(items);return[mod.join_value(items,'|'),items.length];});
compare('custom result identity',mod=>{const value={},trace={},items=[];assert.equal(mod.text_order(items,value,trace),value);assert.equal(mod.text_value(mod.own_join(items,value)),value);return trace;});
compare('reentrant cycle recovery',mod=>{const items=[null],trace={};items[0]=mod.reentrant_element(items,trace);const error=outcome(()=>mod.default_value(items));items.length=0;return[error.error?.name,mod.default_value(items)];});
compare('selected cyclic join error',mod=>{const items=[1];items.push(items,3);let caught;try{mod.join_value(items,':');}catch(error){assert.equal(error.eliscriptDiagnostic?.code,'ELI-RT0009');caught=error.name;}return caught;});
compare('ignored arguments',mod=>{const trace={};return[mod.extra_value([1,2],':',trace),trace];});
`;

const functionProperties = `
for(let mode=0;mode<6;mode++)for(const key of reflectionKeys)compare('function own reflection',mod=>mod.reflection_snapshot(mode,key));
for(let mode=0;mode<6;mode++)compare('function key lists and prototype',mod=>mod.reflection_shape(mode));
for(let mode=0;mode<3;mode++)compare('function accessor lookup and callee order',mod=>mod.reflection_effects(mode));
for(let iteration=0;iteration<4;iteration++)compare('canonical functions and call effects',mod=>[mod.cached(),mod.call_number('12'),mod.call_string(2),mod.call_finite(2),mod.static_finite(2),mod.call_symbol(),mod.call_error(),mod.effects()]);
`;

const strings = `
const texts=['','x','a\\0b','中😀\\ud800x\\udfff','ababa','\\ud83d\\ude00','\\ud83dx\\ude00'];
const positions=[null,false,true,undefined,NaN,Infinity,-Infinity,0,-0,.5,-.5,1,-1,3.5,-3.5,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE,2**32-1,2**32];
for(const text of texts){
 for(const name of['size','identity','value','trim','trim-start','trim-end','well-formed','repair','scan','concat-empty','char-empty','at-empty','slice-empty','substring-empty','substr-empty','find-empty','repeat-empty'])compare(name,mod=>named(mod,name,text));
 for(const key of[0,-0,1,2,99,-1,.5,NaN,Infinity,'0','1','01','','length'])for(const name of['read-value','default-value'])compare(name,mod=>name==='default-value'?mod.default_value(text,key,'fallback'):mod.read_value(text,key));
 for(const key of['0','1','length'])compare('nth-value',mod=>mod.nth_value(key,text));
 for(const position of positions)for(const name of['at','char-at','char-code','code-point'])compare(name,mod=>named(mod,name,text,position));
 for(const start of positions)for(const end of positions)for(const name of['slice','substring','substr'])compare(name,mod=>named(mod,name,text,start,end));
 for(const search of['','x','a','aba','\\0','😀','\\ud800',null,false,true,undefined,0,-0,-1,NaN,Infinity,-Infinity])for(const position of positions)for(const name of['find','last','includes','starts','ends'])compare(name,mod=>named(mod,name,text,search,position));
 for(const count of[null,false,true,undefined,NaN,-0,-.5,0,.5,1,3.5])compare('repeat',mod=>mod.repeat(text,count));
 for(const value of[null,false,true,undefined,0,-0,2**32-1,-1,NaN,Infinity,-Infinity,'中😀'])compare('variadic concat',mod=>mod.concat(text,value,'!',value));
 compare('ignored string arguments',mod=>{const trace={};return[mod.ignored(text,trace),trace,mod.ignored_identity(text,{})];});
 compare('constructor and receiver capture',mod=>[mod.capture(text,1,'xy'),mod.concat_capture(text,1,2),mod.default_order(text,0)]);
}
for(const values of[[0,65,65535],[-0,55296,56320],[128512,128513,65],[NaN,Infinity,-Infinity],['65',null,true]]){
 compare('fromCharCode',mod=>mod.from_units(...values));compare('fromCodePoint',mod=>outcome(()=>mod.from_points(...values)));
}
for(const value of[-1,-0,0,65,55296,65535,65536,128512,1114111,1114112,1.5,NaN,Infinity])compare('single character constructors',mod=>[mod.from_unit(value),mod.global_unit(value),outcome(()=>mod.from_point(value)),outcome(()=>mod.global_point(value)),mod.constructor_capture(value)]);
compare('empty character constructors',mod=>[mod.empty_units(),mod.empty_points()]);
compare('constructor effects',mod=>{const trace={};return[mod.constructor_effects(65,trace),trace];});
compare('format split callback',mod=>[mod.format_symbol('HELLO-WORLD',255),mod.split_fields('a,b; c d'),mod.replace_callback('a中a')]);
let seed=0x84fbd9a;const next=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;},bits=new DataView(new ArrayBuffer(8));
for(let i=0;i<1024;i++){const units=Array.from({length:next()%64},()=>next()%65536),text=String.fromCharCode(...units),needle=i%3?text.slice(next()%(text.length+1),next()%(text.length+1)):String.fromCharCode(next()%65536);bits.setUint32(0,next(),true);bits.setUint32(4,next(),true);const position=bits.getFloat64(0,true);for(const name of['at','char-at','char-code','code-point'])compare('seeded '+name,mod=>named(mod,name,text,position));for(const name of['find','last','includes','starts','ends'])compare('seeded '+name,mod=>named(mod,name,text,needle,position));for(const name of['slice','substring','substr']){const end=(next()%65)-32;compare('seeded '+name,mod=>named(mod,name,text,position,end));}for(const name of['well-formed','repair'])compare('seeded '+name,mod=>named(mod,name,text));}
`;

const callables = `
compare('escaping nested recursive closures',mod=>[mod.make_adder(4)(5),mod.nested(4)(5)(6),mod.recursive()(24),mod.outer_write(4)(),mod.shadow(4)()]);
compare('shared sibling cells',mod=>{const pair=mod.make_pair(4),values=[];for(let i=0;i<32;i++){values.push(pair[0](),pair[1]());}assert.equal(mod.from_slot(pair),37);return[values,mod.capture_each(4).map(fn=>fn()),mod.named_same(),mod.fresh_same(),mod.repeated_same()];});
compare('function identity',mod=>{assert.equal(mod.named_value(),mod.named_value());assert.notEqual(mod.fresh_function(),mod.fresh_function());return[mod.apply_one(mod.named_value(),4),mod.from_slot(mod.make_pair(4)),mod.callee_order()];});
compare('callee and argument order',mod=>{const marker=[false];const out=outcome(()=>mod.invoke_order(false,marker));return[out.error?.name,marker,mod.apply_extra(mod.named_value(),marker),marker.slice()];});
compare('parallel and sequential captures',mod=>{const functions=mod.sequential_captures(4);return[mod.parallel_capture(4)(),functions.map(fn=>fn()),mod.hygienic_capture(1,2,3,4,5)(),mod.captured_arguments(4)];});
compare('twelve arguments and discarded extras',mod=>{const marker=[false];return[mod.many(1,2,3,4,5,6,7,8,9,10,11,12),mod.many_extra(mod.many_value(),marker),marker,mod.many_extra(mod.many_lambda(),marker)];});
compare('funcall exact values',mod=>{const marker=[false];return[mod.funcall_one(mod.named_value(),-0),mod.funcall_order(mod.ordered_values,marker),marker];});
`;

const jsCons = `
for(const tail of[null,undefined,[],[undefined,,false],'A😀\\ud800Z',new Set([1,2]),new Map([[1,2]]),false,true,1,{}])compare('js-cons spread',mod=>[mod.safe('head',tail),mod.raw_nullish(tail)]);
for(let mode=0;mode<3;mode++)compare('js-cons operand effects',mod=>mod.effects(mode));
for(let mode=0;mode<8;mode++)compare('js-cons protocol',mod=>mod.protocol(mode));
compare('js-cons own dense indices',mod=>{const out=mod.prepend('head',[,undefined]);return[out,mod.own(out,'0'),mod.own(out,'1'),mod.own(out,'2'),mod.recover()];});
`;

const persistentVector = `
for(const count of[0,1,31,32,33,63,64,65,1023,1024,1025,1056,1057])compare('full persistent Vector boundaries '+count,mod=>mod.vector_case(count));
`;

function section(source,start,end){
  const first=source.indexOf(start),last=source.indexOf(end,first+start.length);
  if(first<0||last<0)throw new TypeError('original managed fixture source boundary changed: '+start);
  return source.slice(first,last);
}
// Read the cooked value without importing or evaluating the original suite.
// Bindings are exact, explicitly transported source expressions, not JS code.
export function readOriginalManagedStaticTemplate(source,name,bindings=new Map()){
  if(!/^[$A-Z_a-z][$\w]*$/.test(name))throw new TypeError('invalid original managed template name');
  const declaration=new RegExp('\\bconst\\s+'+name.replaceAll('$','\\$')+'\\s*=\\s*`').exec(source);
  const failure=message=>new TypeError('original managed template '+name+': '+message);
  if(!declaration)throw failure('declaration changed');
  let at=declaration.index+declaration[0].length,value='';
  while(at<source.length){
    const unit=source[at++];
    if(unit==='`'){
      while(at<source.length&&/\s/.test(source[at]))at++;
      if(source[at]!==';')throw failure('closing template must end its declaration');
      return value;
    }
    if(unit==='$'&&source[at]==='{'){
      at++;let matched=false;
      for(const[expression,replacement]of bindings){
        if(typeof expression!=='string'||typeof replacement!=='string')throw failure('invalid explicit interpolation');
        if(source.startsWith(expression+'}',at)){
          value+=replacement;at+=expression.length+1;matched=true;break;
        }
      }
      if(!matched)throw failure('unbound interpolation');
      continue;
    }
    // Template raw CR/CRLF is cooked as LF, including unescaped source text.
    if(unit==='\r'){if(source[at]==='\n')at++;value+='\n';continue;}
    if(unit!=='\\'){value+=unit;continue;}
    if(at===source.length)throw failure('unterminated escape');
    const escape=source[at++];
    if(escape==='\n'||escape==='\u2028'||escape==='\u2029')continue;
    if(escape==='\r'){if(source[at]==='\n')at++;continue;}
    if(/[0-9]/.test(escape)){
      if(escape!=='0'||/[0-9]/.test(source[at]??''))throw failure('invalid decimal escape');
      value+='\0';continue;
    }
    if(escape==='x'||escape==='u'){
      if(escape==='u'&&source[at]==='{'){
        const end=source.indexOf('}',++at),hex=end<0?'':source.slice(at,end);
        if(!/^[0-9a-fA-F]+$/.test(hex))throw failure('invalid Unicode escape');
        const point=parseInt(hex,16);
        if(point>0x10ffff)throw failure('invalid Unicode code point');
        value+=String.fromCodePoint(point);at=end+1;continue;
      }
      const count=escape==='x'?2:4,hex=source.slice(at,at+count);
      if(!new RegExp('^[0-9a-fA-F]{'+count+'}$').test(hex))throw failure('invalid hexadecimal escape');
      value+=String.fromCharCode(parseInt(hex,16));at+=count;continue;
    }
    const simple={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v'};
    // NonEscapeCharacter (including escaped $, quotes and backticks) retains
    // its UTF16 unit. In particular, \${ is static text, not interpolation.
    value+=Object.hasOwn(simple,escape)?simple[escape]:escape;
  }
  throw failure('unterminated template');
}

function reflectionTemplateBindings(source){
  const declaration=/\bconst\s+wellKnownSymbolNames\s*=\s*\[([^\]]*)\]\s*;/.exec(source);
  if(!declaration)throw new TypeError('original managed reflection symbol declaration changed');
  const entries=declaration[1].trim().split(',').map(entry=>entry.trim());
  if(!entries.length||entries.some(entry=>!/^'[A-Za-z]+'$/.test(entry)))
    throw new TypeError('original managed reflection symbols must be static names');
  const names=entries.map(entry=>entry.slice(1,-1));
  const expression='wellKnownSymbolNames.map(name=>`(js* "Symbol.${name}")`).join(\' \')';
  return new Map([[expression,names.map(name=>'(js* "Symbol.'+name+'")').join(' ')]]);
}

function mathBody(source){
  // The binary16/precise-sum models and every seeded sample count come from
  // the actual original suite, not from the target implementation.
  return section(source,'const unaryNames =','beforeAll(')+
    section(source,'function adjacent(','function checkPressure(')+`
for(const name of['namespace-summary','namespace-tag-description','lexical-shadow','namespace-mutation','namespace-extension','namespace-constant-errors'])compare(name,mod=>named(mod,name));
for(const key of constants)compare('Math constants',mod=>mod.constant_description(key));
for(const key of[...Object.keys(methodLengths),'f16round','sumPrecise'])compare('Math methods',mod=>mod.method_description(key));
for(const dynamic of[false,true])for(const abrupt of[false,true])compare('Math callee capture',mod=>mod.callee_order(dynamic,abrupt));
for(const abrupt of[false,true])compare('Math computed key order',mod=>mod.key_order(abrupt));
for(const name of unaryNames)for(const input of primitives)compare(name,mod=>[named(mod,'direct-'+name,input),mod.math_invoke(name,input)]);
for(let bit=0;bit<32;bit++)for(const input of[2**bit,2**bit-1,2**bit+1,-(2**bit)])compare('clz32 bit boundary',mod=>mod.direct_clz32(input));
const pairs=[[0,-0],[NaN,7],[Infinity,-Infinity],[-1,5],[0xffffffff,5],[0x80000000,2],[0x7fffffff,0x7fffffff],[0xffffffff,0xffffffff],[2**53-1,-(2**32)-1],['0xffffffff','-1'],[undefined,true],[null,'3']];
let state=0x1c7a6e39;const next=()=>state=(Math.imul(state,1664525)+1013904223)>>>0;
for(let index=0;index<64;index++)pairs.push([next(),next()]);
for(const[left,right]of pairs)compare('Math imul',mod=>[mod.direct_imul(left,right),mod.math_invoke('imul',left,right)]);
for(const name of[...unaryNames,'imul','f16round']){
 for(const args of[[],[undefined],[null],[-0,99,'ignored']])compare(name+' arity',mod=>mod.math_invoke(name,...args));
 for(const call of['conversion-order','conversion-hint','primitive-rejections'])compare(call,mod=>named(mod,call,name));
 for(let mode=0;mode<3;mode++)compare('conversion abrupt',mod=>mod.conversion_abrupt(name,mode));
}
for(const name of['min','max']){
 compare('extreme conversion order',mod=>mod.extreme_order(name));
 for(const args of[[],[-0],[0,-0],[-0,0],[NaN,4],[4,NaN],[undefined],[1,9,-7,2]])compare(name,mod=>mod.math_invoke(name,...args));
}
for(const input of[...froundBoundaries(),...froundRandom()])compare('fround exact samples',mod=>[mod.direct_fround(input),mod.math_invoke('fround',input),mod.invoke_held(mod.namespace_get('fround'),input)]);
for(const input of[...f16Boundaries(),...froundRandom().slice(0,48),...primitives]){
 const expected=f16Model(input);assert(Object.is(m.direct_f16round(input),expected));assert(Object.is(m.math_invoke('f16round',input),expected));
 assert(Object.is(m.invoke_held(m.namespace_get('f16round'),input),expected));observations++;
}
for(const values of sumSamples()){
 const expected=sumPreciseModel(values);assert(Object.is(m.sum_direct(values),expected));assert(Object.is(m.sum_dynamic(values),expected));
 assert(Object.is(m.invoke_held(m.namespace_get('sumPrecise'),values),expected));observations++;
}
for(let mode=0;mode<=29;mode++){assert.deepEqual(m.sum_iterator_case(mode),sumIteratorObservation(mode));observations++;if(runtime){runtime.collect();assert.equal(runtime.stats().frameDepth,0);}}
compare('sum argument order',mod=>mod.sum_extra_order());compare('sum arraylike rejection',mod=>mod.sum_array_like_rejection());
compare('state and held values',mod=>{const held=mod.namespace_get('fround');mod.set_namespace_state(-0);assert(Object.is(mod.read_namespace_state(),-0));const out=mod.invoke_held(held,-0);assert(mod.delete_namespace_state());return out;});
`;
}

function numberBody(source){return section(source,"const whitespace =",'function scaledDecimal(')+
  section(source,'function scaledDecimal(','test(')+`
for(const input of[null,false,true,undefined,NaN,Infinity,-Infinity,-0,Number.MIN_VALUE,Number.MAX_VALUE,...tokens])compare('complete Number grammar',mod=>mod.parse(input));
for(const token of tokens)compare('ECMAScript whitespace',mod=>mod.parse(whitespace+token+whitespace));
const exponents=new Set([-1075,-1074,-1023,-1022,-53,-52,-1,0,1,52,53,969,970]);
for(let exponent=-1075;exponent<=970;exponent+=17)exponents.add(exponent);
for(const exponent of exponents)for(const significand of[1n,(1n<<53n)-1n,(1n<<53n)+1n])for(const delta of[-1n,0n,1n]){const input=binaryDecimal(significand,exponent,delta);compare('exact decimal tie',mod=>[mod.parse(input),mod.parse('-'+input)]);}
for(const input of['0'.repeat(4096)+'1','1'+'0'.repeat(4096)+'e-4096','0.'+'0'.repeat(4096)+'1e4097','1.'+'0'.repeat(4096)+'1','0x'+'f'.repeat(512),'0b1'+'0'.repeat(1075),'0o'+'7'.repeat(400),'1e'+'0'.repeat(4096)+'2'])compare('long coefficients',mod=>[mod.parse(input),mod.parse(input+'x')]);
const next=random(0xac3b79d5);
for(let i=0;i<1024;i++){
 const digits=Array.from({length:1+next()%96},()=>String(next()%10)).join(''),point=next()%(digits.length+1),input=(next()&1?'-':'')+digits.slice(0,point)+'.'+digits.slice(point)+'e'+(next()%1201-600);
 compare('random decimal grammar',mod=>mod.parse(input));
 const radix=[2,8,16][next()%3],prefix=radix===2?'0b':radix===8?'0o':'0x',text=prefix+Array.from({length:1+next()%128},()=>(next()%radix).toString(radix)).join('');
 assert(Object.is(m.parse(text),Number(BigInt(text))));observations++;
}
for(const input of[null,false,true,undefined,'','中😀\\ud800',NaN,Infinity,-Infinity,-0,Number.MIN_VALUE,Number.MAX_VALUE,1e-7,1e-6,1e20,1e21,.1,.5,1000000000000000100,2**53-1,2**53,2**53+2])compare('shortest text',mod=>mod.text(input));
const nextBits=random(0x9f43bb71),bits=new DataView(new ArrayBuffer(8));
for(let i=0;i<2048;i++){bits.setUint32(0,nextBits(),true);bits.setUint32(4,nextBits(),true);compare('random binary64 text',mod=>mod.text(bits.getFloat64(0,true)));}
for(const input of[.5,-.5,1e-7,1e-6,1e20,1e21,Number.MIN_VALUE,Number.MAX_VALUE,NaN,Infinity,-Infinity,-0])compare('numeric property key',mod=>mod.named_key(input));
for(const input of['','1','-1','1.9','-1.9','0x2','0b10',whitespace+'2'+whitespace,'NaN','Infinity','-Infinity','invalid','5e-324'])compare('position conversion',mod=>mod.position(input));
compare('str argument snapshot',mod=>mod.join('first',-0));
`;}

function jsonBody(source){return section(source,'const valid =','test(')+`
for(const text of valid)compare('JSON grammar canonical form',mod=>mod.canonical_value(text));
for(const text of invalid)compare('invalid JSON and effects',mod=>{const trace={};const error=outcome(()=>mod.parse_extra(text,trace));return[error.error?.name,trace];});
compare('JSON omission and sparse arrays',mod=>{const b=[undefined,NaN,'中😀\\ud800\\0\\n"\\\\',-0];b.length=6;const value={'2':'中😀\\ud800\\0\\n"\\\\',b,a:undefined,nan:NaN,zero:-0};return[mod.stringify_value(value),mod.pretty_value(value,2),mod.select_value(value,['b','nan','b'],'😀abcdefghijk'),mod.stringify_value(undefined),mod.same_parser()];});
for(const text of['-0','-1e-9999','5e-324','2.2250738585072014e-308','1.7976931348623157e308','1e9999','9007199254740993'])compare('JSON number exactness',mod=>mod.parse_value(text));
for(const space of['','x','\\ud800','123456789😀','😀abcdefghijk',-0,-Infinity,Infinity,NaN,-2,1.9,12])compare('JSON indentation',mod=>mod.pretty_value({a:1},space));
let seed=0x69107df3;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
const strings=['','中😀','\\ud800','\\udc00','\\0\\b\\n','"\\\\/\\u2028','__proto__'];
const value=depth=>{const choice=next()%(depth?7:5);if(choice===0)return null;if(choice===1)return!!(next()&1);if(choice===2)return strings[next()%strings.length];if(choice<5)return(next()-0x80000000)*10**(next()%601-300);if(choice===5)return Array.from({length:next()%4},()=>value(depth-1));const entries=[];for(let i=next()%4;i>0;i--)entries.push([['a','2','1','__proto__',''][next()%5],value(depth-1)]);return Object.fromEntries(entries);};
for(let i=0;i<256;i++){const text=JSON.stringify(value(4));compare('seeded JSON tree',mod=>[mod.canonical_value(text),outcome(()=>mod.parse_value(text+'#')).error?.name]);}
compare('JSON cycles and repeated aliases',mod=>{const shared={a:1},cycle={};cycle.self=cycle;return[mod.stringify_value([shared,shared]),outcome(()=>mod.stringify_value(cycle)).error?.name];});
compare('JSON proto own descriptor',mod=>{const object=mod.parse_value('{"__proto__":7}');assert(mod.own_value(object,'__proto__'));return[mod.key_value(object,'__proto__'),Object.keys(object)];});
`;}

function primitiveBody(source){return section(source,"const hex=",'const box=')+`
const inputs=[null,false,true,undefined,0,-0,1,-1,NaN,Infinity,Number.MIN_VALUE,.5,'','0','-0','1.5',' 0x10 ','0b101','0o77','invalid','中😀\\ud800'];
for(const x of inputs){for(const name of['negate','reciprocal','increment','decrement','signed','unsigned','invert','identity-add','identity-multiply'])compare(name,mod=>named(mod,name,x));for(const y of inputs)for(const name of['add','subtract','multiply','divide','remainder','mask','union','exclusive','shift-left','shift-right','logical-right','product-word','equal','less','less-equal','greater','greater-equal'])compare(name,mod=>named(mod,name,x,y));}
for(const values of[['1',2,3],[1,2,'3'],[null,false,'x'],['invalid',1,2],['10','2',3],[-0,'0',null],[undefined,1,'x']]){for(const name of['ordered-add','ordered-subtract','comparison-snapshot'])compare(name,mod=>named(mod,name,...values));for(const name of['snapshot','comparison-effects'])compare(name,mod=>named(mod,name,...values.slice(0,2)));}
for(const name of['identity-add','identity-multiply'])compare('opaque identity',mod=>{const object={};return named(mod,name,object)===object;});
for(const name of['subtract','multiply','divide','remainder','less','less-equal','greater','greater-equal']){const value=Number(BigInt(hex));assert(Object.is(named(m,name,hex,value),expected[name](hex,value)));observations++;}
let state=0x57a39b21;const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;},bits=new DataView(new ArrayBuffer(8));
for(let i=0;i<512;i++){bits.setUint32(0,next(),true);bits.setUint32(4,next(),true);const value=bits.getFloat64(0,true),text=String(value);for(const name of['add','subtract','multiply','remainder','less','greater-equal'])compare(name,mod=>named(mod,name,text,value));}
for(const n of[0,1,3,-0,NaN,-1,2.5,'3'])for(const seed of[-0,NaN,Infinity,.123,'0.123',hex])compare('closed scalar loop',mod=>mod.scalar_loop(n,seed));
compare('source hooks and bigint',mod=>{const trace=[],left={valueOf(){trace.push('left');return 5;}},right={valueOf(){trace.push('right');return 2;}};return[mod.subtract(left,right),trace,mod.subtract(5n,2n),mod.negate(5n),mod.shift_left(5n,2n),outcome(()=>mod.subtract(5n,2)).error?.name,outcome(()=>mod.product_word(5n,2n)).error?.name];});
`;}

// Original Bun suites use the original Bun runner. The plugin only replaces
// their build I/O entry with namespaces of the complete selected compiler
// product; it never transforms a test body or substitutes an emitter/parser.
// Explicit frontend rebuilds still use the original build transport with that
// actual frontend, so its Seed/selfhost checks retain the original algorithms.
function transportCompilerData(value,seen=new Map()){
  if(value===null||typeof value!=='object')return value;
  if(seen.has(value))return seen.get(value);
  let output;
  if(ArrayBuffer.isView(value)){
    const buffer=transportCompilerData(value.buffer,seen);
    output=value instanceof DataView?new DataView(buffer,value.byteOffset,value.byteLength):
      new value.constructor(buffer,value.byteOffset,value.length);
    seen.set(value,output);return output;
  }
  if(value instanceof ArrayBuffer){output=value.slice(0);seen.set(value,output);return output;}
  if(value instanceof Map){output=new Map();seen.set(value,output);for(const[key,item]of value)output.set(transportCompilerData(key,seen),transportCompilerData(item,seen));return output;}
  if(value instanceof Set){output=new Set();seen.set(value,output);for(const item of value)output.add(transportCompilerData(item,seen));return output;}
  output=Array.isArray(value)?[]:Object.create(Object.getPrototypeOf(value)===null?null:Object.prototype);
  seen.set(value,output);
  for(const key of Reflect.ownKeys(value)){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor)throw new TypeError('compiler result changed during data transport');
    if(!Object.hasOwn(descriptor,'value'))throw new TypeError('compiler data results cannot contain accessors');
    Object.defineProperty(output,key,{...descriptor,value:transportCompilerData(descriptor.value,seen)});
  }
  if(!Object.isExtensible(value))Object.preventExtensions(output);
  return output;
}

async function runOriginalSuite({suite:relativeSuite,sourceRoot,moduleRecords},product){
  const moduleIds=moduleRecords.map(record=>record.id);
  const buildPath=resolve(sourceRoot,'tools/backends/build.mjs'),suite=resolve(sourceRoot,relativeSuite);
  const directory=await mkdtemp(resolve(tmpdir(),'eliscript-original-selected-suite-'));
  try{
    const original=await readFile(buildPath,'utf8'),declaration='export async function buildBackends(';
    const at=original.indexOf(declaration);
    assert(at>=0&&original.indexOf(declaration,at+declaration.length)<0,'original build transport declaration is unique');
    const renamed=original.slice(0,at)+'async function originalSelectedFrontendBuild('+original.slice(at+declaration.length);
    const addition=`
export async function buildBackends(options={}){
 const transport=globalThis[Symbol.for('eliscript.original.selected-backends')];
 if(!transport)throw new Error('the selected backend product is not installed');
 const actual=await transport.load();
 if(options.frontend!==undefined||options.seed===true)return originalSelectedFrontendBuild({...options,frontend:options.frontend??actual.compiler});
 let selectedDirectory=actual.directory;
 if(options.outputRoot!==undefined){
  const outputRoot=resolve(options.outputRoot);selectedDirectory=resolve(outputRoot,'backends');
  if(await realpath(outputRoot).catch(error=>{if(error.code==='ENOENT')return outputRoot;throw error;})===await realpath(actual.product))throw new Error('original build output must not overwrite the selected compiler artifact');
  // Forwarders preserve the actual namespace/registry identity and cannot
  // overwrite the selected artifact when an original multi-generation case
  // later rebuilds its temporary output directory.
  for(const id of actual.moduleIds){
   const target=resolve(outputRoot,id);await mkdir(dirname(target),{recursive:true});
   const url=pathToFileURL(resolve(actual.product,id)).href;
   const namespace=await import(url);
   const lines=['import * as actual from '+JSON.stringify(url)+';','const transportCompilerData='+actual.transportCompilerData.toString()+';'];
   let index=0;
   for(const key of Object.keys(namespace)){
    const local='transported'+index++;
    lines.push('const '+local+'=typeof actual['+JSON.stringify(key)+']==="function"?function(...args){return transportCompilerData(Reflect.apply(actual['+JSON.stringify(key)+'],undefined,args));}:transportCompilerData(actual['+JSON.stringify(key)+']);');
    lines.push('export {'+local+' as '+JSON.stringify(key)+'};');
   }
   await writeFile(target,lines.join('\\n')+'\\n');
   const record=actual.moduleRecords.find(record=>record.id===id);
   actual.browserModules.set(await realpath(target),{filename:resolve(root,record.filename),compiler:actual.compiler});
  }
  const dependencies=resolve(outputRoot,'node_modules');await mkdir(dependencies,{recursive:true});
  const link=resolve(dependencies,'eliscript');try{await symlink(root,link,'dir');}catch(error){if(error.code!=='EEXIST')throw error;if(await realpath(link)!==await realpath(root))throw new Error('backend transport resolves a different runtime package');}
 }
 return {...actual,directory:selectedDirectory,async loadLiteralModules(){const literalSources=await loadLiteralSources({sourceRoot:root});return{literalSources,literalModules:literalSources.map(record=>({id:record.id,program:actual.compiler.compile_ir_string(record.source,record.filename)}))};}};
}
`;
    const plugin=resolve(directory,'selected-backends-preload.mjs'),interceptPath=resolve(directory,'selected-backends-interception.json');
    const pluginSource=[
      "import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';",
      "import {realpath,writeFile,readFile} from 'node:fs/promises';",
      'const product='+JSON.stringify(product)+',buildPath='+JSON.stringify(buildPath)+',interceptPath='+JSON.stringify(interceptPath)+';',
      'const canonicalBuildPath=await realpath(buildPath);',
      'const transportCompilerData='+transportCompilerData.toString()+';',
      "const functionTransports=new WeakMap();function namespaceTransport(namespace){const result=Object.create(null);for(const key of Object.keys(namespace))Object.defineProperty(result,key,{enumerable:true,get(){const value=namespace[key];if(typeof value!=='function')return transportCompilerData(value);if(!functionTransports.has(value))functionTransports.set(value,function(...args){return transportCompilerData(Reflect.apply(value,undefined,args));});return functionTransports.get(value);}});return Object.freeze(result);}",
      "const directory=resolve(product,'backends'),selected={directory,product,transportCompilerData,moduleRecords:"+JSON.stringify(moduleRecords)+",moduleIds:"+JSON.stringify(moduleIds)+",browserModules:new Map()};",
      "let loading;selected.load=async function(){if(!loading)loading=(async()=>{selected.compiler=namespaceTransport(await import(pathToFileURL(resolve(product,'bootstrap/compiler.mjs')).href));for(const[key,name]of[['optimizer','optimize'],['numeric','numeric'],['wasm','wasm'],['native','native'],['sha256','sha256'],['regexp','regexp'],['managed','managed'],['memory','memory']])selected[key]=namespaceTransport(await import(pathToFileURL(resolve(directory,name+'.mjs')).href));return selected;})().catch(error=>{loading=undefined;throw error;});return loading;};",
      "globalThis[Symbol.for('eliscript.original.selected-backends')]=selected;",
      // Original browser tests request JavaScript bundles. Only that I/O path
      // obtains JavaScript emitted by the actual selected compiler; ordinary
      // Node/Bun imports keep the selected machine namespaces above.
      "const originalBundle=Bun.build;Bun.build=function(options){if(options?.target!=='browser')return Reflect.apply(originalBundle,Bun,[options]);const transport={name:'selected-compiler-browser-source',setup(builder){builder.onLoad({filter:/[.]mjs$/},async args=>{const record=selected.browserModules.get(await realpath(args.path));if(!record)return;const source=await readFile(record.filename,'utf8');return{contents:record.compiler.compile_string(source,record.filename),loader:'js',resolveDir:resolve(args.path,'..')};});}};return Reflect.apply(originalBundle,Bun,[{...options,plugins:[...(options.plugins??[]),transport]}]);};",
      'const contents='+JSON.stringify(renamed+addition)+';',
      "Bun.plugin({name:'actual-selected-compiler-backends',setup(builder){builder.onLoad({filter:/build[.]mjs$/},async args=>{if(await realpath(args.path)!==canonicalBuildPath)return;await writeFile(interceptPath,JSON.stringify({product,modules:selected.moduleIds}));return{contents,loader:'js'};});}});",
    ].join('\n');
    await writeFile(plugin,pluginSource);
    const env={...process.env},args=[];
    if(env.ELISCRIPT_ORIGINAL_PROGRAM_CONTEXT)args.push('--preload',
      pathToFileURL(resolve(sourceRoot,'tools/backends/compiler-corpus-host-context.mjs')).href);
    // The actual Bun runner retains every original declaration and deadline.
    // No --timeout, test-name filter or rewritten assertion body is involved.
    args.push('--preload',plugin,'test',suite);
    const child=spawn(process.env.BUN??'bun',args,{cwd:sourceRoot,env,
      detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',chunk=>process.stderr.write(chunk));
    child.stderr.on('data',chunk=>process.stderr.write(chunk));
    let stopped=false,killTimer;
    const kill=signal=>{
      if(child.exitCode!==null||child.signalCode!==null)return;
      try{if(process.platform!=='win32'&&child.pid)process.kill(-child.pid,signal);else child.kill(signal);}
      catch(error){if(error.code!=='ESRCH')throw error;}
    };
    const cancel=signal=>{if(stopped)return;stopped=true;kill(signal);killTimer=setTimeout(()=>kill('SIGKILL'),1000);killTimer.unref?.();};
    const interrupt=()=>cancel('SIGINT'),terminate=()=>cancel('SIGTERM');
    process.on('SIGINT',interrupt);process.on('SIGTERM',terminate);
    try{
      const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
      assert.equal(stopped,false,'the original suite was cancelled');assert.equal(result.signal,null);
      assert.equal(result.code,0,'the complete original suite must pass with the actual selected compiler product');
    }finally{clearTimeout(killTimer);process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',terminate);}
    const interception=JSON.parse(await readFile(interceptPath,'utf8'));
    assert.equal(interception.product,product);assert.deepEqual(interception.modules,moduleIds,
      'the original default bootstrap may not silently replace the selected compiler');
    console.log(JSON.stringify({suite:relativeSuite,completeOriginalSuite:true}));
  }finally{await rm(directory,{recursive:true,force:true});}
}

function originalSuiteHost(suites,sourceRoot,moduleRecords){return[
  "import assert from 'node:assert/strict';",
  "import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';",
  "import {resolve} from 'node:path';import {tmpdir} from 'node:os';",
  "import {pathToFileURL} from 'node:url';import {spawn} from 'node:child_process';",
  'const transportCompilerData='+transportCompilerData.toString()+';',
  'const run='+runOriginalSuite.toString()+';',
  'for(const suite of '+JSON.stringify(suites)+')await run({suite,sourceRoot:'+JSON.stringify(sourceRoot)+',moduleRecords:'+JSON.stringify(moduleRecords)+'},process.argv[2]);',
].join('\n');}

const replaySuites=[
  'wasm-managed-arithmetic','wasm-managed-word','wasm-managed-array-callbacks',
  'wasm-managed-arrays','wasm-managed-array-index-storage','wasm-managed-array-text','wasm-managed-callables',
  'wasm-managed-control','wasm-managed-empty-bindings','wasm-managed-exceptions',
  'wasm-managed-catch-destructuring','wasm-managed-function-properties',
  'wasm-managed-json','wasm-managed-json-callbacks','wasm-managed-math','wasm-managed-math-transcendental','wasm-managed-module-bindings',
  'wasm-managed-number-conversion','wasm-managed-objects','wasm-managed-primitive-operators',
  'wasm-managed-regexp','wasm-managed-regexp-indices','wasm-managed-regexp-unicode-sets','wasm-managed-regexp-property-data','wasm-managed-replacement','wasm-managed-source-collections',
  'wasm-managed-strings','wasm-managed-variadic-calls','wasm-managed-tables',
  'wasm-managed-runtime','wasm-managed-js-cons','managed-persistent-vector',
  'wasm-managed-array-construction','wasm-managed-array-search','wasm-managed-object-properties',
  'wasm-managed-symbols','wasm-managed-builtins','wasm-managed-typeof',
  'wasm-managed-project-linking','direct-wasm-backend','wasm-memory-f64-unary','wasm-memory-static-data','native-memory-data-copy',
  'regexp-property-outlining',
].map(name=>'tests/'+name+'.test.mjs');

function selectedOriginalSuites(locators){
  // The frozen original locator inventory, rather than the working directory,
  // is authoritative. A newly retained managed suite must enter this replay
  // without waiting for a second hand-maintained list of its test titles.
  const suites=new Set(replaySuites);
  for(const locator of locators){
    if(typeof locator.file==='string'&&
      /^tests\/(?:wasm-managed-[a-z0-9-]+|wasm-memory-f64-[a-z0-9-]+|managed-persistent-vector|managed-stdlib-value-json|direct-wasm-backend)[.]test[.]mjs$/.test(locator.file))
      suites.add(locator.file);
  }
  return [...suites].sort();
}

async function dependencies(text, initial) {
  const result=new Map(),pending=[...initial];
  while(pending.length){
    const item=pending.shift();if(result.has(item.id))continue;
    const source=item.source??await text(item.filename);
    result.set(item.id,{...item,source});
    for(const match of source.matchAll(/\(import(?:-portable)?\s+"([^"\n]+)"/g)){
      if(!match[1].startsWith('.'))continue;
      const target=posix.normalize(posix.join(posix.dirname(item.id),match[1]));
      if(target.startsWith('../'))throw new TypeError('original managed fixture dependency escapes project');
      // The actual canonical private runtime graph is supplied by the compiler
      // session. Relative public source dependencies remain explicit modules.
      if(target.startsWith('runtime/'))continue;
      const id=target.endsWith('.eli')?target.slice(0,-4)+'.mjs':target;
      const filename=id==='persistent-vector.mjs'?'stdlib/persistent-vector.eli':
        target.endsWith('.mjs')?target.slice(0,-4)+'.eli':target;
      if(!result.has(id)&&!pending.some(value=>value.id===id))pending.push({id,filename});
    }
  }
  return [...result.values()];
}

const plans = [
  ['arithmetic','tests/wasm-managed-arithmetic.test.mjs',arithmetic],
  ['word','tests/wasm-managed-word.test.mjs',word],
  ['array-callbacks','tests/wasm-managed-array-callbacks.test.mjs',callbacks],
  ['arrays','tests/wasm-managed-arrays.test.mjs',arrays],
  ['array-construction','tests/wasm-managed-array-construction.test.mjs',construction],
  ['array-search','tests/wasm-managed-array-search.test.mjs',search],
  ['object-properties','tests/wasm-managed-object-properties.test.mjs',properties],
  ['empty-bindings','tests/wasm-managed-empty-bindings.test.mjs',emptyBindings],
  ['control','tests/wasm-managed-control.test.mjs',control],
  ['variadic-calls','tests/wasm-managed-variadic-calls.test.mjs',variadic],
  ['exceptions','tests/wasm-managed-exceptions.test.mjs',exceptions],
  ['catch-destructuring','tests/wasm-managed-catch-destructuring.test.mjs',catchBindings],
  ['symbols','tests/wasm-managed-symbols.test.mjs',symbols],
  ['source-collections','tests/wasm-managed-source-collections.test.mjs',collections],
  ['objects','tests/wasm-managed-objects.test.mjs',objects],
  ['module-bindings','tests/wasm-managed-module-bindings.test.mjs',moduleBindings],
  ['builtins','tests/wasm-managed-builtins.test.mjs',builtin],
  ['typeof','tests/wasm-managed-typeof.test.mjs',typeofFixture],
  ['regexp','tests/wasm-managed-regexp.test.mjs',regexp],
  ['replacement','tests/wasm-managed-replacement.test.mjs',replacement],
  ['array-text','tests/wasm-managed-array-text.test.mjs',arrayText],
  ['strings','tests/wasm-managed-strings.test.mjs',strings],
  ['callables','tests/wasm-managed-callables.test.mjs',callables],
  ['js-cons','tests/wasm-managed-js-cons.test.mjs',jsCons],
];

export async function bindOriginalManagedSourceEvidence({records,locators,text,file,bindCoverage}){
  for(const plan of [
    {record:'stable-compatibility:program:tests/fixtures/declarative-protocol.eli',
      fixture:'tests/fixtures/declarative-protocol.eli',host:'tests/fixtures/declarative-protocol-host.mjs',
      calls:['new declarations.Box(7)','declarations.describe(box)','declarations.measure(5, 4)']},
    {record:'stable-compatibility:program:stdlib/multimethod.eli',
      fixture:'tests/fixtures/declarative-multimethod.eli',host:'tests/fixtures/multimethod-host.mjs',
      calls:['const [modulePath, declarativePath] = process.argv.slice(2);',
        'declarativeModule.render("text", "hello")','declarativeModule.render("number", 21)']},
    {record:'stable-compatibility:program:tests/fixtures/core-expression-forms.eli',
      fixture:'tests/fixtures/core-expression-forms.eli',host:'tests/fixtures/core-expression-forms-host.mjs',
      calls:['const module = await import(modulePath);','module.expression_form_report()']},
  ]){
    const selected=locators.filter(locator=>[plan.fixture,plan.host].includes(locator.file));
    if(!selected.length)continue;
    const record=records.find(record=>record.id===plan.record);
    if(!record||record.kind!=='project'||record.execution?.kind!=='original-program')
      throw new TypeError('original executed source evidence lost its actual project: '+plan.record);
    const module=record.modules?.find(module=>module.filename===plan.fixture);
    const source=await text(plan.fixture),host=await text(plan.host);
    if(!module||module.source!==source||record.execution.host!==plan.host||record.execution.hostSource!==host||
      !plan.calls.every(call=>host.includes(call))||
      !(module.id===record.entry||record.execution.argumentModules?.includes(module.id))||
      !record.request.entries?.includes(module.id))
      throw new TypeError('original fixture evidence is not an actually executed input: '+plan.fixture);
    if(typeof bindCoverage!=='function')throw new TypeError('original executed source evidence requires its coverage binder');
    const sourceIdentity=await file(plan.fixture),hostIdentity=await file(plan.host),bindings=[];
    for(const locator of selected){
      const original=locator.file===plan.fixture?source:host;
      if(typeof locator.contains!=='string'||!original.includes(locator.contains))
        throw new TypeError('original executed source locator changed: '+locator.id);
      bindings.push({coverageId:locator.id,file:locator.file,
        sourceSha256:locator.file===plan.fixture?sourceIdentity.sha256:hostIdentity.sha256,
        module:module.id,host:plan.host,hostSourceSha256:hostIdentity.sha256,actualCalls:[...plan.calls]});
    }
    bindCoverage(record,bindings.map(binding=>binding.coverageId));
    record.original={...record.original,sourceEvidenceBindings:[...(record.original?.sourceEvidenceBindings??[]),...bindings]};
  }
}

export async function addOriginalManagedFixtureAdapters({add,text,file,stableFiles,locators,sourceRoot,records=[],bindCoverage}) {
  await bindOriginalManagedSourceEvidence({records,locators,text,file,bindCoverage});
  const legacyFixture='tests/fixtures/compatibility/native-containers-v1.eli';
  if(stableFiles.has(legacyFixture)){
    const contractFile='contracts/compatibility-rehearsal.json',contract=JSON.parse(await text(contractFile));
    const migrations=contract.migrations?.filter(migration=>migration.legacySource===legacyFixture);
    if(contract.format!=='eliscript-compatibility-rehearsal'||migrations?.length!==1)
      throw new TypeError('original legacy container migration declaration changed');
    const expected=migrations[0].expectedLegacyDiagnostic;
    if(!expected||['code','phase','message'].some(key=>typeof expected[key]!=='string'))
      throw new TypeError('original legacy container diagnostic declaration changed');
    const source=await text(legacyFixture),identity=await file(legacyFixture);
    const contractIdentity=await file(contractFile),host='tools/compatibility/rehearse.mjs',hostIdentity=await file(host);
    add({id:'original-sequence:legacy-native-container-rejection',kind:'sequence',
      coverage:['stable-compatibility:'+legacyFixture],
      steps:[{id:'complete-original-legacy-source',request:{operation:'stage',stage:'emitter',source,filename:legacyFixture},
        error:{code:expected.code,phase:expected.phase,expectFields:[
          {path:['message'],value:expected.message},{path:['location','file'],value:legacyFixture},
        ]}}],expected:{kind:'sequence'},
      original:{manifest:'stable-compatibility',fixture:legacyFixture,sourceSha256:identity.sha256,classification:'invalid',
        contract:{file:contractFile,sourceSha256:contractIdentity.sha256},host,hostSourceSha256:hostIdentity.sha256,
        expectedLegacyDiagnostic:structuredClone(expected)}});
  }
  async function append(name,suite,body,initial,coverage,options={}){
    const sourceEvidence=await file(suite);
    const modules=await dependencies(text,initial);
    for(const module of modules)await file(module.filename);
    for(const hostRuntime of['node','bun'])add({
      id:'original-managed-fixture:'+name+':'+hostRuntime,kind:'project',coverage:[...coverage],
      entry:initial[0].id,modules:structuredClone(modules),auto:options.auto??1,
      request:{operation:'project',resolveImports:true,phased:true,entries:modules.map(module=>module.id)},
      memory:structuredClone(options.memory??{initialPages:4,maximumPages:256}),
      execution:{kind:'original-program',host:'tests/__eliscript_managed_fixture_'+name+'_'+hostRuntime+'.mjs',
        hostSource:prelude.replace('__ELISCRIPT_ORIGINAL_AUTO__',String(options.auto??1))+body+'\nfinish();\n',hostRuntime,arguments:[{directory:true},{literal:initial[0].id}],
        referenceArtifact:true,aliases:true,childProcesses:'inherit-selected-artifact',zeroImports:true,
        timeoutMs:options.timeoutMs??30000,
        runtimeOptions:structuredClone(options.budget??{maxSlots:1024,initialBytes:65536,maxBytes:16777216})},
      expected:{kind:'seed-program',oracleRequired:true},
      original:{manifest:'stable-compatibility',fixture:initial[0].filename,suite,sourceSha256:sourceEvidence.sha256,
        semanticCoverage:'source-fixture-public-operations',
        targetSpecificAssertions:{javascript:'actual selected source exports compared to the independent Seed product',
          binary:'the same actual selected source calls plus real automatic collection, private-frame restoration and close/live-zero'},
        unclaimedAssertions:'Raw ABI, malformed IR, dynamic runtime injection and untransported individual suite cases retain their existing mandatory gate and missing locators.'},
    });
  }
  for(const[name,suite,body]of plans){
    const fixture='tests/fixtures/wasm-managed-'+name+'.eli';
    if(!stableFiles.has(fixture))continue;
    await append(name,suite,body,[{id:'entry.mjs',filename:fixture}],['stable-compatibility:'+fixture]);
  }
  for(const[name,suite,body]of[
    ['math','tests/wasm-managed-math.test.mjs',mathBody],
    ['number-conversion','tests/wasm-managed-number-conversion.test.mjs',numberBody],
    ['json','tests/wasm-managed-json.test.mjs',jsonBody],
    ['primitive-operators','tests/wasm-managed-primitive-operators.test.mjs',primitiveBody],
  ]){
    const fixture='tests/fixtures/wasm-managed-'+name+'.eli';
    if(stableFiles.has(fixture))await append(name,suite,body(await text(suite)),[{id:'entry.mjs',filename:fixture}],['stable-compatibility:'+fixture]);
  }
  const functionFixture='tests/fixtures/wasm-managed-function-properties.eli';
  if(stableFiles.has(functionFixture)){
    const suite='tests/wasm-managed-function-properties.test.mjs',original=await text(functionFixture),source=await text(suite);
    const end=original.lastIndexOf(')');if(end<0)throw new TypeError('original function fixture module boundary changed');
    const extension=readOriginalManagedStaticTemplate(source,'reflectionSource',reflectionTemplateBindings(source));
    await append('function-properties',suite,
      section(source,'const wellKnownSymbolNames=','const reflectionSource=')+functionProperties,
      [{id:'entry.mjs',filename:functionFixture,source:original.slice(0,end)+extension+original.slice(end)}],
      ['stable-compatibility:'+functionFixture]);
  }
  const vectorFixture='tests/fixtures/wasm-managed-persistent-vector.eli';
  if(stableFiles.has(vectorFixture))for(const auto of[65536,1])await append('persistent-vector-auto-'+auto,
    'tests/managed-persistent-vector.test.mjs',auto===1?"compare('collecting persistent Vector callbacks',mod=>mod.vector_case(33));":persistentVector,
    [{id:'entry.mjs',filename:vectorFixture}],['stable-compatibility:'+vectorFixture],
    {auto,memory:{initialPages:4,maximumPages:1024},budget:{maxSlots:8192,initialBytes:262144,maxBytes:16777216},timeoutMs:auto===1?30000:120000});
  const fixture='tests/fixtures/wasm-managed-project-entry.eli',state='tests/fixtures/wasm-managed-project-state.eli';
  if(stableFiles.has(fixture)&&stableFiles.has(state))await append('project-entry','tests/direct-wasm-backend.test.mjs',project,
    [{id:'tests/fixtures/wasm-managed-project-entry.mjs',filename:fixture}],
    ['stable-compatibility:'+fixture,'stable-compatibility:'+state]);
  // The full original suites also run their raw ABI, malformed-IR and injected
  // runtime cases. Their compiler/backends are the selected complete product,
  // not the host's default bootstrap. Each suite retains the real Bun runner,
  // every original test body, all native platform conditions, all original
  // Node subprocesses, and each original per-test/beforeAll timeout.
  const sources=await loadCompilerSources({sourceRoot});
  for(const record of[...sources.modules,sources.runtime,...sources.literalSources])await file(record.filename);
  await file('tools/backends/build.mjs');
  await file('tools/backends/compiler-corpus-host-context.mjs');
  const suiteBindings=[],suiteCoverage=[],selectedSuites=selectedOriginalSuites(locators);
  for(const suite of selectedSuites){
    const source=await text(suite),identity=await file(suite);
    const fixtureCoverage=[...stableFiles].filter(name=>name.startsWith('tests/fixtures/wasm-managed-')&&
      name.endsWith('.eli')&&source.includes(name)).map(name=>'stable-compatibility:'+name);
    const sourceInputs=[];
    const trie='tests/fixtures/regexp-property-original-trie.eli';
    if(suite==='tests/regexp-property-outlining.test.mjs'&&stableFiles.has(trie)){
      for(const actual of ["readFile('"+trie+"','utf8')",'reconstructed=inline(definitions.get(rootName))',
        "'(module regexp.original '+reconstructed",'originalJS.regexp_property_id_base',
        'assert(irNodes(originalRoot.find(node=>node.kind===\'function-declaration\'&&node.value===rootName))>1000)'])
        if(!source.includes(actual))throw new TypeError('original property trie execution boundary changed: '+actual);
      sourceInputs.push({file:trie,sourceSha256:(await file(trie)).sha256,
        execution:'complete original definitions reconstructed, compiled and compared by the unmodified suite'});
      fixtureCoverage.push('stable-compatibility:'+trie);
    }
    const originalCoverage=locators.filter(locator=>locator.file===suite&&typeof locator.contains==='string'&&
      source.includes(locator.contains)).map(locator=>locator.id);
    suiteCoverage.push(...fixtureCoverage,...originalCoverage);
    suiteBindings.push({file:suite,sourceSha256:identity.sha256,coverage:[...fixtureCoverage,...originalCoverage],
      ...(sourceInputs.length?{sourceInputs}:{})});
  }
  if(suiteCoverage.length)add({id:'original-managed-suite:complete-fixture-suites',kind:'project',
      coverage:[...new Set(suiteCoverage)],
      modules:structuredClone(sources.modules),entry:sources.entry,auto:65536,
      request:{operation:'project',phased:true,resolveImports:true,entries:sources.modules.map(module=>module.id),
        literalSources:structuredClone(sources.literalSources)},
      memory:{initialPages:128,maximumPages:4096},
      execution:{kind:'original-program',host:'tests/__eliscript_selected_managed_fixture_suites.mjs',
        hostSource:originalSuiteHost(selectedSuites,sourceRoot,sources.modules.map(({id,filename})=>({id,filename}))),hostRuntime:'bun',
        arguments:[{directory:true}],referenceArtifact:true,aliases:true,zeroImports:true,
        childProcesses:'inherit-selected-artifact',timeoutMs:1800000,
        runtimeOptions:{maxSlots:131072,initialBytes:8388608,maxBytes:67108864,auto:65536}},
      expected:{kind:'seed-program',oracleRequired:true},
      original:{manifest:'stable-compatibility',suites:suiteBindings,
        semanticCoverage:'complete-original-suite-with-selected-compiler-namespaces',
        originalHost:'bun',testSource:'unmodified',testRunner:'bun test',
        compilerProduct:'complete actual frontend and backend graph in the selected output target',
        sourceProgramABI:'original suite binary ABI is retained, including genuine WASM and explicitly declared native cases',
        targetSpecificAssertions:{all:'original suite assertions and every declared resource/deadline remain unmodified'},
        timeoutScope:'outer process ceiling retains the original compatibility job 30-minute limit; original case limits are enforced by the original Bun runner'},
    });
  // Return no whole-suite coverage. A public source fixture recipe must never
  // hide a missing raw-ABI or dynamically compiled case in the same test file.
  return [];
}
