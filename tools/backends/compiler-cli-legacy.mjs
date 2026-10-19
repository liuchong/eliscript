#!/usr/bin/env node
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, dirname, relative, isAbsolute, sep, basename} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {buildIndependentCompiler,decodeCompilerBinary,writeCompilerMetadata} from './compiler-build.mjs';
import {loadCompilerProject} from './compiler-project.mjs';
import {bootstrapCompilerChain, bootstrapIndependentCompilers,bootstrapCompilerGrid,compilerFailure,openCompilerArtifact} from './compiler-bootstrap.mjs';
import {packageIndependentCompiler} from './compiler-package.mjs';
import {createManagedProjectFacades} from './managed-module-graph.mjs';
import {encodeCompilerMetadata} from './compiler-session.mjs';
import {readCompilerMetadata} from './compiler-metadata.mjs';

const help = `Usage:
  compiler-cli.mjs build --seed --host wasm --output DIRECTORY
  compiler-cli.mjs build --producer-artifact METADATA --host native --output DIRECTORY
  compiler-cli.mjs compile --compiler-artifact METADATA --input SOURCE --target javascript --output FILE
  compiler-cli.mjs compile --compiler-artifact METADATA --input SOURCE --target wasm --output FILE
  compiler-cli.mjs compile --compiler-artifact METADATA --project ENTRY.eli --root DIRECTORY --target javascript --output DIRECTORY
  compiler-cli.mjs request --compiler-artifact METADATA --request REQUEST_JSON --output FILE
  compiler-cli.mjs bootstrap --output DIRECTORY [--host wasm --generations 3]
  compiler-cli.mjs bootstrap --output DIRECTORY --hosts javascript,wasm,native
  compiler-cli.mjs bootstrap-all --output DIRECTORY [--generations 3]
  compiler-cli.mjs compiler-grid --output DIRECTORY [--profile full-runtime]
  compiler-cli.mjs matrix --output DIRECTORY [--compiler-artifacts METADATA]...
  compiler-cli.mjs package --compiler-artifact METADATA --output DIRECTORY

Builds default to the unchanged small resource profile. Use --profile full-runtime
explicitly for the separate full-runtime configuration. An existing compiler
artifact always executes its own host; the CLI does not substitute the seed.
Native output uses --native-target arm64-macos|arm64-linux and --native-format library|object.
Use --debug to retain binary instruction-to-source mappings beside the output.
Use --json-errors for a structured error record on stderr and a nonzero exit status.
Macro file access requires --macro-capability read-file and one or more
--macro-dependency SPECIFIER=ROOT_RELATIVE_FILE options; access stays inside --root.
Use --host-modules DECLARATIONS_JSON to explicitly declare foreign MJS edges.
Binary mixed projects emit ESM facades beside the binary; deploy the unchanged
foreign providers at their declared paths beside those facades.
`;

async function readText(path) {
  const decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
  if (path !== '-') return decoder.decode(await readFile(resolve(path)));
  // A UTF-8 scalar may straddle two pipe chunks. Keep decoder state until
  // EOF, and retain a source BOM so compiler offsets still name the input.
  const parts = [];
  for await (const chunk of process.stdin) parts.push(decoder.decode(chunk, {stream: true}));
  parts.push(decoder.decode());
  return parts.join('');
}

async function openCompiler(metadataFile) {
  const metadataPath = resolve(metadataFile);
  const artifact = {...await readCompilerMetadata(metadataPath),
    directory: dirname(metadataPath), metadataPath};
  const session = await openCompilerArtifact(artifact);
  return {session, artifact, metadataPath};
}

async function closeCompiler(session, failed) {
  try {await session?.close();}
  catch (error) {if (!failed) throw error;}
}

