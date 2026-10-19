import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const sha256 = value => createHash('sha256').update(value).digest('hex');

function replaceSetup(source, before, after, changes) {
  const start = source.indexOf(before);
  if (start < 0 || source.indexOf(before, start + before.length) >= 0) {
    throw new TypeError('original project setup boundary changed: ' + before);
  }
  changes.push({beforeSha256: sha256(before), afterSha256: sha256(after),
    role: 'selected-artifact-transport'});
  return source.slice(0, start) + after + source.slice(start + before.length);
}

function sourceImports(source, sourceRoot, changes) {
  for (const name of ['project', 'project-cli']) {
    const specifier = '../bootstrap/host/' + name + '.mjs';
    const before = JSON.stringify(specifier);
    if (!source.includes(before)) continue;
    const after = JSON.stringify(pathToFileURL(resolve(sourceRoot, 'bootstrap/host/' + name + '.mjs')).href);
    // Static and dynamic imports continue to use the original host service;
    // its compiler argument/directory always points at the selected product.
    source = replaceSetup(source, before, after, changes);
  }
  return source;
}

function selectedDirectoryTransport(moduleNames, bootstrapBinding) {
  return `
const __eliscript_project_cases = [];
function test(name, body, timeout) {
  if (typeof name !== 'string' || typeof body !== 'function' ||
      !Number.isSafeInteger(timeout) || timeout <= 0) {
    throw new TypeError('original project case must retain its explicit timeout');
  }
  __eliscript_project_cases.push({name, body, timeout});
}
const __eliscript_selected_compiler = resolve(process.argv[2], 'bootstrap/compiler');
const __eliscript_selected_modules = ${JSON.stringify(moduleNames)};
async function __eliscript_materialize_compiler(directory) {
  if (typeof directory !== 'string' || !directory) {
    throw new TypeError('original bootstrap setup requires its output directory');
  }
  await mkdir(directory, {recursive: true});
  for (const name of __eliscript_selected_modules) {
    const original = resolve(__eliscript_selected_compiler, name + '.mjs');
    const map = await readFile(original + '.map');
    // These modules only transport the already emitted selected implementation.
    // No bootstrap executable or JavaScript compiler computes a replacement.
    const forwarding = 'export * from ' + JSON.stringify(pathToFileURL(original).href) + ';\\n';
    await writeFile(resolve(directory, name + '.mjs'), forwarding);
    await writeFile(resolve(directory, name + '.mjs.map'), map);
  }
}
async function __eliscript_original_setup(command, options) {
  if (!Array.isArray(command) || command[0] !== ${bootstrapBinding}) return false;
  if (command.length !== 1 || !options?.env?.ELISCRIPT_BOOTSTRAP_OUT_DIR) {
    throw new TypeError('original bootstrap setup command shape changed');
  }
  await __eliscript_materialize_compiler(options.env.ELISCRIPT_BOOTSTRAP_OUT_DIR);
  return true;
}
`;
}

const runCases = `
for (const {name, body, timeout} of __eliscript_project_cases) {
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(body),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(name + ' exceeded its original ' + timeout + ' ms timeout')), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
`;

