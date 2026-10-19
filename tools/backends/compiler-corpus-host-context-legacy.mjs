import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {readCompilerMetadata} from './compiler-metadata.mjs';
import {
  createManagedModuleGraph,
  createManagedProjectFacades,
  instantiateManagedRuntimeWithHostModules,
} from './managed-runtime.mjs';

const contexts = new Map();
const environmentKey = 'ELISCRIPT_ORIGINAL_PROGRAM_CONTEXT';

// This installs an already emitted program. No source is compiled here, and a
// native context continues through the native loader in every host process.
export async function openOriginalProgramContext(input, {identity} = {}) {
  const key = identity === undefined ? undefined : resolve(identity);
  if (key !== undefined && contexts.has(key)) return contexts.get(key);
  const pending = (async () => {
    if (!input || !['wasm', 'native'].includes(input.target) || typeof input.path !== 'string' ||
        typeof input.base !== 'string' || typeof input.entry !== 'string' || !input.descriptor?.project) {
      throw new TypeError('original program context requires the selected phased binary artifact');
    }
    const graph = createManagedModuleGraph(input.descriptor);
    const facades = createManagedProjectFacades(input.descriptor, {entry: input.entry});
    let runtime, closed = false;
    async function close() {
      if (closed) return;
      closed = true;
      let failure;
      for (const action of [() => runtime?.closeModule(), () => runtime?.collect(),
        () => {if(runtime&&runtime.live()!==0)throw new Error('original program retained managed values after module close');},
        () => {if(runtime&&runtime.stats().frameDepth!==0)throw new Error('original program retained managed frames after module close');},
        () => runtime?.close?.(), () => graph.close()]) {
        try {await action();} catch (error) {failure ??= error;}
      }
      if (key !== undefined) contexts.delete(key);
      if (failure) throw failure;
    }
    try {
      const options = {...input.memory, ...input.runtimeOptions, moduleGraph: graph,
        initializeModule: false, projectEntry: input.entry, projectModuleBaseURL: input.base,
        moduleBaseURL: pathToFileURL(input.path).href, nativeTarget: input.nativeTarget};
      if (input.target === 'wasm') {
        runtime = await instantiateManagedRuntimeWithHostModules(new Uint8Array(await readFile(input.path)), options);
      } else {
        const {instantiateNativeManagedRuntime} = await import('./native-managed-runtime.mjs');
        runtime = await instantiateNativeManagedRuntime(input.path, {typed: input.typed, descriptor: input.descriptor}, options);
      }
      if(input.runtimeOptions?.auto!==undefined)runtime.auto(input.runtimeOptions.auto);
      graph.attachRuntime(runtime).prepare();
      const registry = await import(new URL(facades.registry, input.base));
      registry.install(graph);
      return Object.freeze({graph, runtime, facades, close});
    } catch (error) {
      try {await close();} catch { /* Preserve the original loader/prepare error. */ }
      throw error;
    }
  })();
  if (key !== undefined) contexts.set(key, pending);
  try {return await pending;}
  catch (error) {if (key !== undefined && contexts.get(key) === pending) contexts.delete(key);throw error;}
}

// NODE_OPTIONS is inherited by the original suite's real Node subprocesses.
// The parent host keeps its original executable and command arguments. Each
// child installs fresh VM cells for the same product before its original code.
export function inheritOriginalProgramContext({configuration, sourceRoot}) {
  if (typeof configuration !== 'string' || typeof sourceRoot !== 'string') {
    throw new TypeError('original child context requires its actual configuration and source root');
  }
  const option = '--import=' + import.meta.url;
  const previous = process.env.NODE_OPTIONS ?? '';
  process.env.NODE_OPTIONS = previous.split(/\s+/).includes(option) ? previous : (previous ? previous + ' ' : '') + option;
  process.env[environmentKey] = resolve(configuration);
  process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT = resolve(sourceRoot);
}

// Shell entry points accept one runtime executable, rather than an executable
// plus preload arguments. Keep the actual Bun host and add only the selected
// artifact's initialization before its unchanged CLI program starts.
export async function originalProgramBunLauncher({directory,bun,configuration,sourceRoot}) {
  if([directory,bun,configuration,sourceRoot].some(value=>typeof value!=='string'||!value))
    throw new TypeError('original Bun launcher requires its selected artifact and executable');
  const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
  const option='--import='+import.meta.url;
  const nodeOptions=(process.env.NODE_OPTIONS??'').split(/\s+/).filter(value=>value&&value!==option).join(' ');
  const path=resolve(directory,'__eliscript_original_bun');
  const source='#!/bin/sh\n'+
    'export NODE_OPTIONS='+quote(nodeOptions)+'\n'+
    'if [ -z "${'+environmentKey+':-}" ]; then\n'+
    '  export '+environmentKey+'='+quote(resolve(configuration))+'\n'+
    'fi\n'+
    'export ELISCRIPT_ORIGINAL_SOURCE_ROOT='+quote(resolve(sourceRoot))+'\n'+
    'exec '+quote(bun)+' --preload '+quote(fileURLToPath(import.meta.url))+' "$@"\n';
  await writeFile(path,source,{flag:'wx',mode:0o700});
  return path;
}

// This branch is reached only through the explicit original-program preload.
// Importing the scheduler or defining an adapter never executes an artifact.
const inherited = process.env[environmentKey];
if (inherited) {
  const input = await readCompilerMetadata(resolve(inherited));
  const context = await openOriginalProgramContext(input, {identity: inherited});
  process.env.ELISCRIPT_ORIGINAL_TARGET = input.target;
  if (input.sourceRoot) process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT = input.sourceRoot;
  process.once('beforeExit', () => {
    context.close().catch(error => {
      process.stderr.write((error?.stack ?? String(error)) + '\n');
      if (!process.exitCode) process.exitCode = 1;
    });
  });
}