async function saveHostSources(directory,sources,reserved=[]){
  if(sources===undefined)return [];
  if(!Array.isArray(sources))throw new TypeError('host sources must be an array');
  const occupied=new Set(reserved),records=[];
  for(const source of sources){
    const id=source?.id;
    if(typeof id!=='string'||!id.endsWith('.mjs')||/[\\:\u0000?#]/.test(id)||isAbsolute(id)||id.split('/').some(part=>!part||part==='.'||part==='..')||typeof source.source!=='string'||occupied.has(id))throw new TypeError('invalid or colliding original host source');
    const path=resolve(directory,id),part=relative(directory,path);
    if(!part||part==='..'||part.startsWith('..'+sep)||isAbsolute(part))throw new TypeError('host source escapes the output directory');
    occupied.add(id);const bytes=Buffer.from(source.source,'utf8');
    await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);
    records.push({id,path:id,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  return records;
}

async function saveResult(result, output, request) {
  if (Array.isArray(result?.modules)) {
    if (!output) throw new TypeError('JavaScript project output requires --output directory');
    const directory = resolve(output), ids = new Set();
    for (const module of result.modules) {
      if (typeof module.id !== 'string' || typeof module.javascript !== 'string' || ids.has(module.id) ||
          module.id.includes('\\') || isAbsolute(module.id)) throw new TypeError('invalid compiler project module');
      const path = resolve(directory, module.id), part = relative(directory, path);
      if (!part || part === '..' || part.startsWith('..' + sep) || isAbsolute(part)) throw new TypeError('project output escapes its directory');
      ids.add(module.id);
      await mkdir(dirname(path), {recursive: true});
      const mapping = typeof module.sourceMap === 'string';
      await writeFile(path, module.javascript + (mapping ? '\n//# sourceMappingURL=' + encodeURIComponent(basename(path) + '.map') + '\n' : ''));
      if (mapping) await writeFile(path + '.map', module.sourceMap);
      if (Array.isArray(module.macroOrigins)) await writeFile(path + '.macro-origins.json', JSON.stringify(module.macroOrigins, null, 2) + '\n');
    }
    const hostSources=await saveHostSources(directory,request?.hostSources,[...ids,'eliscript-project.json']);
    await writeFile(resolve(directory, 'eliscript-project.json'), JSON.stringify({target: result.target, entry: result.entry, modules: result.modules.map(module => ({id: module.id, path: module.id, ...(typeof module.sourceMap === 'string' ? {sourceMapPath: module.id + '.map'} : {}), ...(Array.isArray(module.macroOrigins) ? {macroOriginsPath: module.id + '.macro-origins.json'} : {})})),...(hostSources.length?{hostSources}:{})}, null, 2) + '\n');
    return;
  }
  let data;
  if (result?.bytes !== undefined) data = decodeCompilerBinary(result.bytes);
  else if (typeof result?.javascript === 'string') data = result.javascript;
  else data = encodeCompilerMetadata(result) + '\n';
  if (!output) {
    if (data instanceof Uint8Array) throw new TypeError('binary compiler output requires --output');
    process.stdout.write(data);
    return;
  }
  const path = resolve(output);
  await mkdir(dirname(path), {recursive: true});
  await writeFile(path, data);
  if (typeof result?.sourceMap === 'string') await writeFile(path + '.map', result.sourceMap);
  if (result?.debug != null) await writeCompilerMetadata(path + '.debug.json', result.debug);
  if (result?.bytes !== undefined && (result?.descriptor || result?.abi === 'memory-u32')) {
    let project;
    if(result.descriptor?.project){
      const facades=createManagedProjectFacades(result.descriptor,{entry:result.entry??request?.entry});
      for(const file of facades.files){
        const facadePath=resolve(dirname(path),file.id),part=relative(dirname(path),facadePath);
        if(!part||part==='..'||part.startsWith('..'+sep)||isAbsolute(part))throw new TypeError('mixed project facade escapes the output directory');
        await mkdir(dirname(facadePath),{recursive:true});await writeFile(facadePath,file.source);
      }
      project={entry:facades.entry,registry:facades.registry,loadEntry:facades.loadEntry,files:facades.files.map(file=>file.id)};
    }
    const hostSources=await saveHostSources(dirname(path),request?.hostSources,[basename(path),basename(path)+'.json',basename(path)+'.debug.json',...(project?.files??[])]);
    await writeCompilerMetadata(path + '.json', {
      target: result.target,
      ...(result.abi === 'memory-u32' ? {abi:'memory-u32'} : {}),
      entry: result.entry ?? request?.entry,
      ...(result.target === 'native' ? {nativeTarget: result.nativeTarget ?? request?.nativeTarget, nativeFormat: result.nativeFormat ?? request?.nativeFormat} : {}),
      descriptor: result.descriptor,
      ...(result.typed ? {typed: result.typed} : {}),
      ...(result.debug ? {debugPath: basename(path) + '.debug.json'} : {}),
      ...(project?{project}:{}),
      ...(hostSources.length?{hostSources}:{}),
    });
  }
}

async function command(args) {
  const {values, positionals} = parseArgs({args, allowPositionals: true, strict: true, options: {
    help: {type: 'boolean', short: 'h'},
    'json-errors': {type: 'boolean'},
    seed: {type: 'boolean'},
    host: {type: 'string'},
    profile: {type: 'string'},
    output: {type: 'string', short: 'o'},
    input: {type: 'string', short: 'i'},
    project: {type: 'string'},
    root: {type: 'string'},
    'host-modules': {type:'string'},
    'macro-capability': {type: 'string', multiple: true},
    'macro-dependency': {type: 'string', multiple: true},
    target: {type: 'string'},
    request: {type: 'string'},
    runtime: {type: 'string'},
    'compiler-artifact': {type: 'string'},
    'compiler-artifacts': {type:'string',multiple:true},
    'producer-artifact': {type: 'string'},
    'native-target': {type: 'string'},
    'native-format': {type: 'string'},
    'source-map': {type: 'boolean'},
    debug: {type: 'boolean'},
    generations: {type: 'string'},
    hosts: {type: 'string'},
  }});
  if (values.help) {process.stdout.write(help); return;}
  const command = positionals[0];
  if (positionals.length !== 1) throw new TypeError('provide exactly one compiler command');
  const nativeTarget = values['native-target'] ?? (process.platform === 'linux' ? 'arm64-linux' : 'arm64-macos');
  if(command==='compiler-grid'||command==='matrix'){
    if(!values.output)throw new TypeError(command+' requires --output');
    const generations=values.generations===undefined?undefined:Number(values.generations);
    if(generations!==undefined&&(!/^[1-9][0-9]*$/.test(values.generations)||!Number.isSafeInteger(generations)))throw new TypeError('--generations requires a positive safe integer');
    const options={outputRoot:resolve(values.output),profile:values.profile??'small',nativeTarget,
      ...(values.root?{sourceRoot:resolve(values.root)}:{}),...(generations===undefined?{}:{generations})};
    if(values['compiler-artifacts']){
      options.compilerArtifacts=[];
      for(const metadataFile of values['compiler-artifacts']){
        const metadataPath=resolve(metadataFile),artifact=await readCompilerMetadata(metadataPath);
        options.compilerArtifacts.push({...artifact,path:resolve(dirname(metadataPath),artifact.path),metadataPath});
      }
    }
    const grid=await bootstrapCompilerGrid(options);
    process.stdout.write(grid.directory+'\n');
    if(grid.metadata.identityVerification!=='identical')throw new Error('complete compiler grid has not established all same-target identities');
    if(command==='matrix'){
      const {buildCompilerMatrix}=await import('./compiler-matrix.mjs');
      const matrix=await buildCompilerMatrix({...options,compilerArtifacts:grid.canonicalArtifacts,
        compilerGrid:{directory:grid.directory,metadata:grid.metadata}});
      process.stdout.write(matrix.directory+'\n');
      if(matrix.metadata.verification!=='equivalent')throw new Error('complete original compiler corpus matrix has not passed');
    }
    return;
  }
  if (command === 'bootstrap' || command === 'bootstrap-all') {
    if (!values.output) throw new TypeError(command + ' requires --output');
    const generations = values.generations === undefined ? undefined : Number(values.generations);
    if (generations !== undefined && (!/^[1-9][0-9]*$/.test(values.generations) || !Number.isSafeInteger(generations))) {
      throw new TypeError('--generations requires a positive safe integer');
    }
    if (command === 'bootstrap-all' && values.hosts !== undefined) throw new TypeError('bootstrap-all uses all three hosts');
    const options = {outputRoot: resolve(values.output), profile: values.profile ?? 'small',
      nativeTarget,
      ...(values.root ? {sourceRoot: resolve(values.root)} : {}),
      ...(generations === undefined ? {} : {generations})};
    if (command === 'bootstrap') {
      if (values.hosts !== undefined) options.hosts = values.hosts.split(',');
      else options.host = values.host ?? 'wasm';
    }
    const result = command === 'bootstrap-all'
      ? await bootstrapIndependentCompilers(options) : await bootstrapCompilerChain(options);
    process.stdout.write(result.directory + '\n');
    return;
  }
  if (command === 'package') {
    if (!values['compiler-artifact'] || !values.output) throw new TypeError('package requires --compiler-artifact and --output');
    const result = await packageIndependentCompiler({artifact: values['compiler-artifact'], outputRoot: resolve(values.output)});
    process.stdout.write(result.manifestPath + '\n');
    return;
  }
  if (command === 'build') {
    if (!values.output) throw new TypeError('build requires --output');
    if (Boolean(values.seed) === Boolean(values['producer-artifact'])) {
      throw new TypeError('build requires exactly one of --seed or --producer-artifact');
    }
    let opened, failed = false;
    try {
      if (values['producer-artifact']) opened = await openCompiler(values['producer-artifact']);
      const artifact = await buildIndependentCompiler({
        host: values.host ?? 'wasm',
        outputRoot: resolve(values.output),
        profile: values.profile ?? 'small',
        session: opened?.session,
        nativeTarget,
        ...(values.root ? {sourceRoot: resolve(values.root)} : {}),
        ...(values.debug === undefined ? {} : {debug: values.debug}),
      });
      process.stdout.write(artifact.metadataPath + '\n');
    } catch (error) {failed = true; throw error;}
    finally {await closeCompiler(opened?.session, failed);}
    return;
  }
  if (command !== 'compile' && command !== 'request') throw new TypeError('unknown compiler command: ' + command);
  if (!values['compiler-artifact']) throw new TypeError(command + ' requires --compiler-artifact');
  const {session, artifact, metadataPath} = await openCompiler(values['compiler-artifact']);
  let failed = false;
  try {
    let request;
    if (command === 'request') {
      if (!values.request) throw new TypeError('request requires --request');
      request = JSON.parse(await readText(values.request));
      if(['project','project-ir','emit-ir'].includes(request?.operation)&&
          (request.target==='wasm'||request.target==='native')) {
        await session.request(values.runtime?{operation:'runtime',source:await readText(values.runtime),
          filename:'bootstrap/runtime/memory.eli'}:{operation:'runtime'});
      }
    } else {
      if (Boolean(values.input) === Boolean(values.project)) throw new TypeError('compile requires exactly one of --input or --project');
      const target = values.target === 'js' ? 'javascript' : values.target ?? 'javascript';
      if (values.project) {
        if (!values.root) throw new TypeError('project compilation requires an explicit --root');
        if (!values.output) throw new TypeError('project compilation requires --output');
        const dependencies = (values['macro-dependency'] ?? []).map(value => {
          const equal = value.indexOf('=');
          if (equal <= 0 || equal === value.length - 1) throw new TypeError('macro dependency must be SPECIFIER=ROOT_RELATIVE_FILE');
          return {specifier: value.slice(0, equal), path: value.slice(equal + 1)};
        });
        request = await loadCompilerProject({root: values.root, entry: values.project, target,
          sourceMap: Boolean(values['source-map']), debug: Boolean(values.debug), macroCapabilities: values['macro-capability'] ?? [], macroDependencies: dependencies,
          memory: artifact.memory, nativeTarget, nativeFormat: values['native-format'] ?? 'library'});
        if (target === 'wasm' || target === 'native') {
          await session.request(values.runtime ? {operation: 'runtime', source: await readText(values.runtime),
            filename: 'bootstrap/runtime/memory.eli'} : {operation: 'runtime'});
        }
      } else {
      if (values.root || values['macro-capability']?.length || values['macro-dependency']?.length) throw new TypeError('project root and macro file options require --project');
      const source = await readText(values.input), filename = values.input === '-' ? '<stdin>' : values.input;
      if (target === 'javascript') {
        request = {operation: 'compile', source, filename};
        if (values['source-map']) request.sourceMap = {generatedFile: values.output ?? 'output.mjs', sourceName: filename};
      } else if (target === 'wasm' || target === 'native') {
        if (!values.output) throw new TypeError('binary compiler output requires --output');
        await session.request(values.runtime ? {operation: 'runtime', source: await readText(values.runtime),
          filename: 'bootstrap/runtime/memory.eli'} : {operation: 'runtime'});
        request = {
          operation: 'project',
          modules: [{id: 'entry.mjs', source, filename}],
          entry: 'entry.mjs',
          target,
          debug: Boolean(values.debug),
          memory: artifact.memory,
          nativeTarget,
          nativeFormat: values['native-format'] ?? 'library',
        };
      } else throw new TypeError('unknown compiler output target: ' + target);
      }
    }
    if(values['host-modules']){
      if(!['project','project-ir'].includes(request?.operation))throw new TypeError('--host-modules requires a project request');
      const declarations=JSON.parse(await readText(values['host-modules']));
      if(!Array.isArray(declarations))throw new TypeError('host module declarations must be an array');
      request.hostModules=declarations;
    }
    await saveResult(await session.request(request), values.output, request);
  } catch (error) {failed = true; throw error;}
  finally {await closeCompiler(session, failed);}
}

export async function main(args = process.argv.slice(2)) {
  try {return await command(args);}
  catch (error) {
    if (!args.includes('--json-errors')) throw error;
    process.stderr.write(renderCompilerCLIError(error, {json: true}) + '\n');
    process.exitCode = 1;
  }
}

export const runCompilerCLI = main;

export function renderCompilerCLIError(error, {json = false} = {}) {
  if (json) return JSON.stringify({format: 'eliscript-compiler-cli-error', version: 1, error: compilerFailure(error)});
  if(typeof error?.stack==='string')return error.stack;
  return error!==null&&typeof error==='object'?JSON.stringify(compilerFailure(error),null,2):String(error);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(renderCompilerCLIError(error) + '\n');
    process.exitCode = 1;
  });
}