// Preserve the complete original suite, including its real filesystem, cache,
// CLI, Node and independent Emacs assertions. Only setup transport changes:
// the matrix has already compiled the entire original compiler source graph
// on its selected host/target before this program can start.
export async function addOriginalProjectPrograms({add, locators, text, file, bootstrapSources, sourceRoot,stableFiles=new Set()}) {
  if (typeof add !== 'function' || typeof text !== 'function' || typeof file !== 'function' ||
      !Array.isArray(locators) || !Array.isArray(bootstrapSources) || typeof sourceRoot !== 'string') {
    throw new TypeError('original project adapter requires its complete source manifest and services');
  }
  const modules = [], moduleNames = [], seen = new Set();
  for (const filename of bootstrapSources) {
    if (typeof filename !== 'string' || !/^bootstrap\/compiler\/[a-z][a-z0-9-]*\.eli$/.test(filename) || seen.has(filename)) {
      throw new TypeError('original compiler source manifest has an invalid or repeated module');
    }
    seen.add(filename);
    modules.push({id: filename.slice(0, -4) + '.mjs', filename, source: await text(filename)});
    moduleNames.push(filename.slice('bootstrap/compiler/'.length, -4));
  }
  if (modules.length !== 13 || !seen.has('bootstrap/compiler/compiler.eli')) {
    throw new TypeError('original project programs require the complete thirteen-module compiler');
  }
  const mapped = [];
  for (const plan of [
    {suite: 'tests/bootstrap-project.test.mjs', name: 'bootstrap-project', bootstrapBinding: 'bootstrapPath',
      assertions: [
        'self-hosted project planning reaches deterministic graph fixed points',
        'self-hosted project service matches seed output under Bun and Node',
      ]},
    {suite: 'tests/macro-file-dependencies.test.mjs', name: 'macro-file-dependencies', bootstrapBinding: 'buildPath',
      assertions: [
        'self-hosted macros read only declared context files',
        'declared macro files drive deterministic project builds and cache invalidation',
      ]},
  ]) {
    const suiteLocators = locators.filter(locator => locator.file === plan.suite);
    if (!suiteLocators.length) continue;
    const original = await text(plan.suite), identity = await file(plan.suite), changes = [];
    for (const name of plan.assertions) {
      if (!original.includes('test(' + JSON.stringify(name) + ', async () => {')) {
        throw new TypeError('original project suite assertion boundary changed: ' + name);
      }
    }
    for (const locator of suiteLocators) {
      if (typeof locator.contains !== 'string' || !original.includes(locator.contains)) {
        throw new TypeError('original project suite locator is not present in its complete source');
      }
    }
    let transported = replaceSetup(original,
      'import { expect, test } from "bun:test";', 'import { expect } from "bun:test";', changes);
    transported = replaceSetup(transported,
      'const projectDirectory = resolve(import.meta.dir, "..");',
      'const projectDirectory = process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT;\n' +
        'if (!projectDirectory) throw new Error("original project program requires its source root");', changes);
    transported = sourceImports(transported, sourceRoot, changes);
    transported = replaceSetup(transported,
      'async function run(command, options = {}) {\n',
      'async function run(command, options = {}) {\n' +
        '  if (await __eliscript_original_setup(command, options)) return "";\n', changes);
    const source = selectedDirectoryTransport(moduleNames, plan.bootstrapBinding) + transported + runCases;
    add({
      id: 'original-program:compiler-project-' + plan.name,
      kind: 'project', coverage: suiteLocators.map(locator => locator.id),
      modules: structuredClone(modules), entry: 'bootstrap/compiler/compiler.mjs',
      request: {operation: 'project', resolveImports: true, phased: true, sourceMap: true,
        entries: modules.map(module => module.id)},
      execution: {
        kind: 'original-program', host: 'tests/__eliscript_original_project_' + plan.name + '.mjs',
        hostSource: source, arguments: [{directory: true}], aliases: true, requiresBun: true,
        childProcesses: 'inherit-selected-artifact', runtimeLaunchers: true, compilerSourceMaps: true, runtimeProfile: 'compiler',
        setupReplacement: {
          kind: 'selected-compiler-module-directory', algorithms: 'selected-target-only',
          originalCommand: 'bin/eliscript-bootstrap', modules: modules.map(module => module.id),
          sourceSha256: identity.sha256, changes,
          sourceMaps: 'independently-archived-selected-host-javascript-product',
        },
      },
      expected: {kind: 'seed-program', oracleRequired: true, stdout: ''},
      original: {
        manifest: 'stable-compatibility', suite: plan.suite, fixture: plan.suite, host: plan.suite,
        sourceSha256: identity.sha256, originalAssertions: plan.assertions,
        regions: [{start: 0, end: original.length, byteStart: 0, byteEnd: Buffer.byteLength(original), sha256: sha256(original)}],
        setupReplacement: {kind: 'selected-compiler-module-directory', changes},
      },
    });
    mapped.push(plan.suite);
  }
  const debugging=await addOriginalSourceDebuggingProgram({add,locators,text,file,sourceRoot,stableFiles,modules});
  if(debugging)mapped.push(debugging);
  const literals=await addOriginalLiteralRuntimeProgram({add,locators,text,file,sourceRoot,stableFiles,modules});
  if(literals)mapped.push(literals);
  const interop=await addOriginalInteropPackageProgram({add,locators,text,file,sourceRoot,stableFiles,modules});
  if(interop)mapped.push(interop);
  mapped.push(...await addOriginalFrontendCLISuites({add,locators,text,file,sourceRoot,stableFiles,modules}));
  return mapped;
}

