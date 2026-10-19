import {createHash} from 'node:crypto';
import {originalSourceCaseLocators} from './compiler-corpus-managed-cases.mjs';

// Additional selected-product regions are not necessarily named by the older
// stable-feature manifest. Bind each actual transported region, rather than
// borrowing a sibling test's identity or declaring its whole suite covered.
const runtimeRegionPlans=Object.freeze([
  {file:'tests/persistent-zipper.test.mjs',id:'zipper-indexed-ascent',record:'original-program:persistent-zipper-indexed-ascent',
    title:'deep zipper ascent reads indexed ancestor slots without reducing wide parent vectors',
    begin:'    const script = `',end:'\n    `;'},
  {file:'tests/literal-runtime.test.mjs',id:'host-only-shape',record:'original-program:literal-runtime-host-only',
    title:'explicit host-only modules do not link the persistent runtime',
    begin:'    expect(seed).not.toContain(',end:'\n  } finally {'},
  {file:'tests/literal-runtime.test.mjs',id:'portable-codec',record:'original-program:literal-runtime-portable-codec',
    title:'portable closures produce persistent values for the versioned worker codec',
    begin:'    const seedModule = await import(seedOutput);',end:'\n    await Bun.write('},
  {file:'tests/literal-runtime.test.mjs',id:'incomplete-map-input',record:'original-sequence:literal-runtime-invalid-inputs',
    title:'hash-map rejects incomplete pairs in both compilers',
    begin:'  await Bun.write(source, ',end:');\n'},
  {file:'tests/literal-runtime.test.mjs',id:'unbound-portable-input',record:'original-sequence:literal-runtime-invalid-inputs',
    title:'portable closures produce persistent values for the versioned worker codec',
    begin:'await Bun.write(\n      invalid,',end:'\n    );'},
  {file:'tests/language-equality.test.mjs',id:'identity-source-shape',record:'original-program:language-equality-identity-only',
    title:'language equal uses value semantics across compilers and local hosts',
    begin:'    expect(identity).not.toContain(',end:'\n  } finally {'},
  {file:'tests/core-set.test.mjs',id:'source-map',record:'original-program:core-set-source-map',
    title:'Eliscript-authored set algebra compiles and agrees across local hosts',
    begin:'    const sourceMap = JSON.parse(await readFile(`${setModule}.map`, "utf8"));',end:'\n  } finally {'},
  {file:'tests/core-stdlib.test.mjs',id:'complete-protocols',record:'original-program:core-stdlib-complete-protocols',
    title:'Eliscript core modules compile and execute against runtime protocols',
    begin:'    const usage = await import(pathToFileURL(usageModule).href);',end:'\n  } finally {'},
  ...[
    ['core','stable protocol and core algorithms build as one project across Bun and Node'],
    ['utility','stable portable utility modules build as one project across Bun and Node'],
    ['persistent-values','persistent value library builds as one project and executes under Bun and Node'],
    ['value-text','identifier metadata and data text build as one project across Bun and Node'],
    ['public','public state interop result JSON and numeric modules build across hosts'],
  ].map(([id,title])=>({file:'tests/core-stdlib.test.mjs',id:'core-project-'+id,
    record:'original-program:core-project-'+id,title,
    begin:'    expect(report).toMatchObject({',end:'\n  } finally {'})),
]);
export const originalRuntimeSourceSuites=Object.freeze([...new Set(runtimeRegionPlans.map(plan=>plan.file))]);

export function originalRuntimeCaseLocators(file,source){
  if(!originalRuntimeSourceSuites.includes(file))throw new TypeError('unregistered original runtime source suite');
  const cases=originalSourceCaseLocators(file,source),locators=[];
  for(const plan of runtimeRegionPlans.filter(item=>item.file===file)){
    const matches=cases.filter(item=>item.originalCase.title===plan.title);
    if(!matches.length)throw new TypeError('original runtime region lost its source case: '+plan.id);
    for(const[index,locator]of matches.entries()){
      const bound=locator.originalCase;
      const start=source.indexOf(plan.begin,bound.span.start);
      const end=start<0?-1:source.indexOf(plan.end,start+plan.begin.length);
      if(start<bound.span.start||end<start||end+plan.end.length>bound.span.end)
        throw new TypeError('original runtime region left its registered case: '+plan.id);
      const contains=source.slice(start,end);
      locators.push({id:'stable-compatibility:source-region:'+file+':'+plan.id+':'+index,
        file,kind:'test',contains,originalCase:structuredClone(bound),
        originalExecution:{record:plan.record,span:{start,end},
          byteStart:Buffer.byteLength(source.slice(0,start)),byteEnd:Buffer.byteLength(source.slice(0,end)),
          sha256:createHash('sha256').update(contains).digest('hex')}});
    }
  }
  return locators;
}

// Original host-only runtime checks remain mandatory original gate evidence.
// They do not represent execution of a compiled WASM or native algorithm.
const hostRuntimeFiles = new Set([
  'tests/core-order.test.mjs', 'tests/collection-protocol.test.mjs', 'tests/data-text.test.mjs',
  'tests/fixtures/value-hashes.json',
  'tests/identifier.test.mjs', 'tests/metadata.test.mjs',
  'tests/persistent-list.test.mjs', 'tests/persistent-map.test.mjs',
  'tests/persistent-queue.test.mjs', 'tests/persistent-set.test.mjs',
  'tests/persistent-vector.test.mjs', 'tests/protocol.test.mjs',
  'tests/record.test.mjs', 'tests/transducer.test.mjs',
  'tests/transient.test.mjs', 'tests/type.test.mjs',
  'tests/value-semantics.test.mjs',
  ...['collection-protocol', 'core-stdlib', 'data-text', 'metadata',
    'persistent-list', 'persistent-map', 'persistent-queue', 'persistent-set',
    'persistent-vector', 'protocol', 'transducer', 'transient', 'value-hash']
    .map(name => 'tests/fixtures/' + name + '-host.mjs'),
]);

