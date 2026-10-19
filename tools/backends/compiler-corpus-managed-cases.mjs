import {createHash} from 'node:crypto';

export const originalManagedSuites=Object.freeze([
  'tests/compiler-session-tools.test.mjs',
  'tests/wasm-managed-core-modules.test.mjs',
  'tests/wasm-managed-transient-state.test.mjs',
  'tests/wasm-managed-sorted-core.test.mjs',
  'tests/wasm-managed-sequence-data.test.mjs',
  'tests/wasm-managed-wire.test.mjs',
]);
const hash=text=>createHash('sha256').update(text).digest('hex');

// Read registration boundaries as source data. This does not import a suite,
// evaluate its title expressions, run its loops, or execute assertion code.
function tokens(source){
  const result=[];let at=0;
  while(at<source.length){
    if(/\s/.test(source[at])){at++;continue;}
    const start=at,c=source[at];
    if(c==='/'&&source[at+1]==='/'){while(at<source.length&&source[at]!=='\n')at++;continue;}
    if(c==='/'&&source[at+1]==='*'){
      const end=source.indexOf('*/',at+2);if(end<0)throw new TypeError('unterminated original suite comment');at=end+2;continue;
    }
    if(c==='"'||c==="'"||c==='`'){
      at++;let closed=false;
      while(at<source.length){const next=source[at++];if(next==='\\'){at++;continue;}if(next===c){closed=true;break;}}
      if(!closed)throw new TypeError('unterminated original suite string');
      result.push({type:'string',start,end:at,text:source.slice(start,at)});continue;
    }
    const previous=result.at(-1),regexp=c==='/'&&(!previous||
      !['identifier','number','string'].includes(previous.type)&&![')',']','}'].includes(previous.text)||
      previous?.type==='identifier'&&['return','throw','case','yield','await'].includes(previous.text));
    if(regexp){
      at++;let bracket=false,closed=false;
      while(at<source.length){const next=source[at++];if(next==='\\'){at++;continue;}if(next==='[')bracket=true;else if(next===']')bracket=false;else if(next==='/'&&!bracket){closed=true;break;}}
      if(!closed)throw new TypeError('unterminated original suite regular expression');
      while(/[a-z]/i.test(source[at]??'')&&at<source.length)at++;
      result.push({type:'regexp',start,end:at,text:source.slice(start,at)});continue;
    }
    const identifier=/^[$A-Z_a-z][$\w]*/.exec(source.slice(at));
    if(identifier){at+=identifier[0].length;result.push({type:'identifier',start,end:at,text:identifier[0]});continue;}
    const number=/^(?:0[xob][0-9a-f_]+|[0-9][0-9_.]*(?:e[+-]?[0-9_]+)?)/i.exec(source.slice(at));
    if(number){at+=number[0].length;result.push({type:'number',start,end:at,text:number[0]});continue;}
    at++;result.push({type:'punctuation',start,end:at,text:c});
  }
  return result;
}
function closing(list,start){
  const pairs={'(':')','[':']','{':'}'},stack=[];
  for(let index=start;index<list.length;index++){
    const token=list[index];if(token.type!=='punctuation')continue;
    if(pairs[token.text])stack.push(pairs[token.text]);
    else if([')',']','}'].includes(token.text)){
      if(stack.pop()!==token.text)throw new TypeError('original suite registration has unbalanced source');
      if(!stack.length)return index;
    }
  }
  throw new TypeError('original suite registration is incomplete');
}
function stringData(token){
  const source=token.text;let value='';
  for(let index=1;index<source.length-1;index++){
    let character=source[index];
    if(character!=='\\'){value+=character;continue;}
    character=source[++index];
    const escapes={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0'};
    if(Object.hasOwn(escapes,character)){value+=escapes[character];continue;}
    if(character==='\n')continue;
    if(character==='\r'){if(source[index+1]==='\n')index++;continue;}
    if(character==='u'||character==='x'){
      const count=character==='u'?4:2,hex=source.slice(index+1,index+1+count);
      if(!new RegExp('^[0-9a-f]{'+count+'}$','i').test(hex))throw new TypeError('unsupported original title escape');
      value+=String.fromCharCode(parseInt(hex,16));index+=count;continue;
    }
    value+=character;
  }
  return value;
}

function titleInstances(list,first,last){
  const arrayAt=start=>{
    if(list[start]?.text!=='[')throw new TypeError('original title inputs must remain a literal array');
    const end=closing(list,start),values=[];
    for(let at=start+1;at<end;at++){
      const token=list[at];if(token.text===',')continue;
      if(token.type==='string')values.push(stringData(token));
      else if(token.type==='number')values.push(Number(token.text.replaceAll('_','')));
      else throw new TypeError('original title inputs acquired a computed value');
    }
    return values;
  };
  const constant=name=>{
    for(let at=0;at<list.length-3;at++)if(list[at].text==='const'&&list[at+1].text===name&&list[at+2].text==='=')return arrayAt(at+3);
    throw new TypeError('original dynamic title lost its data binding: '+name);
  };
  const binding=name=>{
    let values;
    for(let at=0;at<first;at++)if(list[at].text==='for'&&list[at+1].text==='('&&
      list[at+2].text==='const'&&list[at+3].text===name&&list[at+4].text==='of'){
      const body=closing(list,at+1)+1;let end;
      if(list[body]?.text==='{')end=closing(list,body);
      else if(['test','actualTest'].includes(list[body]?.text)&&list[body+1]?.text==='(')end=closing(list,body+1);
      if(end===undefined||body>first||end<first)continue;
      values=list[at+5].text==='['?arrayAt(at+5):constant(list[at+5].text);
    }
    if(values!==undefined)return values;
    throw new TypeError('original title lost its enclosing input loop: '+name);
  };
  const firstToken=list[first],template=firstToken.text[0]==='`',names=[];
  if(template){
    for(const match of stringData(firstToken).matchAll(/\$\{([^}]+)\}/g)){
      if(!/^[$A-Z_a-z][$\w]*$/.test(match[1]))throw new TypeError('original title interpolation requires an explicit adapter');
      if(!names.includes(match[1]))names.push(match[1]);
    }
  }else for(let at=first;at<last;at++){
    const token=list[at];
    if(token.type==='identifier'){if(!names.includes(token.text))names.push(token.text);}
    else if(token.type!=='string'&&token.type!=='number'&&token.text!=='+')throw new TypeError('original title expression requires an explicit adapter');
  }
  let variants=[{}];
  for(const name of names){const values=binding(name);variants=variants.flatMap(parameters=>values.map(value=>({...parameters,[name]:value})));}
  return variants.map(parameters=>{
    if(template)return{parameters,title:stringData(firstToken).replace(/\$\{([^}]+)\}/g,(_all,name)=>String(parameters[name]))};
    let title='';
    for(let at=first;at<last;at++){
      const token=list[at];if(token.text==='+')continue;
      title+=token.type==='string'?stringData(token):token.type==='identifier'?String(parameters[token.text]):token.text.replaceAll('_','');
    }
    return{parameters,title};
  });
}