async function addOriginalFrontendCLISuites({add,locators,text,file,sourceRoot,stableFiles,modules}){
  const mapped=[];
  for(const plan of [
    {name:'loop-recur',suite:'tests/loop-recur.test.mjs',title:'loop/recur is stack-safe and identical after self-hosting',
      root:'projectDirectory',seed:'seedCliPath',portable:'portableCliPath',loop:true,
      assets:['bin/eliscript','bin/eliscript-portable','bin/eliscript-bootstrap']},
    {name:'stdlib-bit',suite:'tests/stdlib-bit.test.mjs',title:'portable 32-bit operations and algorithms agree under Bun and Node',
      root:'projectDirectory',seed:'compiler',portable:'portableCompiler',
      assets:['stdlib/bit.eli','tests/fixtures/bit-usage.eli','tests/fixtures/bit-host.mjs',
        'tests/helpers/seed-compiler.mjs','bin/eliscript','bin/eliscript-portable']},
  ]){
    const selected=locators.filter(locator=>locator.file===plan.suite);
    if(!selected.length)continue;
    const original=await text(plan.suite),identity=await file(plan.suite),changes=[],sourceAssets=[];
    if(!original.includes('test('+JSON.stringify(plan.title)+', async () => {')||!original.endsWith('}, 30_000);\n'))
      throw new TypeError('original frontend CLI assertion or deadline changed: '+plan.suite);
    for(const locator of selected)if(typeof locator.contains!=='string'||!original.includes(locator.contains))
      throw new TypeError('original frontend CLI locator changed: '+locator.id);
    for(const filename of plan.assets){const evidence=await file(filename);sourceAssets.push({file:filename,sourceSha256:evidence.sha256});}
    let transported=replaceSetup(original,'import { expect, test } from "bun:test";','import { expect } from "bun:test";',changes);
    if(!plan.loop)transported=replaceSetup(transported,'import { seedCompilerFixture } from "./helpers/seed-compiler.mjs";',
      '// Bootstrap setup forwards the complete actual selected compiler.',changes);
    transported=replaceSetup(transported,'const '+plan.root+' = resolve(import.meta.dir, "..");',
      'const '+plan.root+' = process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT;\n'+
      'if (!'+plan.root+') throw new Error("original frontend CLI requires its source root");',changes);
    if(plan.loop){
      transported=replaceSetup(transported,'async function run(command, options = {}) {\n',
        'async function run(command, options = {}) {\n'+
        '  if (command[0] === buildPath) {\n'+
        '    if (command.length !== 1) throw new TypeError("original loop bootstrap command changed");\n'+
        '    await __frontend_install(options.env?.ELISCRIPT_BOOTSTRAP_OUT_DIR);return "";\n'+
        '  }\n'+
        '  if (command[0] === seedCliPath) options = {...options, env: {...process.env, ...options.env,\n'+
        '    ELISCRIPT_BOOTSTRAP_MODULE_DIR: __frontend_reference}};\n',changes);
    }else{
      transported=replaceSetup(transported,'async function runSuccessful(command, extraEnvironment = {}) {\n',
        'async function runSuccessful(command, extraEnvironment = {}) {\n'+
        '  if (command[0] === compiler) extraEnvironment = {...extraEnvironment, ELISCRIPT_BOOTSTRAP_MODULE_DIR: __frontend_reference};\n'+
        '  else if (command[0] === portableCompiler) extraEnvironment = {...extraEnvironment,\n'+
        '    ELISCRIPT_BOOTSTRAP_MODULE_DIR: extraEnvironment.ELISCRIPT_BOOTSTRAP_MODULE_DIR ?? __frontend_selected};\n',changes);
    }
    const setup=`
import {mkdir as __frontend_mkdir,readFile as __frontend_read,writeFile as __frontend_write} from 'node:fs/promises';
import {pathToFileURL as __frontend_url} from 'node:url';
const __eliscript_project_cases=[];
const __frontend_selected=resolve(process.argv[2],'bootstrap/compiler');
const __frontend_reference_root=process.env.ELISCRIPT_ORIGINAL_REFERENCE_PRODUCT_ROOT;
if(!__frontend_reference_root)throw new Error('original frontend CLI requires its independent Seed product');
const __frontend_reference=resolve(__frontend_reference_root,'bootstrap/compiler');
const __frontend_modules=${JSON.stringify(modules.map(module=>module.id.slice('bootstrap/compiler/'.length,-4)))};
function test(name,body,timeout){
 if(name!==${JSON.stringify(plan.title)}||typeof body!=='function'||timeout!==30000)
  throw new TypeError('original frontend CLI registration changed');
 __eliscript_project_cases.push({name,body,timeout});
}
async function __frontend_install(directory){
 if(typeof directory!=='string'||!directory)throw new TypeError('original frontend CLI bootstrap output changed');
 await __frontend_mkdir(directory,{recursive:true});
 for(const name of __frontend_modules){
  const actual=resolve(__frontend_selected,name+'.mjs'),map=await __frontend_read(actual+'.map');
  await __frontend_write(resolve(directory,name+'.mjs'),'export * from '+JSON.stringify(__frontend_url(actual).href)+';\\n');
  await __frontend_write(resolve(directory,name+'.mjs.map'),map);
 }
 return resolve(directory);
}
async function seedCompilerFixture(directory){return __frontend_install(directory);}
`;
    add({id:'original-program:compiler-'+plan.name+'-complete',kind:'project',
      coverage:[...new Set([...selected.map(locator=>locator.id),
        ...sourceAssets.filter(asset=>stableFiles.has(asset.file)).map(asset=>'stable-compatibility:'+asset.file)])],
      modules:structuredClone(modules),entry:'bootstrap/compiler/compiler.mjs',
      request:{operation:'project',resolveImports:true,phased:true,sourceMap:true,entries:modules.map(module=>module.id)},
      execution:{kind:'original-program',host:'tests/__eliscript_original_'+plan.name+'_complete.mjs',
        hostSource:setup+transported+runCases,arguments:[{directory:true}],aliases:true,requiresBun:true,hostRuntime:'bun',
        referenceArtifact:true,childProcesses:'inherit-selected-artifact',runtimeLaunchers:true,compilerSourceMaps:true,runtimeProfile:'compiler',
        timeoutMs:30000,setupReplacement:{kind:'selected-and-independent-reference-compiler-directories',
          algorithms:'selected-target-only',sourceSha256:identity.sha256,changes,originalCaseTimeouts:[30000]}},
      expected:{kind:'seed-program',oracleRequired:true,stdout:''},
      original:{manifest:'stable-compatibility',suite:plan.suite,fixture:plan.suite,host:plan.suite,
        sourceSha256:identity.sha256,originalAssertions:[plan.title],sourceAssets,
        regions:[{start:0,end:original.length,byteStart:0,byteEnd:Buffer.byteLength(original),sha256:sha256(original)}],
        setupReplacement:{kind:'selected-and-independent-reference-compiler-directories',changes}}});
    mapped.push(plan.suite);
  }
  return mapped;
}

