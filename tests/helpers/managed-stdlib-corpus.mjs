const initialInputs=['null','true','-0','1e-3','"中😀\\uD800"','[1,null,true]','{"b":2,"a":[1,false]}','','{"a":}','[1,]','01'];
// Generate bounded transport inputs only. Both references execute the original
// complete stdlib algorithms, including parsing and canonical serialization.
function randomInputs(){
 let state=0x5eeda11;const next=()=>state=(Math.imul(state,1664525)+1013904223)>>>0,pick=xs=>xs[next()%xs.length];
 const strings=['','a','中😀','\ud800','\udfff','a\u0000b','"\\\n','__proto__'];
 function source(depth){const kind=next()%(depth?7:5);if(kind===0)return'null';if(kind===1)return next()&1?'true':'false';if(kind===2)return String((next()%20001-10000)/pick([1,4,1000]));if(kind===3)return JSON.stringify(pick(strings));if(kind===4)return pick(['-0','5e-324','1e-7','9007199254740991']);if(kind===5)return'['+Array.from({length:next()%4},()=>source(depth-1)).join(',')+']';return'{'+Array.from({length:next()%4},(_,i)=>JSON.stringify(i+'-'+pick(strings))+':'+source(depth-1)).join(',')+'}';}
 const valid=Array.from({length:32},()=>source(2));return[...valid,...valid.slice(0,16).map(x=>x+' x')];
}
const fixedInputs=[' ','1.','1e','1e+','{"a":1,}',"'x'",'{"a" 1}','{a:1}','"\\x20"','"line\nfeed"','true false','{"a":1,"a":2}','1e400','{"z":{"a":1,"a":2}}','{"a":[1,]}','{"😀": [1,]}','"\\"\\\\\\/\\b\\f\\n\\r\\t\\u0041"','{"z":[true,null,"x\\n\\u263a"],"a":{"n":-1.25e3}}'];
export const inputs=[...initialInputs,...fixedInputs,...randomInputs()];
// Functions preserve undefined, nonfinite numbers, signed zero and UTF16 during
// test transport; expected reports themselves contain only JSON data.
export function parseBoundaryCases(){return[['{"a":1,"a":2}',null],['{"z":{"a":1,"a":2}}',null],['{"😀": [1,]}',null],[null,null],['1e400',null],['null',{unknown:true}],['null',{maxDepth:null}],['null',{maxLength:1.5}],['null',{maxValues:undefined}],['null',{maxLength:3}],['[[0]]',{maxDepth:1}],['[1,2]',{maxValues:2}]];}
export function encodeBoundaryCases(){return['中😀','\ud800','\udfff','\u0000\b\f\n\r\t"\\',-0,NaN,Infinity,-Infinity,undefined,{},[]];}
export const parseCases=parseBoundaryCases(),encodeInputs=encodeBoundaryCases();