export function originalManagedCaseLocators(file,source){
  if(!originalManagedSuites.includes(file)||typeof source!=='string')throw new TypeError('unregistered original managed source suite');
  return originalSourceCaseLocators(file,source);
}

// Other declared original adapters share the same source-only registration
// reader. Admission remains with each adapter's explicit suite inventory.
export function originalSourceCaseLocators(file,source){
  if(typeof file!=='string'||!file.startsWith('tests/')||!file.endsWith('.test.mjs')||
    /[\\:\u0000]/.test(file)||file.split('/').some(part=>!part||part==='.'||part==='..')||typeof source!=='string')
    throw new TypeError('original cases require an exact relative source suite');
  const list=tokens(source),locators=[],sourceSha256=hash(source);let registrationIndex=0;
  for(let index=0;index<list.length;index++){
    const token=list[index];
    if(token.type!=='identifier'||!['test','actualTest'].includes(token.text)||list[index-1]?.text==='.')continue;
    let open=index+1;
    if(list[open]?.text==='.'&&list[open+1]?.text==='skipIf'&&list[open+2]?.text==='(')open=closing(list,open+2)+1;
    if(list[open]?.text!=='('||list[open+1]?.type!=='string')continue;
    const end=closing(list,open),arguments_=[],first=open+1;let part=first;
    for(let cursor=first;cursor<end;cursor++){
      const current=list[cursor];
      if(current.type==='punctuation'&&['(','[','{'].includes(current.text)){cursor=closing(list,cursor);continue;}
      if(current.type==='punctuation'&&current.text===','){arguments_.push([part,cursor]);part=cursor+1;}
    }
    arguments_.push([part,end]);if(arguments_.length<2)throw new TypeError('original test registration lost its assertion body');
    const titleEnd=list[arguments_[0][1]-1].end,titleExpression=source.slice(list[first].start,titleEnd);
    const templateTitle=stringData(list[first]),endOffset=list[end].end+(source[list[end].end]===';'?1:0);
    const registration=source.slice(token.start,endOffset),limit=arguments_[2];
    let timeoutMs=5000;
    if(limit){
      if(limit[1]-limit[0]!==1||list[limit[0]].type!=='number')throw new TypeError('original case deadline is no longer a numeric literal');
      timeoutMs=Number(list[limit[0]].text.replaceAll('_',''));
      if(!Number.isSafeInteger(timeoutMs)||timeoutMs<=0)throw new TypeError('invalid original case deadline');
    }
    const instances=titleInstances(list,first,arguments_[0][1]);
    const fixedAuto=/\bruntime[.]auto\(\s*([0-9_]+)\s*\)/.exec(registration);
    for(const[variant,{parameters,title}]of instances.entries())locators.push({id:'stable-compatibility:source-case:'+file+':'+registrationIndex+':'+variant,file,kind:'test',contains:title,
      originalCase:{title,templateTitle,titleExpression,parameters,titleKind:list[first].text[0]==='`'?'template':arguments_[0][1]-first===1?'literal':'expression',
        sourceSha256,timeoutMs,registration:token.text,
        ...(fixedAuto?{auto:Number(fixedAuto[1].replaceAll('_',''))}:{}),
        span:{start:token.start,end:endOffset},byteStart:Buffer.byteLength(source.slice(0,token.start)),
        byteEnd:Buffer.byteLength(source.slice(0,endOffset)),sha256:hash(registration)}});
    registrationIndex++;index=end;
  }
  if(!locators.length)throw new TypeError('original managed suite has no registered semantic cases');
  return locators;
}