async function addOriginalInteropPackageProgram({add,locators,text,file,sourceRoot,stableFiles,modules}){
  const suite='tests/interop-package.test.mjs',suiteLocators=locators.filter(locator=>locator.file===suite);
  if(!suiteLocators.length)return null;
  const original=await text(suite),identity=await file(suite),changes=[];
  const assertion='maintained JavaScript package consumes native values across compilers and hosts';
  if(!original.includes('test('+JSON.stringify(assertion)+', async () => {')||!original.endsWith('}, 120_000);\n'))
    throw new TypeError('original interop package assertion or deadline changed');
  for(const locator of suiteLocators)if(typeof locator.contains!=='string'||!original.includes(locator.contains))
    throw new TypeError('original interop package locator is absent from its complete suite');
  const declaration=/const dependencies = (\[[^\]]*\]);/.exec(original);
  if(!declaration)throw new TypeError('original interop package dependency declaration changed');
  const dependencies=JSON.parse(declaration[1].replace(/,\s*]$/,']'));
  if(!Array.isArray(dependencies)||dependencies.some(name=>typeof name!=='string'||!/^[-a-z]+$/.test(name)))
    throw new TypeError('original interop package dependencies are not static module names');
  const sourceAssets=[];
  for(const filename of ['tests/fixtures/packages/interop-consumer/package.json','tests/fixtures/packages/interop-consumer/index.mjs',
    'tests/fixtures/packages/native-container-consumer/package.json','tests/fixtures/packages/native-container-consumer/index.mjs',
    'tests/helpers/seed-compiler.mjs','bin/eliscript-seed-build','bin/eliscript-build',
    'bootstrap/host/project-cli.mjs','bootstrap/host/project.mjs','bootstrap/host/build.mjs','bootstrap/host/bun.mjs',
    'stdlib/interop/js.eli',...dependencies.map(name=>'stdlib/'+name+'.eli')]){
    const evidence=await file(filename);sourceAssets.push({file:filename,sourceSha256:evidence.sha256});
  }
  let transported=replaceSetup(original,'import { seedCompilerFixture } from "./helpers/seed-compiler.mjs";',
    '// The complete selected compiler supplies the original bootstrap setup.',changes);
  transported=replaceSetup(transported,'import { expect, test } from "bun:test";',
    'import { expect } from "bun:test";',changes);
  transported=replaceSetup(transported,'const root = resolve(import.meta.dir, "..");',
    'const root = process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT;\n'+
    'if (!root) throw new Error("original interop package requires its source root");',changes);
  transported=replaceSetup(transported,'async function runSuccessful(command, options = {}) {\n',
    'async function runSuccessful(command, options = {}) {\n'+
    '  if (command[0] === selfHostedBuild) options = {...options, env: {...options.env,\n'+
    '    ELISCRIPT_BOOTSTRAP_MODULE_DIR: options.env?.ELISCRIPT_BOOTSTRAP_MODULE_DIR ?? __interop_selected}};\n',changes);
  const registration=`
import {pathToFileURL as __interop_url} from 'node:url';
const __eliscript_project_cases=[];
const __interop_selected=resolve(process.argv[2],'bootstrap/compiler');
const __interop_modules=${JSON.stringify(modules.map(module=>module.id.slice('bootstrap/compiler/'.length,-4)))};
function test(name,body,timeout){
 if(typeof name!=='string'||typeof body!=='function'||timeout!==120000)
  throw new TypeError('original interop package case registration changed');
 __eliscript_project_cases.push({name,body,timeout});
}
async function seedCompilerFixture(directory){
 if(typeof directory!=='string'||!directory)throw new TypeError('original interop compiler output directory changed');
 await mkdir(directory,{recursive:true});
 for(const name of __interop_modules){
  const actual=resolve(__interop_selected,name+'.mjs');
  const map=await readFile(actual+'.map');
  await writeFile(resolve(directory,name+'.mjs'),'export * from '+JSON.stringify(__interop_url(actual).href)+';\\n');
  await writeFile(resolve(directory,name+'.mjs.map'),map);
 }
 return resolve(directory);
}
`;
  const fixtureCoverage=sourceAssets.filter(asset=>stableFiles.has(asset.file)).map(asset=>'stable-compatibility:'+asset.file);
  add({id:'original-program:compiler-interop-package-complete',kind:'project',
    coverage:[...new Set([...suiteLocators.map(locator=>locator.id),...fixtureCoverage])],
    modules:structuredClone(modules),entry:'bootstrap/compiler/compiler.mjs',
    request:{operation:'project',resolveImports:true,phased:true,sourceMap:true,entries:modules.map(module=>module.id)},
    execution:{kind:'original-program',host:'tests/__eliscript_original_interop_package_complete.mjs',
      hostSource:registration+transported+runCases,arguments:[{directory:true}],aliases:true,requiresBun:true,hostRuntime:'bun',
      childProcesses:'inherit-selected-artifact',runtimeLaunchers:true,compilerSourceMaps:true,runtimeProfile:'compiler',timeoutMs:120000,
      setupReplacement:{kind:'selected-compiler-module-directory',algorithms:'selected-target-only',
        sourceSha256:identity.sha256,modules:modules.map(module=>module.id),changes,
        originalCaseTimeouts:[120000],independentOracle:'unchanged bin/eliscript-seed-build'}},
    expected:{kind:'seed-program',oracleRequired:true,stdout:''},
    original:{manifest:'stable-compatibility',suite,fixture:'tests/fixtures/packages/interop-consumer/index.mjs',
      host:suite,sourceSha256:identity.sha256,originalAssertions:[assertion],sourceAssets,
      regions:[{start:0,end:original.length,byteStart:0,byteEnd:Buffer.byteLength(original),sha256:sha256(original)}],
      setupReplacement:{kind:'selected-compiler-module-directory',changes}}});
  return suite;
}