export function isOriginalRuntimeHostOnly(filename, source) {
  if (!hostRuntimeFiles.has(filename) || typeof source !== 'string') return false;
  if (filename === 'tests/fixtures/value-hashes.json') return true;
  if (!/from\s+["'](?:\.\.\/)+runtime\/[^"']+["']/.test(source)) return false;
  // Refuse this classification if an original host grows a compiler or actual
  // language-product injection path. It must then receive a selected adapter.
  return !/(?:bin\/eliscript|buildBackends|buildProject|checkProject|seedCompilerFixture|compile_ir_string|compile_string|\.eli["'`]|process\.argv|ELISCRIPT_.*(?:MODULE|COMPILER))/.test(source);
}

const mixedRuntimeBoundaries=new Map([
  ['tests/persistent-queue.test.mjs','Eliscript persistent queue API compiles and runs on both hosts'],
  ['tests/lazy-sequence.test.mjs','Eliscript lazy sequences agree across compilers and local hosts'],
  ['tests/persistent-sorted.test.mjs','Eliscript sorted API agrees across compilers and local hosts'],
  ['tests/regex.test.mjs','Eliscript regex APIs agree across compilers and local hosts'],
  ['tests/core-text-object.test.mjs','core text/object production artifacts are fixed-point and cross-host'],
  ['tests/core-set.test.mjs','Eliscript-authored set algebra compiles and agrees across local hosts'],
  ['tests/core-stdlib.test.mjs','Eliscript core modules compile and execute against runtime protocols'],
]);

const mixedRuntimeCaseTitles=new Map([
  ['tests/persistent-queue.test.mjs',new Set([
    'persistent queue preserves FIFO order and immutable front operations',
    'persistent queue implements collection value and metadata protocols',
    'persistent queue promotes its rear without traversal or node allocation',
    'persistent queue agrees with a mutable FIFO reference model',
    'persistent queue stays iterative at one million values',
    'persistent queue runtime agrees under Bun and Node',
  ])],
  ['tests/lazy-sequence.test.mjs',new Set([
    'lazy sequences start on demand and share one realized prefix',
    'lazy sequence failures are cached at one stable realization position',
    'lazy cons defers tails and remains stack safe for recursive streams',
    'transducer sequence pulls only enough input and memoizes output',
    'transducer sequence honors zero input and completion output',
    'transducer sequence closes its input when transformation fails',
    'lazy combinators compose infinite inputs without eager realization',
    'lazy combinator family preserves transducer semantics',
    'lazy combinators validate before consuming their inputs',
    'lazy sequence APIs reject malformed producers and calls',
  ])],
  ['tests/persistent-sorted.test.mjs',new Set([
    'persistent sorted maps preserve order immutability and comparator identity',
    'persistent sorted sets retain canonical comparator-equivalent values',
    'sorted collections implement collection value metadata and text protocols',
    'hash and sorted collections share exact logical value semantics',
    'sorted range queries honor inclusive bounds and direction',
    'persistent sorted trees agree with a randomized mutable model',
    'persistent sorted trees keep height work and copying logarithmic',
  ])],
  ['tests/regex.test.mjs',new Set([
    'regex patterns are immutable deterministic values',
    'regex matching preserves captures absence and start offsets',
    'regex sequences are memoized and advance zero-width Unicode matches',
    'regex replacement is global literal and callback driven',
    'regex APIs reject mutable host patterns and malformed calls',
  ])],
  ['tests/core-set.test.mjs',new Set([
    'set conversion and union accept protocol sources with value semantics',
    'intersection and difference preserve left metadata and immutable inputs',
    'set relations are value-semantic and enforce complete arity',
    'relational projection and selection preserve value semantics and metadata',
    'relational rename and inversion handle swaps and traversal collisions',
    'relational indexing drives natural and mapped joins',
    'relational set operations enforce arity and predicate contracts',
  ])],
  ['tests/core-stdlib.test.mjs',new Set([
    'sequence algorithms use protocols and Eliscript truthiness',
    'sequence composition partitioning and tree traversal use protocol sources',
    'finite sequence selection is single-pass, bounded, and nullish-safe',
    'replayable sequence heads and tails preserve bounded source semantics',
    'replayable sequence sources compose lazily with bounded reduction',
    'removing and dropping compose with fresh reduction state',
    'data algorithms return persistent value-semantic maps and vectors',
    'associative data algorithms preserve nested and value-semantic behavior',
    'indexBy uses a transient HAMT builder at scale',
    'protocol standard-library algorithms agree under Bun and Node',
  ])],
  ['tests/core-text-object.test.mjs',new Set([
    'protocol-driven text and object algorithms preserve value boundaries',
    'external protocol values reuse text and keyed algorithms',
    'core object transforms use transient persistent-map construction',
  ])],
]);

export function originalRuntimeOnlyCase(filename,source,contains){
  const boundary=mixedRuntimeBoundaries.get(filename);
  if(!boundary||typeof contains!=='string'||contains.length===0||
    !/from\s+["'](?:\.\.\/)+runtime\//.test(source))return null;
  const end=source.indexOf('test('+JSON.stringify(boundary)+',');
  if(end<0)return null;
  const starts=[...source.matchAll(/^test\(/gm)].map(match=>match.index);
  const candidates=[];
  for(let index=0;index<starts.length;index++){
    const start=starts[index],finish=starts[index+1]??source.length;
    if(start===end)continue;
    const code=source.slice(start,finish);
    if(!code.includes(contains))continue;
    const header=/^test\(("(?:[^"\\]|\\.)*")\s*,/.exec(code);
    if(!header||!mixedRuntimeCaseTitles.get(filename)?.has(JSON.parse(header[1])))continue;
    let occurrence=source.indexOf(contains);
    while(occurrence>=0){
      if(occurrence<start||occurrence+contains.length>finish)return null;
      occurrence=source.indexOf(contains,occurrence+1);
    }
    // This classification applies only to a complete pre-existing runtime case,
    // never the mixed file or a compiler setup helper shared by both regions.
    if(/(?:bin\/eliscript|\.eli["'`]|compileFamily|compile_ir_string|compile_string|seedCompilerFixture|buildBackends|buildProject|checkProject|importGeneratedModule|generatedModules)/.test(code))return null;
    candidates.push({start,end:finish});
  }
  return candidates.length===1?candidates[0]:null;
}

const captureModuleOutput = `async function originalModuleOutput(filename) {
  const chunks = [];
  const stream = new Writable({write(chunk, encoding, complete) {chunks.push(Buffer.from(chunk));complete();}});
  const previous = globalThis.console;
  globalThis.console = new Console({stdout:stream,stderr:process.stderr,colorMode:false});
  try {await import(pathToFileURL(filename).href);}
  finally {globalThis.console = previous;stream.end();}
  return Buffer.concat(chunks).toString('utf8');
}`;

function writtenOriginalSource(original,variable,from,region){
  const escaped=variable.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const opening=new RegExp('await Bun[.]write\\(\\s*'+escaped+',\\s*').exec(original.slice(from));
  if(!opening)throw new TypeError('original inline source write changed: '+variable);
  const start=from+opening.index,tail=original.slice(start+opening[0].length);
  const closing=/\n\s*\);/.exec(tail);
  if(!closing)throw new TypeError('original inline source write has no closing boundary');
  const bound=region(original,opening[0],closing[0],start);
  const expression=bound.text.slice(opening[0].length).trim().replace(/,$/,'');
  const tokens=expression.match(/"(?:[^"\\]|\\.)*"/g)??[];
  if(!tokens.length||expression.replace(/"(?:[^"\\]|\\.)*"/g,'').replace(/\s+/g,'')!=='+'.repeat(tokens.length-1))
    throw new TypeError('original inline source is not a frozen string concatenation');
  return{source:tokens.map(value=>JSON.parse(value)).join(''),region:bound};
}

// Compilation setup is performed by the selected compiler session. This host
// retains every original output, own-property, callback and physical-map check.
export async function addOriginalStdlibRuntimeAdapters({add, records, locators, text, file, region, data,bootstrapSources}) {
  const publish=add,byLocator=new Map(locators.map(locator=>[locator.id,locator]));
  add=record=>{
    record.coverage=record.coverage.filter(id=>{
      const execution=byLocator.get(id)?.originalExecution;
      return !execution||execution.record===record.id;
    });
    for(const locator of locators)if(locator.originalExecution?.record===record.id&&!record.coverage.includes(locator.id))
      throw new TypeError('original runtime record omitted its exact executed region: '+record.id);
    if(!record.coverage.length)throw new TypeError('original runtime record has no executed source coverage: '+record.id);
    publish(record);
  };
  const plans = [
    {name:'sequence',library:'sequence',assertion:'portable sequence library compiles and executes as an ESM module'},
    {name:'object',library:'object',assertion:'portable object and data libraries preserve immutable own-property semantics'},
    {name:'text',library:'text',assertion:'portable text library compiles and executes as an ESM module'},
  ];
  const mapped = [];
  for (const plan of plans) {
    const suite = 'tests/stdlib-' + plan.name + '.test.mjs';
    if (!locators.some(item => item.file === suite)) continue;
    const original = await text(suite);
    const body = region(original, '    expect(JSON.parse(executed)).toEqual(', '\n  } finally {');
    const coverage = locators.filter(item => item.file === suite && typeof item.contains === 'string' &&
      (plan.assertion + '\n' + body.text).includes(item.contains)).map(item => item.id);
    if (!coverage.length) throw new TypeError('original stdlib host has no bound assertion locator: ' + suite);
    const source = 'tests/fixtures/' + plan.name + '-usage.eli';
    const originalPlan = records.find(record => record.id === 'stable-compatibility:program:' + source);
    if (!originalPlan) throw new Error('original stdlib program graph is unavailable: ' + source);
    const hostSource = [
      'import {expect} from "bun:test";',
      'import {resolve} from "node:path";',
      'import {pathToFileURL} from "node:url";',
      'import {Console} from "node:console";',
      'import {Writable} from "node:stream";',
      'const directory=resolve(process.argv[2],"tests/fixtures");',
      'const usageModule=resolve(directory,' + JSON.stringify(plan.name + '-usage.mjs') + ');',
      'const ' + plan.library + 'Module=resolve(directory,' + JSON.stringify(plan.library + '.mjs') + ');',
      ...(plan.name === 'object' ? ['const dataModule=resolve(directory,"data.mjs");'] : []),
      captureModuleOutput,
      'const executed=await originalModuleOutput(usageModule);',
      body.text,
      '',
    ].join('\n');
    add({id:'original-program:stdlib-' + plan.name + '-complete-host',kind:'project',coverage,
      modules:structuredClone(originalPlan.modules),entry:originalPlan.entry,
      request:{...structuredClone(originalPlan.request),phased:true},
      execution:{kind:'original-program',host:'tests/__eliscript_original_stdlib_' + plan.name + '.mjs',
        hostSource,arguments:[{directory:true}],aliases:true,requiresBun:true,compilerSourceMaps:true},
      expected:{kind:'seed-program',oracleRequired:true,stdout:''},
      original:{manifest:'stable-compatibility',suite,fixture:source,host:suite,
        sourceSha256:(await file(suite)).sha256,
        regions:[body].map(({start,end,byteStart,byteEnd,sha256}) => ({start,end,byteStart,byteEnd,sha256})),
        originalAssertion:plan.assertion,
        setupAssertions:'original compiler CLI silence and project transport remain required by the original gate'},
    });
    mapped.push(suite);
  }
  for (const plan of [
    {name:'function',assertions:[
      'portable function combinators compile and agree across local hosts',
      'predicate combinators preserve Lisp truth and short-circuit order',
    ],directBodies:2},
    {name:'deferred',assertions:[
      'deferred computations compile and agree across local hosts',
      'delay and memoize retry failures without caching partial state',
    ],directBodies:1},
  ]) {
    const suite='tests/stdlib-'+plan.name+'.test.mjs';
    if(!locators.some(item=>item.file===suite))continue;
    const original=await text(suite),source='tests/fixtures/'+plan.name+'-usage.eli';
    const originalPlan=records.find(record=>record.id==='stable-compatibility:program:'+source);
    if(!originalPlan)throw new Error('original stdlib program graph is unavailable: '+source);
    const expectedRegion=region(original,'    const expected = {',';\n    for (const host');
    const expected=data(expectedRegion.text.slice('    const expected = '.length));
    const bodies=[];let offset=0;
    for(let index=0;index<plan.directBodies;index++){
      const body=region(original,'    const module = await import(', '\n  } finally {',offset);
      bodies.push(body);offset=body.end;
    }
    const allCode=plan.assertions.join('\n')+'\n'+expectedRegion.text+'\n'+bodies.map(body=>body.text).join('\n');
    const coverage=locators.filter(item=>item.file===suite&&typeof item.contains==='string'&&allCode.includes(item.contains)).map(item=>item.id);
    if(!coverage.length)throw new TypeError('original stdlib host has no bound assertion locator: '+suite);
    const origin={manifest:'stable-compatibility',suite,fixture:source,host:suite,sourceSha256:(await file(suite)).sha256,
      regions:[expectedRegion,...bodies].map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256})),
      setupAssertions:'original project build-report and compiler CLI setup remain required by the original gate'};
    for(const hostRuntime of ['bun','node'])add({
      id:'original-program:stdlib-'+plan.name+'-output-'+hostRuntime,kind:'project',coverage,
      modules:structuredClone(originalPlan.modules),entry:originalPlan.entry,request:{...structuredClone(originalPlan.request),phased:true},
      execution:{kind:'original-program',host:null,hostRuntime,aliases:true,requiresBun:hostRuntime==='bun'},
      expected:{kind:'seed-program',oracleRequired:true,stdoutJSON:structuredClone(expected)},original:structuredClone(origin),
    });
    add({id:'original-program:stdlib-'+plan.name+'-complete-callables',kind:'project',coverage,
      modules:structuredClone(originalPlan.modules),entry:originalPlan.entry,
      request:{...structuredClone(originalPlan.request),phased:true},
      execution:{kind:'original-program',host:'tests/__eliscript_original_stdlib_'+plan.name+'_callables.mjs',
        hostSource:[
          'import {expect} from "bun:test";',
          'import {resolve} from "node:path";',
          'import {pathToFileURL} from "node:url";',
          'const outputRoot=resolve(process.argv[2],"tests/fixtures/stdlib");',
          ...bodies.map(body=>'{\n'+body.text+'\n}'),'',
        ].join('\n'),arguments:[{directory:true}],aliases:true,requiresBun:true,hostRuntime:'bun'},
      expected:{kind:'seed-program',oracleRequired:true,stdout:''},original:structuredClone(origin),
    });
    mapped.push(suite);
  }
  for(const plan of [
    {name:'value',suite:'portable-value-semantics',helperStart:'function nextRandom(state)',multiModules:true,tests:[
      'portable persistent collections preserve nested undefined values',
      'optimized and portable persistent Lists share frozen hash semantics',
      'Eliscript-authored value semantics preserve generated cross-family invariants',
      'Eliscript-authored value hashing traverses one million persistent values',
    ]},
    {name:'persistent-list',helperStart:'function nextRandom(state)',tests:[
      'Eliscript-authored persistent list preserves generated history',
      'Eliscript-authored persistent list shares a million-node suffix',
    ]},
    {name:'persistent-vector',helperStart:'function nodeCount(node, level)',vector:true,tests:[
      'Eliscript-authored persistent vector preserves generated history',
      'Eliscript-authored persistent vector keeps million-value trie bounds',
    ]},
    {name:'persistent-map',helperStart:'function integerHash(value)',tests:[
      'Eliscript-authored HAMT Map preserves generated value-key histories',
      'Eliscript-authored HAMT Map promotes and demotes measured layouts',
      'Eliscript-authored HAMT Map shares the million-key update path',
    ]},
    {name:'persistent-set',helperStart:'function integerHash(value)',tests:[
      'Eliscript-authored persistent Set preserves generated value-key histories',
      'Eliscript-authored persistent Set preserves algebra and HAMT layouts',
      'Eliscript-authored persistent Set shares the million-member update path',
    ]},
  ]){
    const suite='tests/'+(plan.suite??'portable-'+plan.name)+'.test.mjs';
    if(!locators.some(item=>item.file===suite))continue;
    const original=await text(suite),helpers=region(original,plan.helperStart,'\ntest(');
    const originalPlan=records.find(record=>record.id==='stable-compatibility:program:stdlib/'+plan.name+'.eli');
    if(!originalPlan)throw new Error('original portable collection graph is unavailable: '+plan.name);
    for(const assertion of plan.tests){
      const prefix='test('+JSON.stringify(assertion)+', async () => {\n';
      const body=region(original,prefix,'\n}, '),suffix=original.slice(body.end);
      const deadline=/^\n}, ([0-9_]+)\);/.exec(suffix);
      if(!deadline)throw new TypeError('original portable collection deadline changed: '+assertion);
      const timeoutMs=Number(deadline[1].replaceAll('_',''));
      let code=body.text.slice(prefix.length);const regions=[helpers,body];
      if(plan.vector){
        const modulePath=region(code,'  const modulePath = resolve(','\n  const vectorModule = await import(');
        code=code.slice(0,modulePath.start)+'  const modulePath=selectedModulePath;'+code.slice(modulePath.end);
        // The complete original body remains bound even though its module
        // location is transported from the actual selected product.
      }
      const coverage=locators.filter(item=>item.file===suite&&typeof item.contains==='string'&&
        (assertion+'\n'+helpers.text+'\n'+body.text).includes(item.contains)).map(item=>item.id);
      if(!coverage.length)throw new TypeError('original collection case has no bound assertion locator: '+assertion);
      add({id:'original-program:portable-'+plan.name+'-'+plan.tests.indexOf(assertion),kind:'project',coverage,
        modules:structuredClone(originalPlan.modules),entry:originalPlan.entry,
        request:{...structuredClone(originalPlan.request),phased:true},
        execution:{kind:'original-program',host:'tests/__eliscript_original_'+plan.name+'_'+plan.tests.indexOf(assertion)+'.mjs',
          hostSource:[
            'import {expect} from "bun:test";',
            'import {resolve} from "node:path";',
            'import {pathToFileURL} from "node:url";',
            'const selectedModulePath=resolve(process.argv[2],'+JSON.stringify(originalPlan.entry)+');',
            'async function importGeneratedModule(label){return import(pathToFileURL(selectedModulePath).href+"?original="+encodeURIComponent(label));}',
            ...(plan.multiModules?[
              'const runtimeRoot=process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT;',
              'const {persistentList:runtimePersistentList}=await import(pathToFileURL(resolve(runtimeRoot,"runtime/core/list.mjs")).href);',
              'const {hashValue:runtimeHashValue}=await import(pathToFileURL(resolve(runtimeRoot,"runtime/core/value.mjs")).href);',
              'async function generatedModules(label){const result={};for(const name of ["bit","persistent-list","persistent-vector","persistent-map","persistent-set","value"]){result[name]=await import(pathToFileURL(resolve(process.argv[2],name+".mjs")).href+"?original="+encodeURIComponent(label));}return result;}',
            ]:[]),
            helpers.text,code,'',
          ].join('\n'),arguments:[{directory:true}],aliases:true,requiresBun:true,hostRuntime:'bun',timeoutMs},
        expected:{kind:'seed-program',oracleRequired:true,stdout:''},
        original:{manifest:'stable-compatibility',suite,fixture:'stdlib/'+plan.name+'.eli',host:suite,
          sourceSha256:(await file(suite)).sha256,originalAssertion:assertion,
          regions:regions.map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256}))},
      });
    }
  }
  for(const plan of [
    {name:'persistent-list',suite:'portable-persistent-list',assertion:'Eliscript-authored persistent list compiles and agrees across hosts',begin:'    for (const report of reports) {'},
    {name:'persistent-vector',suite:'portable-persistent-vector',assertion:'Eliscript-authored persistent vector compiles and agrees across hosts',begin:'    for (const report of hostReports) {'},
    {name:'persistent-map',suite:'portable-persistent-map',assertion:'Eliscript-authored HAMT Map compiles and agrees across hosts'},
    {name:'persistent-set',suite:'portable-persistent-set',assertion:'Eliscript-authored persistent Set compiles and agrees across hosts'},
    {name:'numeric',suite:'portable-numeric',assertion:'portable numeric functions preserve exact Number and safe-integer contracts'},
    {name:'json',suite:'portable-json',assertion:'portable JSON values are strict, canonical, bounded, and self-hosted'},
    {name:'result',suite:'portable-result',assertion:'portable Result values are byte-identical and short-circuit at scale'},
    {name:'metadata',suite:'portable-metadata',assertion:'Eliscript-authored metadata is byte-identical and portable'},
    {name:'data-text',suite:'portable-data-text',assertion:'portable canonical data text is byte-identical and host-independent'},
    {name:'value',suite:'portable-value-semantics',assertion:'Eliscript-authored value semantics compile and agree across hosts'},
    {name:'persistent-queue',suite:'persistent-queue',assertion:'Eliscript persistent queue API compiles and runs on both hosts',begin:'    expect(reports[1]).toEqual(reports[0]);',maps:false},
    {name:'lazy-sequence',suite:'lazy-sequence',source:'tests/fixtures/lazy-sequence.eli',assertion:'Eliscript lazy sequences agree across compilers and local hosts',maps:false},
    {name:'persistent-sorted',suite:'persistent-sorted',source:'tests/fixtures/persistent-sorted.eli',assertion:'Eliscript sorted API agrees across compilers and local hosts',maps:false},
    {name:'regex',suite:'regex',source:'tests/fixtures/regex.eli',assertion:'Eliscript regex APIs agree across compilers and local hosts',maps:false},
    {name:'persistent-tree-walk',suite:'persistent-tree-walk',source:'tests/fixtures/persistent-tree-walk.eli',assertion:'persistent tree walk is stack safe and agrees across compilers and hosts',maps:false},
    {name:'persistent-zipper',suite:'persistent-zipper',source:'tests/fixtures/persistent-zipper.eli',assertion:'persistent zippers navigate edit and rebuild stack-safe trees',maps:false},
    {name:'core-text-object',suite:'core-text-object',source:'stdlib/core/text.eli',assertion:'core text/object production artifacts are fixed-point and cross-host',maps:false},
    {name:'interop-js',suite:'interop-js',source:'stdlib/interop/js.eli',mapRoot:'stdlib',assertion:'Eliscript JS interop preserves explicit host and persistent boundaries'},
    {name:'declarative-protocol',suite:'declarative-protocol',source:'tests/fixtures/declarative-protocol.eli',assertion:'declarative protocols preserve protocol identity and host dispatch'},
    {name:'declarative-record',suite:'declarative-record',source:'tests/fixtures/declarative-record.eli',assertion:'defrecord is identical across seed and self-hosted compilers',maps:false},
    {name:'declarative-type',suite:'declarative-type',source:'tests/fixtures/declarative-type.eli',assertion:'deftype and reify agree across compilers and hosts',maps:false},
    {name:'multimethod',suite:'multimethod',assertion:'Eliscript multimethods dispatch on values with persistent method snapshots'},
    {name:'core-expression-forms',suite:'core-expression-forms',source:'tests/fixtures/core-expression-forms.eli',assertion:'core expression forms preserve threading and single-evaluation semantics',maps:false},
    {name:'local-recursive-functions',suite:'local-recursive-functions',source:'tests/fixtures/local-recursive-functions.eli',assertion:'local recursive functions agree across compilers and local hosts',maps:false},
    {name:'multi-arity',suite:'multi-arity',source:'tests/fixtures/multi-arity.eli',assertion:'multi-arity functions agree across compilers and local hosts',maps:false},
    {name:'value-dispatch',suite:'value-dispatch',source:'tests/fixtures/value-dispatch.eli',assertion:'case and condp agree across compilers and local hosts',maps:false},
    {name:'literal-runtime',suite:'literal-runtime',source:'tests/fixtures/literal-runtime.eli',assertion:'persistent literals and quoted data preserve language value categories',begin:'    expect(nodeReport).toEqual(bunReport);'},
    {name:'atom',suite:'atom',source:'stdlib/state/atom.eli',assertion:'Eliscript Atom preserves ordered single-transition state semantics'},
    {name:'eliscript-protocol',suite:'eliscript-protocol',source:'stdlib/core/protocol.eli',assertion:'Eliscript-authored protocol policy preserves open dispatch semantics'},
    ...['vector','map','set'].map(collection=>({name:'persistent-core-exit-'+collection,suite:'persistent-core-exit',source:'stdlib/value.eli',baseId:'persistent-core-exit-'+collection,idSuffix:collection,locals:'const collection='+JSON.stringify(collection)+';',assertion:'persistent collection core closes its all-host million-value exit gate',begin:'      expect(reports[1]).toEqual(reports[0]);',end:'\n    }\n  } finally {',maps:false})),
    {name:'language-equality',suite:'language-equality',source:'tests/fixtures/language-equality.eli',assertion:'language equal uses value semantics across compilers and local hosts',begin:'    const expected = {',end:'    const identitySource ='},
  ]){
    const suite='tests/'+plan.suite+'.test.mjs';
    if(!locators.some(item=>item.file===suite))continue;
    const original=await text(suite),testStart=original.indexOf('test('+JSON.stringify(plan.assertion)+',');
    if(testStart<0)throw new TypeError('original portable host assertion changed: '+suite);
    const body=region(original,plan.begin??'    for (const report of reports) expect(report).toEqual(reports[0]);',plan.end??'\n  } finally {',testStart);
    const firstEnd=original.slice(body.end),deadline=/^[\s\S]*?\n}, ([0-9_]+)\);/.exec(firstEnd);
    if(!deadline)throw new TypeError('original portable host deadline changed: '+suite);
    const source=plan.source??'stdlib/'+plan.name+'.eli';
    const originalPlan=records.find(record=>record.id==='stable-compatibility:program:'+(plan.baseId??source));
    if(!originalPlan?.execution.host||typeof originalPlan.execution.hostSource!=='string')throw new Error('original portable host graph is unavailable: '+plan.name);
    const fixture=originalPlan.execution.host;
    let assertionCode=body.text;
    let assertionPrefix='';
    const transportRegions=[];
    if(plan.name==='literal-runtime'){
      const shape=region(original,'    const javascript =','    const bunReport =',testStart);
      assertionPrefix=shape.text.replace('readFile(seedOutput, "utf8")',
        'readFile(resolve(javascriptProductRoot,'+JSON.stringify(originalPlan.entry)+'), "utf8")');
      transportRegions.push(shape);
    }
    if(plan.name==='language-equality'){
      const shape=region(original,'    expect(seed.match(', '\n    const expected =',testStart);
      assertionPrefix='{const seed=await readFile(resolve(javascriptProductRoot,'+JSON.stringify(originalPlan.entry)+'),"utf8");\n'+shape.text+'\n}';
      transportRegions.push(shape);
    }
    if(plan.name==='eliscript-protocol')assertionCode=assertionCode.replace('`${seed}.map`','`${seedModule}.map`');
    if(plan.name==='multimethod')assertionCode=assertionCode
      .replace('"multimethod.eli.map"','"multimethod.mjs.map"')
      .replace('"hierarchy.eli.map"','"hierarchy.mjs.map"');
    if(['numeric','json','result'].includes(plan.name)){
      const compileStart=assertionCode.indexOf('    await runSuccessful([\n      projectBuilder,');
      const prunedStart=assertionCode.indexOf('    const pruned =',compileStart);
      const mapStart=assertionCode.indexOf('    const sourceMap =',prunedStart);
      if(compileStart<0||prunedStart<0||mapStart<0)throw new TypeError('original portable pruning boundaries changed: '+suite);
      const pruning=region(original,'    const pruned =','    const sourceMap =',body.start+compileStart);
      const portableEntry={numeric:'gcd',json:'parse-json',result:'unwrap-or'}[plan.name];
      const pruningCoverage=locators.filter(item=>item.file===suite&&typeof item.contains==='string'&&
        (plan.assertion+'\n'+pruning.text).includes(item.contains)).map(item=>item.id);
      add({id:'original-program:'+plan.suite+'-pruned',kind:'project',coverage:pruningCoverage,
        modules:structuredClone(originalPlan.modules),entry:originalPlan.entry,
        request:{...structuredClone(originalPlan.request),phased:true,portableEntries:[portableEntry]},
        execution:{kind:'original-program',host:'tests/__eliscript_original_'+plan.suite+'_pruned.mjs',
          hostSource:[
            'import {expect} from "bun:test";',
            'import {resolve} from "node:path";',
            'const prunedDirectory=process.env.ELISCRIPT_ORIGINAL_JAVASCRIPT_PRODUCT_ROOT;',
            'if(!prunedDirectory)throw new Error("original pruning assertions require the actual selected compiler JavaScript artifact");',
            pruning.text,'',
          ].join('\n'),arguments:[{directory:true}],aliases:true,requiresBun:true,hostRuntime:'bun',
          compilerSourceMaps:true,timeoutMs:Number(deadline[1].replaceAll('_',''))},
        expected:{kind:'seed-program',oracleRequired:true,stdout:''},
        original:{manifest:'stable-compatibility',suite,fixture:source,host:suite,
          sourceSha256:(await file(suite)).sha256,originalAssertion:plan.assertion,
          regions:[pruning].map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256}))},
      });
      assertionCode=assertionCode.slice(0,compileStart)+assertionCode.slice(mapStart);
      if(plan.name==='json')assertionCode=assertionCode.replace(
        'resolve(seedDirectory, "json.mjs")','resolve(javascriptProductRoot, "json.mjs")');
    }
    const runtimeImports=[...original.matchAll(/^import\s+[^;]+;/gm)]
      .map(match=>match[0]).filter(code=>/from\s+["']\.\.\/runtime\//.test(code));
    const coverage=locators.filter(item=>item.file===suite&&typeof item.contains==='string'&&
      (plan.assertion+'\n'+body.text).includes(item.contains)).map(item=>item.id);
    if(!coverage.length)throw new TypeError('original portable host has no bound assertion locator: '+suite);
    const originalArguments=originalPlan.execution.arguments??(originalPlan.execution.argumentModules??[originalPlan.entry]).map(module=>({module}));
    const hostSource=[
      'import {expect} from "bun:test";',
      'import {resolve,dirname} from "node:path";',
      'import {readFile} from "node:fs/promises";',
      'const root=process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT;',
      ...runtimeImports,
      'if(!root)throw new Error("original portable host requires its source root");',
      'const product=process.argv[2];',
      'const fixture=resolve(product,'+JSON.stringify(fixture)+');',
      'const moduleArguments='+JSON.stringify(originalArguments)+'.map(item=>item.directory===true?product:Object.hasOwn(item,"literal")?item.literal:resolve(product,item.module));',
      ...(plan.locals?[plan.locals]:[]),
      'const seedModule=resolve(product,'+JSON.stringify(originalPlan.entry)+');',
      'const seed=seedModule,seedSet=seedModule,seedDirectory=resolve(product,'+JSON.stringify(plan.mapRoot??'.')+');',
      'const javascriptProductRoot=process.env.ELISCRIPT_ORIGINAL_JAVASCRIPT_PRODUCT_ROOT;',
      'const originalChildren=new Set();',
      'for(const signal of ["SIGINT","SIGTERM"])process.once(signal,()=>{for(const child of originalChildren)child.kill(signal);process.exitCode=signal==="SIGINT"?130:143;});',
      'async function originalReport(host){',
      '  const bun=host==="bun",args=bun?["--preload",resolve(root,"tests/fixtures/compiled-eli-bun-preload.mjs")]:["--experimental-loader",resolve(root,"tests/fixtures/compiled-eli-node-loader.mjs")];',
      '  if(bun&&process.env.ELISCRIPT_ORIGINAL_PROGRAM_CONTEXT)args.push("--preload",resolve(root,"tools/backends/compiler-corpus-host-context.mjs"));',
      '  args.push(fixture,...moduleArguments);',
      '  const child=Bun.spawn([bun?"bun":process.env.NODE??"node",...args],{cwd:root,env:process.env,stdout:"pipe",stderr:"pipe"});',
      '  originalChildren.add(child);',
      '  const [status,stdout,stderr]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]).finally(()=>originalChildren.delete(child));',
      '  if(status!==0)throw new Error(stderr.trim()||stdout.trim()||"original portable host exited with "+status);',
      '  return JSON.parse(stdout);',
      '}',
      'const reports=[await originalReport("bun"),await originalReport("node")],hostReports=reports;',
      'const bunReport=reports[0],nodeReport=reports[1];',
      'const BUN="bun",NODE="node",seedOutput=seedModule,selfOutput=seedModule;',
      'async function execute(host){return reports[host==="bun"?0:1];}',
      assertionPrefix,assertionCode,
      'console.log(JSON.stringify(reports));','',
    ].join('\n');
    add({id:'original-program:'+plan.suite+'-complete-hosts'+(plan.idSuffix?'-'+plan.idSuffix:''),kind:'project',coverage,
      modules:structuredClone(originalPlan.modules),entry:originalPlan.entry,
      request:{...structuredClone(originalPlan.request),phased:true,
        hostSources:[...(originalPlan.request.hostSources??[]),{id:fixture,filename:fixture,source:originalPlan.execution.hostSource}]},
      execution:{kind:'original-program',host:'tests/__eliscript_original_'+plan.suite+'.mjs',hostSource,
        arguments:[{directory:true}],aliases:true,requiresBun:true,hostRuntime:'bun',
        compilerSourceMaps:plan.maps!==false,childProcesses:'inherit-selected-artifact',timeoutMs:Number(deadline[1].replaceAll('_',''))},
      expected:{kind:'seed-program',oracleRequired:true},
      original:{manifest:'stable-compatibility',suite,fixture:source,host:fixture,
        sourceSha256:(await file(suite)).sha256,originalAssertion:plan.assertion,
        regions:[body,...transportRegions].map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256})),
        setupAssertions:'original compiler and portable CLI byte/map equality remain required by the original gate'},
    });
    mapped.push(suite);
  }
  {
    const suite='tests/persistent-zipper.test.mjs';
    const assertion='deep zipper ascent reads indexed ancestor slots without reducing wide parent vectors';
    if(locators.some(item=>item.file===suite)){
      const original=await text(suite),start=original.indexOf('test('+JSON.stringify(assertion)+',');
      if(start<0)throw new TypeError('original indexed zipper assertion changed');
      const script=region(original,'    const script = `','\n    `;',start);
      let code=script.text.slice('    const script = `'.length);
      // Only original filesystem specifiers are transported. Every original
      // indexed-ascent operation, monkeypatch, depth and assertion stays intact.
      code=code.replace(/import (\{[^}]+\}) from \$\{JSON\.stringify\(resolve\(root,"(runtime\/[^"\n]+)"\)\)\};/g,
        (_,bindings,path)=>'const '+bindings+'=await import(pathToFileURL(resolve(product,'+JSON.stringify(path)+')).href);');
      code=code.replace('${JSON.stringify(resolve(seedDirectory,"stdlib/core/zipper.eli"))}',
        'pathToFileURL(resolve(product,"stdlib/core/zipper.mjs")).href');
      const source='tests/fixtures/persistent-zipper.eli';
      const originalPlan=records.find(record=>record.id==='stable-compatibility:program:'+source);
      if(!originalPlan)throw new Error('original indexed zipper graph is unavailable');
      const tail=original.slice(script.end),deadline=/^\n    `;[\s\S]*?\n}, ([0-9_]+)\);/.exec(tail);
      if(!deadline)throw new TypeError('original indexed zipper deadline changed');
      const coverage=locators.filter(item=>item.file===suite&&typeof item.contains==='string'&&
        (assertion+'\n'+script.text).includes(item.contains)).map(item=>item.id);
      add({id:'original-program:persistent-zipper-indexed-ascent',kind:'project',coverage,
        modules:structuredClone(originalPlan.modules),entry:originalPlan.entry,
        request:{...structuredClone(originalPlan.request),phased:true},
        execution:{kind:'original-program',host:'tests/__eliscript_original_zipper_indexed_ascent.mjs',
          hostSource:'import {resolve} from "node:path";\nimport {pathToFileURL} from "node:url";\nconst product=process.argv[2];\n'+code+'\n',
          arguments:[{directory:true}],aliases:true,requiresBun:true,hostRuntime:'bun',
          timeoutMs:Number(deadline[1].replaceAll('_',''))},
        expected:{kind:'seed-program',oracleRequired:true,stdout:''},
        original:{manifest:'stable-compatibility',suite,fixture:source,host:suite,
          originalAssertion:assertion,sourceSha256:(await file(suite)).sha256,
          regions:[script].map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256}))},
      });
    }
  }
  {
    const suite='tests/literal-runtime.test.mjs';
    if(locators.some(item=>item.file===suite)){
      const original=await text(suite),base=records.find(record=>record.id==='stable-compatibility:program:tests/fixtures/literal-runtime.eli');
      if(!base)throw new Error('original literal runtime graph is unavailable');
      const sourceOnlyAssertion='explicit host-only modules do not link the persistent runtime';
      const sourceOnlyStart=original.indexOf('test('+JSON.stringify(sourceOnlyAssertion)+',');
      const sourceOnly=writtenOriginalSource(original,'source',sourceOnlyStart,region);
      const sourceOnlyBody=region(original,'    expect(seed).not.toContain(', '\n  } finally {',sourceOnly.region.end);
      const entry='tests/fixtures/host-only.mjs';
      const coverage=locators.filter(item=>item.file===suite&&typeof item.contains==='string'&&
        (sourceOnlyAssertion+'\n'+sourceOnlyBody.text).includes(item.contains)).map(item=>item.id);
      add({id:'original-program:literal-runtime-host-only',kind:'project',coverage,
        modules:[{id:entry,filename:'host-only.eli',source:sourceOnly.source}],entry,
        request:{...structuredClone(base.request),entries:[entry]},
        execution:{kind:'original-program',host:'tests/__eliscript_original_host_only_shape.mjs',
          hostSource:[
            'import {expect} from "bun:test";',
            'import {resolve} from "node:path";',
            'import {readFile} from "node:fs/promises";',
            'const companion=process.env.ELISCRIPT_ORIGINAL_JAVASCRIPT_PRODUCT_ROOT;',
            'if(!companion)throw new Error("original source assertions require the actual selected compiler JavaScript artifact");',
            'const seed=await readFile(resolve(companion,'+JSON.stringify(entry)+'),"utf8");',
            sourceOnlyBody.text,'',
          ].join('\n'),arguments:[{directory:true}],aliases:true,requiresBun:true,hostRuntime:'bun',
          compilerSourceMaps:true,timeoutMs:60000},expected:{kind:'seed-program',oracleRequired:true,stdout:''},
        original:{manifest:'stable-compatibility',suite,host:suite,originalAssertion:sourceOnlyAssertion,
          sourceSha256:(await file(suite)).sha256,
          regions:[sourceOnly.region,sourceOnlyBody].map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256}))},
      });
      const assertion='portable closures produce persistent values for the versioned worker codec';
      const start=original.indexOf('test('+JSON.stringify(assertion)+',');
      const portable=writtenOriginalSource(original,'source',start,region);
      const invalid=writtenOriginalSource(original,'invalid',portable.region.end,region);
      const incompleteAssertion='hash-map rejects incomplete pairs in both compilers';
      const incompleteStart=original.indexOf('test('+JSON.stringify(incompleteAssertion)+',');
      if(incompleteStart<0)throw new TypeError('original incomplete map assertion changed');
      const incompletePrefix='  await Bun.write(source, ';
      const incomplete=region(original,incompletePrefix,');\n',incompleteStart);
      const incompleteSource=data(incomplete.text.slice(incompletePrefix.length));
      if(typeof incompleteSource!=='string')throw new TypeError('original incomplete map input is not source text');
      const body=region(original,'    const seedModule = await import(seedOutput);','\n    await Bun.write(',portable.region.end);
      const shape=region(original,'    expect(await readFile(seedOutput, "utf8"))\n      .toContain(', '    const seedModule =',portable.region.end);
      const moduleId='tests/fixtures/portable.mjs';
      const runtimeImports=[...original.matchAll(/^import\s+[^;]+;/gm)]
        .map(match=>match[0]).filter(code=>/from\s+["']\.\.\/runtime\//.test(code));
      add({id:'original-program:literal-runtime-portable-codec',kind:'project',
        coverage:locators.filter(item=>item.file===suite&&typeof item.contains==='string'&&
          (assertion+'\n'+body.text).includes(item.contains)).map(item=>item.id),
        modules:[{id:moduleId,filename:'portable.eli',source:portable.source}],entry:moduleId,
        request:{...structuredClone(base.request),entries:[moduleId],portableEntries:['build']},
        execution:{kind:'original-program',host:'tests/__eliscript_original_portable_codec.mjs',
          hostSource:[
            'import {expect} from "bun:test";',
            'import {resolve} from "node:path";',
            'import {pathToFileURL} from "node:url";',
            'import {readFile} from "node:fs/promises";',
            ...runtimeImports,
            'const referenceRoot=process.env.ELISCRIPT_ORIGINAL_REFERENCE_PRODUCT_ROOT;',
            'if(!referenceRoot)throw new Error("original dual-compiler assertions require an independently emitted reference artifact");',
            'const seedOutput=pathToFileURL(resolve(referenceRoot,'+JSON.stringify(moduleId)+')).href;',
            'const selfOutput=pathToFileURL(resolve(process.argv[2],'+JSON.stringify(moduleId)+')).href;',
            '{const seedOutput=resolve(process.env.ELISCRIPT_ORIGINAL_JAVASCRIPT_PRODUCT_ROOT,'+JSON.stringify(moduleId)+');\n'+shape.text+'\n}',body.text,'',
          ].join('\n'),arguments:[{directory:true}],aliases:true,requiresBun:true,hostRuntime:'bun',referenceArtifact:true,compilerSourceMaps:true,timeoutMs:60000},
        expected:{kind:'seed-program',oracleRequired:true,stdout:''},
        original:{manifest:'stable-compatibility',suite,host:suite,originalAssertion:assertion,
          sourceSha256:(await file(suite)).sha256,
          regions:[portable.region,shape,body].map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256}))},
      });
      add({id:'original-sequence:literal-runtime-invalid-inputs',kind:'sequence',
        coverage:locators.filter(item=>item.file===suite&&typeof item.contains==='string'&&
          (incompleteAssertion+'\n'+assertion+'\n'+incomplete.text+'\n'+invalid.region.text).includes(item.contains)).map(item=>item.id),
        original:{manifest:'stable-compatibility',suite,sourceSha256:(await file(suite)).sha256,
          regions:[incomplete,invalid.region].map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256}))},
        steps:[
          {id:'incomplete-map',request:{operation:'compile',source:incompleteSource,filename:'invalid.eli'},
            error:{contains:'hash-map expects complete key/value pairs'}},
          {id:'unbound-portable',request:{operation:'compile',source:invalid.source,filename:'invalid.eli',portableEntries:['build']},
            error:{contains:'unbound symbol missing'}},
        ],expected:{kind:'sequence'},
      });
    }
  }
  {
    const suite='tests/language-equality.test.mjs';
    if(locators.some(item=>item.file===suite)){
      const original=await text(suite),start=original.indexOf('    const identitySource =');
      const source=writtenOriginalSource(original,'identitySource',start,region);
      const body=region(original,'    expect(identity).not.toContain(', '\n  } finally {',source.region.end);
      const entry='tests/fixtures/identity.mjs';
      const base=records.find(record=>record.id==='stable-compatibility:program:tests/fixtures/language-equality.eli');
      if(!base)throw new Error('original identity graph is unavailable');
      add({id:'original-program:language-equality-identity-only',kind:'project',
        coverage:locators.filter(item=>item.file===suite&&typeof item.contains==='string'&&body.text.includes(item.contains)).map(item=>item.id),
        modules:[{id:entry,filename:'identity-only.eli',source:source.source}],entry,
        request:{...structuredClone(base.request),entries:[entry]},
        execution:{kind:'original-program',host:'tests/__eliscript_original_identity_shape.mjs',
          hostSource:[
            'import {expect} from "bun:test";',
            'import {resolve} from "node:path";',
            'import {readFile} from "node:fs/promises";',
            'const companion=process.env.ELISCRIPT_ORIGINAL_JAVASCRIPT_PRODUCT_ROOT;',
            'if(!companion)throw new Error("original identity source assertions require the actual selected compiler JavaScript artifact");',
            'const identity=await readFile(resolve(companion,'+JSON.stringify(entry)+'),"utf8");',
            body.text,'',
          ].join('\n'),arguments:[{directory:true}],aliases:true,requiresBun:true,hostRuntime:'bun',compilerSourceMaps:true,timeoutMs:60000},
        expected:{kind:'seed-program',oracleRequired:true,stdout:''},
        original:{manifest:'stable-compatibility',suite,host:suite,sourceSha256:(await file(suite)).sha256,
          regions:[source.region,body].map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256}))},
      });
    }
  }
  {
    const suite='tests/core-set.test.mjs';
    if(locators.some(item=>item.file===suite)){
      const original=await text(suite),start=original.indexOf('test("Eliscript-authored set algebra compiles and agrees across local hosts",');
      const title='Eliscript-authored set algebra compiles and agrees across local hosts';
      const body=region(original,'    const expected = {','\n  } finally {',start);
      const runner=region(original,'async function runSuccessful(command) {','\nasync function compile(');
      const host=region(original,'async function runUsageHost(command, module) {','\ntest(');
      const environment=region(original,'const EMACS =','const COMPILER =');
      const sourceCase=originalRuntimeCaseLocators(suite,original).find(item=>item.originalExecution.record==='original-program:core-set-source-map').originalCase;
      const base=records.find(record=>record.id==='stable-compatibility:program:tests/fixtures/core-set-usage.eli');
      if(!base)throw new Error('original set algebra graph is unavailable');
      add({id:'original-program:core-set-source-map',kind:'project',
        coverage:locators.filter(item=>item.file===suite&&typeof item.contains==='string'&&
          (title+'\n'+body.text+'\n'+host.text).includes(item.contains)).map(item=>item.id),
        modules:structuredClone(base.modules),entry:base.entry,request:structuredClone(base.request),
        execution:{kind:'original-program',host:'tests/__eliscript_original_core_set_map.mjs',
          hostSource:[
            'import {expect} from "bun:test";',
            'import {resolve} from "node:path";',
            'import {readFile} from "node:fs/promises";',
            'import {pathToFileURL} from "node:url";',
            'const ROOT=process.argv[2],setModule=resolve(ROOT,"stdlib/core/set.mjs"),usageModule=resolve(ROOT,"core-set-usage.mjs");',
            environment.text,runner.text,host.text,body.text,'',
          ].join('\n'),arguments:[{directory:true}],aliases:true,requiresBun:true,hostRuntime:'bun',compilerSourceMaps:true,
          childProcesses:'inherit-selected-artifact',timeoutMs:sourceCase.timeoutMs},expected:{kind:'seed-program',oracleRequired:true,stdout:''},
        original:{manifest:'stable-compatibility',suite,sourceSha256:(await file(suite)).sha256,
          originalAssertion:title,
          regions:[environment,runner,host,body].map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256}))},
      });
    }
  }
  await addOriginalCoreRuntimeProgram({add,locators,text,file,region,records});
  for(const suite of await addOriginalCoreProjectPrograms({add,locators,text,file,region,bootstrapSources,records}))mapped.push(suite);
  return mapped;
}

async function addOriginalCoreRuntimeProgram({add,locators,text,file,region,records}){
  const suite='tests/core-stdlib.test.mjs';
  if(!locators.some(item=>item.file===suite))return;
  const original=await text(suite),title='Eliscript core modules compile and execute against runtime protocols';
  const start=original.indexOf('test('+JSON.stringify(title)+',');
  if(start<0)throw new TypeError('original complete core runtime case changed');
  const body=region(original,'    const usage = await import(pathToFileURL(usageModule).href);','\n  } finally {',start);
  const imports=region(original,'import { expect, test } from "bun:test";','const ROOT =');
  const runner=region(original,'async function runSuccessful(command) {','\nasync function compile(');
  const environment=region(original,'const EMACS =','const COMPILER =');
  const bound=originalRuntimeCaseLocators(suite,original).find(item=>item.originalExecution.record==='original-program:core-stdlib-complete-protocols');
  const base=records.find(record=>record.id==='stable-compatibility:program:tests/fixtures/core-stdlib-usage.eli');
  if(!base)throw new Error('original complete core runtime graph is unavailable');
  const bindings={usageModule:'core-stdlib-usage.mjs',apiUsageModule:'core-language-api-usage.mjs',
    protocolModule:'stdlib/core/protocol.mjs',identifierModule:'stdlib/core/identifier.mjs',
    dataTextModule:'stdlib/core/data-text.mjs',metadataModule:'stdlib/core/metadata.mjs',
    collectionModule:'stdlib/core/collection.mjs',transientModule:'stdlib/core/transient.mjs',
    transducerModule:'stdlib/core/transducer.mjs',seqModule:'stdlib/core/seq.mjs',dataModule:'stdlib/core/data.mjs'};
  for(const id of Object.values(bindings))if(!base.modules.some(module=>module.id===id))
    throw new TypeError('original complete core runtime module is missing: '+id);
  // Preserve the entire original body, including the independent Node program,
  // external protocol object, 50,000-value transient metrics and every map
  // assertion. The only replacement is its compilation/setup directory.
  add({id:'original-program:core-stdlib-complete-protocols',kind:'project',
    coverage:locators.filter(item=>item.file===suite&&typeof item.contains==='string'&&
      (title+'\n'+body.text).includes(item.contains)).map(item=>item.id),
    modules:structuredClone(base.modules),entry:base.entry,request:structuredClone(base.request),
    execution:{kind:'original-program',host:'tests/__eliscript_original_core_stdlib_complete.mjs',
      hostSource:[imports.text,'const ROOT=process.argv[2];',
        ...Object.entries(bindings).map(([name,id])=>'const '+name+'=resolve(ROOT,'+JSON.stringify(id)+');'),
        environment.text,runner.text,body.text,''].join('\n'),
      arguments:[{directory:true}],aliases:true,requiresBun:true,hostRuntime:'bun',
      compilerSourceMaps:true,childProcesses:'inherit-selected-artifact',timeoutMs:bound.originalCase.timeoutMs},
    expected:{kind:'seed-program',oracleRequired:true,stdout:''},
    original:{manifest:'stable-compatibility',suite,sourceSha256:(await file(suite)).sha256,originalAssertion:title,
      regions:[imports,environment,runner,body].map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256})),
      setupReplacement:{kind:'selected-compiler-and-selected-library-artifacts',
        libraryAlgorithms:'complete original selected core and usage modules',
        sourceMaps:'actual selected compiler companion JavaScript source maps; selected binary algorithms remain selected'}},
  });
}

async function addOriginalCoreProjectPrograms({add,locators,text,file,region,bootstrapSources,records}){
  const suite='tests/core-stdlib.test.mjs';
  if(!locators.some(item=>item.file===suite))return[];
  if(!Array.isArray(bootstrapSources)||bootstrapSources.length!==13)throw new TypeError('original core project adapters require the complete compiler source manifest');
  const original=await text(suite),identity=await file(suite);
  const hosts=region(original,'async function runBuiltCoreProjectHost(', '\ntest(');
  const runner=region(original,'async function runSuccessful(command) {','\nasync function compile(');
  const compilerModules=[];
  for(const filename of bootstrapSources)compilerModules.push({id:filename.slice(0,-4)+'.mjs',filename,source:await text(filename)});
  const runtimePlan=records.find(record=>record.id==='stable-compatibility:program:stdlib/core/text.eli');
  if(!runtimePlan)throw new Error('original core project runtime graph is unavailable');
  for(const plan of [
    {id:'core',assertion:'stable protocol and core algorithms build as one project across Bun and Node',
      declaration:'  const sources = [',names:['protocol','collection','transient','transducer','seq','data','set','order','text','object'].map(name=>'core/'+name)},
    {id:'utility',assertion:'stable portable utility modules build as one project across Bun and Node',
      declaration:'  const modules = [',names:['sequence','text','object','data']},
    {id:'persistent-values',assertion:'persistent value library builds as one project and executes under Bun and Node',
      declaration:'  const sourceNames = [',names:['bit','persistent-list','persistent-vector','persistent-map','persistent-set','value']},
    {id:'value-text',assertion:'identifier metadata and data text build as one project across Bun and Node',
      declaration:'  const entries = [',names:['bit','data-text','identifier','metadata','persistent-list','persistent-map','persistent-set','persistent-vector','value'],entries:['identifier','metadata','data-text']},
    {id:'public',assertion:'public state interop result JSON and numeric modules build across hosts',
      declaration:'  const entries = [',names:['bit','interop/js','json','numeric','persistent-list','persistent-map','persistent-set','persistent-vector','result','state/atom','value'],entries:['state/atom','interop/js','result','json','numeric']},
  ]){
    const start=original.indexOf('test('+JSON.stringify(plan.assertion)+',');
    if(start<0)throw new TypeError('original complete core project assertion changed: '+plan.assertion);
    const declarations=region(original,plan.declaration,'\n  try {',start);
    const body=region(original,'    expect(report).toMatchObject({','\n  } finally {',declarations.end);
    const deadline=/^[\s\S]*?\n}, ([0-9_]+)\);/.exec(original.slice(body.end));
    if(!deadline)throw new TypeError('original complete core project deadline changed');
    const modules=structuredClone(compilerModules);
    for(const name of plan.names){const filename='stdlib/'+name+'.eli';modules.push({id:name+'.mjs',filename,source:await text(filename)});}
    const entries=(plan.entries??plan.names).map(name=>'stdlib/'+name+'.eli');
    const hostSource=[
      'import {expect} from "bun:test";',
      'import {resolve,dirname} from "node:path";',
      'import {pathToFileURL} from "node:url";',
      'import {mkdtemp,rm,readFile} from "node:fs/promises";',
      'import {tmpdir} from "node:os";',
      'const ROOT=process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT;',
      'if(!ROOT)throw new Error("original core project requires its source root");',
      'const EMACS=process.env.EMACS??"emacs";',
      'const product=process.argv[2],outputRoot=product;',
      'const {buildProject}=await import(pathToFileURL(resolve(ROOT,"bootstrap/host/project.mjs")).href);',
      'const selectedCompiler=await import(pathToFileURL(resolve(product,"bootstrap/compiler/compiler.mjs")).href);',
      'const directory=await mkdtemp(resolve(tmpdir(),"eliscript-original-core-project-"));',
      declarations.text,runner.text,hosts.text,
      'try{',
      'const build=await buildProject({root:resolve(ROOT,"stdlib"),outDir:resolve(directory,"report"),useCache:false,entries:'+JSON.stringify(entries)+'.map(name=>resolve(ROOT,name)),moduleDirectory:resolve(product,"bootstrap/compiler"),compiler:selectedCompiler});',
      'const report=build.report;',
      body.text,
      '}finally{await rm(directory,{recursive:true,force:true});}','',
    ].join('\n');
    add({id:'original-program:core-project-'+plan.id,kind:'project',
      coverage:locators.filter(item=>item.file===suite&&typeof item.contains==='string'&&
        (plan.assertion+'\n'+declarations.text+'\n'+body.text+'\n'+hosts.text).includes(item.contains)).map(item=>item.id),
      modules,entry:plan.names[0]+'.mjs',
      request:{...structuredClone(runtimePlan.request),entries:modules.map(module=>module.id),resolveImports:true,phased:true,sourceMap:true},
      execution:{kind:'original-program',host:'tests/__eliscript_original_core_project_'+plan.id+'.mjs',hostSource,
        arguments:[{directory:true}],aliases:true,requiresBun:true,hostRuntime:'bun',
        childProcesses:'inherit-selected-artifact',runtimeLaunchers:true,compilerSourceMaps:true,runtimeProfile:'compiler',
        timeoutMs:Number(deadline[1].replaceAll('_',''))},
      expected:{kind:'seed-program',oracleRequired:true,stdout:''},
      original:{manifest:'stable-compatibility',suite,host:suite,originalAssertion:plan.assertion,sourceSha256:identity.sha256,
        regions:[declarations,runner,hosts,body].map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256})),
        setupReplacement:{kind:'selected-compiler-and-selected-library-artifacts',reportCompiler:'actual selected target compiler',libraryAlgorithms:'actual selected target modules'}},
    });
  }
  return[];
}
