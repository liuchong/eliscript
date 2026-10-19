import {readdir, realpath, stat, open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve, relative, isAbsolute, sep} from 'node:path';

const excludedDirectories = new Set([
  '.git', 'node_modules', 'dist', 'build', 'target', 'coverage',
  '.cache', '.eliscript-cache', '.next', '.nuxt', '.turbo', '.parcel-cache',
]);

function inside(root, path) {
  const part = relative(root, path);
  return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith('..' + sep));
}
function virtualPath(root, path) {
  return relative(root, path).split(sep).join('/');
}
async function authorizedPath(root, path) {
  const actual = await realpath(path);
  if (!inside(root, actual)) throw new Error('project path escapes the authorized root');
  return actual;
}
async function sourceText(root, path) {
  const actual = await authorizedPath(root, path);
  const handle = await open(actual, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let failed = false;
  try {
    const current = await authorizedPath(root, path);
    const opened = await handle.stat(), named = await stat(current);
    if (!opened.isFile() || opened.dev !== named.dev || opened.ino !== named.ino) {
      throw new Error('project source changed while opening');
    }
    const bytes = await handle.readFile();
    // Reject invalid UTF8 instead of silently changing source text. Keeping the
    // BOM in the string also keeps all existing scalar source offsets intact.
    return new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
  } catch (error) {failed = true; throw error;}
  finally {try {await handle.close();} catch (error) {if (!failed) throw error;}}
}
function macroSpecifier(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    throw new TypeError('macro dependency specifier must be a relative string');
  }
  let depth = 0;
  for (const part of value.split('/')) {
    if (part === '..') {if (--depth < 0) throw new TypeError('macro dependency specifier escapes its virtual root');}
    else if (part !== '' && part !== '.') depth++;
  }
  return value;
}

// Filesystem transport only: import discovery and rewriting belong to the
// selected compiler session, after its own reader/analyzer/lowering stages.
export async function loadCompilerProject({
  root, entry, target = 'javascript', sourceMap = false, debug = false,
  macroCapabilities = [], macroDependencies = [], memory,
  hostModules = [], literalSources,
  nativeTarget = process.platform === 'linux' ? 'arm64-linux' : 'arm64-macos', nativeFormat = 'library',
} = {}) {
  if (typeof root !== 'string' || !root || typeof entry !== 'string' || !entry) {
    throw new TypeError('project input requires an explicit root and entry');
  }
  if (target === 'js') target = 'javascript';
  if (!['javascript', 'wasm', 'native'].includes(target)) throw new TypeError('unknown project target');
  if (!['arm64-macos', 'arm64-linux'].includes(nativeTarget) || !['library', 'object'].includes(nativeFormat)) {
    throw new TypeError('unsupported native project output');
  }
  const logicalRoot = resolve(root), authorizedRoot = await realpath(logicalRoot);
  if (!(await stat(authorizedRoot)).isDirectory()) throw new TypeError('project root is not a directory');
  const entryPath = resolve(logicalRoot, entry);
  if (!inside(logicalRoot, entryPath) || !entryPath.endsWith('.eli')) throw new TypeError('project entry must be an .eli file inside root');
  await authorizedPath(authorizedRoot, entryPath);
  const modules = [],hostSources=[];
  if(!Array.isArray(hostModules))throw new TypeError('host module declarations must be an array');
  async function walk(path, ancestors) {
    const actual = await authorizedPath(authorizedRoot, path);
    if (ancestors.has(actual)) return;
    const next = new Set(ancestors); next.add(actual);
    const entries = await readdir(actual, {withFileTypes: true});
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const child of entries) {
      if (excludedDirectories.has(child.name)) continue;
      const file = resolve(path, child.name);
      const resolved = await authorizedPath(authorizedRoot, file);
      const details = await stat(resolved);
      if (details.isDirectory()) await walk(file, next);
      else if (details.isFile() && child.name.endsWith('.eli')) {
        const filename = virtualPath(logicalRoot, file);
        modules.push({id: filename.slice(0, -4) + '.mjs', filename, source: await sourceText(authorizedRoot, file)});
      } else if(details.isFile()&&child.name.endsWith('.mjs')){
        const filename=virtualPath(logicalRoot,file);
        hostSources.push({id:filename,filename,source:await sourceText(authorizedRoot,file)});
      }
    }
  }
  await walk(logicalRoot, new Set());
  const entryFilename = virtualPath(logicalRoot, entryPath);
  if (!modules.some(module => module.filename === entryFilename)) throw new Error('project entry is excluded or missing from the source graph');
  if (!Array.isArray(macroCapabilities) || !Array.isArray(macroDependencies)) throw new TypeError('macro capabilities and dependencies must be arrays');
  const capabilities = [...new Set(macroCapabilities)];
  if (capabilities.some(value => value !== 'read-file')) throw new TypeError('unsupported macro capability');
  if (macroDependencies.length && !capabilities.includes('read-file')) {
    throw new Error('macro dependencies require explicit read-file capability');
  }
  const files = [], specifiers = new Set();
  for (const dependency of macroDependencies) {
    const specifier = macroSpecifier(dependency?.specifier);
    if (specifiers.has(specifier)) throw new TypeError('duplicate macro dependency specifier');
    if (typeof dependency.path !== 'string' || !dependency.path) throw new TypeError('macro dependency requires a path');
    const path = resolve(logicalRoot, dependency.path);
    if (!inside(logicalRoot, path)) throw new Error('macro dependency escapes the authorized root');
    files.push({specifier, content: await sourceText(authorizedRoot, path)});
    specifiers.add(specifier);
  }
  return {
    operation: 'project', modules,
    ...(hostSources.length?{hostSources}:{}),
    ...(hostModules.length?{hostModules}:{}),
    ...(literalSources === undefined ? {} : {literalSources}),
    entry: entryFilename.slice(0, -4) + '.mjs', target, resolveImports: true,
    sourceMap: Boolean(sourceMap),
    debug: Boolean(debug),
    ...(capabilities.length || files.length ? {macroContext: {capabilities, files}} : {}),
    ...(memory ? {memory} : {}),
    nativeTarget, nativeFormat,
  };
}