async function addOriginalLiteralRuntimeProgram({add,locators,text,file,sourceRoot,stableFiles,modules}){
  const suite='tests/literal-runtime.test.mjs',suiteLocators=locators.filter(locator=>locator.file===suite);
  if(!suiteLocators.length)return null;
  const original=await text(suite),identity=await file(suite),changes=[];
  const assertions=[
    'persistent literals and quoted data preserve language value categories',
    'hash-map rejects incomplete pairs in both compilers',
    'explicit host-only modules do not link the persistent runtime',
    'maintained Eliscript sources use explicit host constructors',
    'portable closures produce persistent values for the versioned worker codec',
  ];
  for(const title of assertions)if(!original.includes('test('+JSON.stringify(title)+','))
    throw new TypeError('original literal runtime assertion boundary changed: '+title);
  for(const locator of suiteLocators)if(typeof locator.contains!=='string'||!original.includes(locator.contains))
    throw new TypeError('original literal runtime locator is absent from its complete suite');
  const sourceAssets=[];
  for(const filename of ['tests/fixtures/literal-runtime.eli','tests/fixtures/literal-runtime-host.mjs',
    'bin/eliscript','bin/eliscript-portable','bin/eliscript-bootstrap','bootstrap/host/bun.mjs']){
    const evidence=await file(filename);sourceAssets.push({file:filename,sourceSha256:evidence.sha256});
  }
  let transported=replaceSetup(original,'import { expect, test } from "bun:test";',
    'import { expect } from "bun:test";',changes);
  for(const match of [...original.matchAll(/from "(\.\.\/runtime\/[^"\n]+)"/g)]){
    const specifier=match[1],filename=specifier.slice(3),evidence=await file(filename);
    sourceAssets.push({file:filename,sourceSha256:evidence.sha256});
    transported=replaceSetup(transported,JSON.stringify(specifier),
      JSON.stringify(pathToFileURL(resolve(sourceRoot,filename)).href),changes);
  }
  transported=replaceSetup(transported,'const ROOT = resolve(import.meta.dir, "..");',
    'const ROOT = process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT;\n'+
    'if (!ROOT) throw new Error("original literal runtime requires its source root");',changes);
  transported=replaceSetup(transported,'async function run(command, environment = {}, allowFailure = false) {\n',
    'async function run(command, environment = {}, allowFailure = false) {\n'+
    '  if (command[0] === BUILD_BOOTSTRAP) {\n'+
    '    if (command.length !== 1) throw new TypeError("original literal bootstrap command changed");\n'+
    '    await __literal_install_selected(environment.ELISCRIPT_BOOTSTRAP_OUT_DIR);\n'+
    '    return {exitCode: 0, stdout: "", stderr: ""};\n'+
    '  }\n'+
    '  if (command[0] === SEED) environment = {...environment, ELISCRIPT_BOOTSTRAP_MODULE_DIR: __literal_reference};\n'+
    '  else if (command[0] === SELF_HOSTED) environment = {...environment,\n'+
    '    ELISCRIPT_BOOTSTRAP_MODULE_DIR: environment.ELISCRIPT_BOOTSTRAP_MODULE_DIR ?? __literal_selected};\n',changes);
  const registration=`
import {mkdir as __literal_mkdir,readFile as __literal_read,writeFile as __literal_write} from 'node:fs/promises';
import {pathToFileURL as __literal_url} from 'node:url';
const __eliscript_project_cases=[];
const __literal_selected=resolve(process.argv[2],'bootstrap/compiler');
const __literal_reference_root=process.env.ELISCRIPT_ORIGINAL_REFERENCE_PRODUCT_ROOT;
if(!__literal_reference_root)throw new Error('original dual-compiler literal assertions require their independent Seed product');
const __literal_reference=resolve(__literal_reference_root,'bootstrap/compiler');
const __literal_modules=${JSON.stringify(modules.map(module=>module.id.slice('bootstrap/compiler/'.length,-4)))};
function test(name,body,timeout=5000){
 if(typeof name!=='string'||typeof body!=='function'||!Number.isSafeInteger(timeout)||timeout<=0)
  throw new TypeError('original literal runtime case registration changed');
 __eliscript_project_cases.push({name,body,timeout});
}
async function __literal_install_selected(directory){
 if(typeof directory!=='string'||!directory)throw new TypeError('original literal bootstrap output directory changed');
 await __literal_mkdir(directory,{recursive:true});
 for(const name of __literal_modules){
  const actual=resolve(__literal_selected,name+'.mjs');
  const map=await __literal_read(actual+'.map');
  await __literal_write(resolve(directory,name+'.mjs'),'export * from '+JSON.stringify(__literal_url(actual).href)+';\\n');
  await __literal_write(resolve(directory,name+'.mjs.map'),map);
 }
}
`;
  const fixtureCoverage=sourceAssets.filter(asset=>stableFiles.has(asset.file))
    .map(asset=>'stable-compatibility:'+asset.file);
  add({id:'original-program:compiler-literal-runtime-complete',kind:'project',
    // The source-constructor audit still belongs to its precise original
    // source-only gate. It also executes verbatim here, but is not relabelled
    // as selected compiler semantic evidence.
    coverage:[...new Set([...suiteLocators.filter(locator=>locator.contains!==assertions[3]).map(locator=>locator.id),...fixtureCoverage])],
    modules:structuredClone(modules),entry:'bootstrap/compiler/compiler.mjs',
    request:{operation:'project',resolveImports:true,phased:true,sourceMap:true,entries:modules.map(module=>module.id)},
    execution:{kind:'original-program',host:'tests/__eliscript_original_literal_runtime_complete.mjs',
      hostSource:registration+transported+runCases,arguments:[{directory:true}],aliases:true,requiresBun:true,hostRuntime:'bun',
      referenceArtifact:true,childProcesses:'inherit-selected-artifact',runtimeLaunchers:true,compilerSourceMaps:true,runtimeProfile:'compiler',
      timeoutMs:245000,setupReplacement:{kind:'selected-and-independent-reference-compiler-directories',algorithms:'selected-target-only',
        sourceSha256:identity.sha256,modules:modules.map(module=>module.id),changes,
        originalCaseTimeouts:[60000,60000,60000,5000,60000],originalHost:'tests/fixtures/literal-runtime-host.mjs'}},
    expected:{kind:'seed-program',oracleRequired:true,stdout:''},
    original:{manifest:'stable-compatibility',suite,fixture:'tests/fixtures/literal-runtime.eli',
      host:'tests/fixtures/literal-runtime-host.mjs',sourceSha256:identity.sha256,originalAssertions:assertions,sourceAssets,
      regions:[{start:0,end:original.length,byteStart:0,byteEnd:Buffer.byteLength(original),sha256:sha256(original)}],
      setupReplacement:{kind:'selected-and-independent-reference-compiler-directories',changes}}});
  return suite;
}

async function addOriginalSourceDebuggingProgram({add,locators,text,file,sourceRoot,stableFiles,modules}){
  const suite='tests/source-debugging.test.mjs',suiteLocators=locators.filter(locator=>locator.file===suite);
  if(!suiteLocators.length)return null;
  const original=await text(suite),identity=await file(suite),changes=[];
  for(const locator of suiteLocators)if(typeof locator.contains!=='string'||!original.includes(locator.contains))
    throw new TypeError('original source debugging locator is absent from its complete suite');
  const assertions=[
    'source mapping decodes V8 and browser stack dialects without a host API',
    'compiler failure preserves its complete Eliscript source span',
    'runtime failure maps through persistent evaluation',
    'browser event and async rejection map under Bun and Node',
    'source debugging corpus is complete and rejects evidence drift',
  ];
  for(const title of assertions)if(!original.includes('test('+JSON.stringify(title)+','))
    throw new TypeError('original source debugging assertion boundary changed: '+title);
  const sourceAssets=[];
  for(const filename of ['tests/fixtures/source-debugging.eli','tests/fixtures/source-debugging-host.mjs',
    'tests/fixtures/evaluation-session/main.eli','tests/fixtures/diagnostic-unbound.eli',
    'tests/fixtures/worker.eli','contracts/source-debugging-corpus.json','tests/worker-runtime.test.mjs',
    'runtime/source-mapping.mjs','platform/browser.mjs','tools/debugging/check.mjs',
    'bootstrap/host/bun.mjs','bootstrap/host/evaluation.mjs','bootstrap/host/project.mjs','bin/eliscript']){
    const evidence=await file(filename);sourceAssets.push({file:filename,sourceSha256:evidence.sha256});
  }
  let transported=replaceSetup(original,'import { expect, test } from "bun:test";',
    'import { expect } from "bun:test";',changes);
  for(const specifier of ['../bootstrap/host/bun.mjs','../bootstrap/host/evaluation.mjs',
    '../runtime/source-mapping.mjs','../tools/debugging/check.mjs'])
    transported=replaceSetup(transported,JSON.stringify(specifier),
      JSON.stringify(pathToFileURL(resolve(sourceRoot,specifier.slice(3))).href),changes);
  transported=replaceSetup(transported,'const ROOT = resolve(import.meta.dir, "..");',
    'const ROOT = process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT;\n'+
    'if (!ROOT) throw new Error("original source debugging requires its source root");',changes);
  transported=replaceSetup(transported,'const compiler = await loadCompiler();',
    'const compiler = await loadCompiler(__eliscript_debug_compiler_directory);',changes);
  transported=replaceSetup(transported,'async function run(command, options = {}) {\n',
    'async function run(command, options = {}) {\n'+
    '  if (command[0] === "./bin/eliscript") options = {...options, env: {...process.env, ...options.env,\n'+
    '    ELISCRIPT_BOOTSTRAP_MODULE_DIR: __eliscript_debug_compiler_directory}};\n',changes);
  // Only setup changes. In particular, both actual Node/Bun event hosts, CLI
  // diagnostics, persistent evaluation and every original assertion stay verbatim.
  const registration=`
const __eliscript_project_cases=[];
const __eliscript_debug_compiler_directory=resolve(process.argv[2],'bootstrap/compiler');
function test(name,body,timeout=5000){
 if(typeof name!=='string'||typeof body!=='function'||!Number.isSafeInteger(timeout)||timeout<=0)
  throw new TypeError('original source debugging case registration changed');
 __eliscript_project_cases.push({name,body,timeout});
}
`;
  const fixtureCoverage=sourceAssets.filter(asset=>stableFiles.has(asset.file))
    .map(asset=>'stable-compatibility:'+asset.file);
  add({id:'original-program:compiler-source-debugging',kind:'project',
    coverage:[...new Set([...suiteLocators.map(locator=>locator.id),...fixtureCoverage])],
    modules:structuredClone(modules),entry:'bootstrap/compiler/compiler.mjs',
    request:{operation:'project',resolveImports:true,phased:true,sourceMap:true,entries:modules.map(module=>module.id)},
    execution:{kind:'original-program',host:'tests/__eliscript_original_source_debugging.mjs',
      hostSource:registration+transported+runCases,arguments:[{directory:true}],aliases:true,requiresBun:true,
      childProcesses:'inherit-selected-artifact',runtimeLaunchers:true,compilerSourceMaps:true,runtimeProfile:'compiler',
      timeoutMs:30000,setupReplacement:{kind:'selected-compiler-module-directory',algorithms:'selected-target-only',
        sourceSha256:identity.sha256,modules:modules.map(module=>module.id),changes,
        originalCaseTimeouts:assertions.map(()=>5000),originalHost:'tests/fixtures/source-debugging-host.mjs'}},
    expected:{kind:'seed-program',oracleRequired:true,stdout:''},
    original:{manifest:'stable-compatibility',suite,fixture:'tests/fixtures/source-debugging.eli',
      host:'tests/fixtures/source-debugging-host.mjs',sourceSha256:identity.sha256,originalAssertions:assertions,sourceAssets,
      regions:[{start:0,end:original.length,byteStart:0,byteEnd:Buffer.byteLength(original),sha256:sha256(original)}],
      setupReplacement:{kind:'selected-compiler-module-directory',changes}}});
  return suite;
}
