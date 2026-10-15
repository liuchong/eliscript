import {basename} from 'node:path';

// Every test file gets a fresh process. Persistent bun:test worker isolates can
// retain native resources across files; process exit is the isolation boundary.
export const FILE_WORKERS = 2;
// These functional files retain their original time limits and execute alone
// so this runner does not overlap them with another resource-heavy process.
const exclusiveFiles = new Set([
  'wasm-compiler-ir-lower.test.mjs',
  'wasm-managed-array-sort.test.mjs',
  'native-compiler-modules.test.mjs',
  'bootstrap-compiler.test.mjs',
  'wasm-compiler-analyzer.test.mjs',
  'wasm-compiler-emitter.test.mjs',
  'independent-compiler-producers.test.mjs',
  'compiler-producer-stages.test.mjs',
  'wasm-managed-str.test.mjs',
  'native-backend.test.mjs',
  'native-memory-long-branches.test.mjs',
]);

function validateFiles(files) {
  if (!Array.isArray(files) || files.length === 0 ||
      files.some(file => typeof file !== 'string' || !file.endsWith('.test.mjs')) ||
      new Set(files).size !== files.length) throw new TypeError('expected unique test files');
}

// Partition only the file inventory. Each selected file retains its complete
// tests, resources and time limits, in its original relative execution order.
export function partitionTestFiles(files, index, count) {
  validateFiles(files);
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) ||
      index < 1 || count < 1 || index > count) throw new TypeError('invalid test-file shard index/count');
  return files.filter((_, position) => position % count === index - 1);
}

export function parseTestFileArgs(args) {
  if (!Array.isArray(args)) throw new TypeError('invalid test-file arguments');
  const files = [], options = new Map();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--shard-index' || arg === '--shard-count') {
      const value = args[++i];
      if (options.has(arg) || typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value) ||
          !Number.isSafeInteger(Number(value))) throw new TypeError('invalid test-file arguments: shard options require unique positive integers');
      options.set(arg, Number(value));
    } else if (typeof arg !== 'string' || arg.startsWith('-')) {
      throw new TypeError('invalid test-file arguments: unknown option');
    } else files.push(arg);
  }
  validateFiles(files);
  if (options.size === 0) return {files, shard: null};
  if (options.size !== 2 || options.get('--shard-index') > options.get('--shard-count'))
    throw new TypeError('invalid test-file arguments: both shard index/count are required, with index <= count');
  return {files, shard: {index: options.get('--shard-index'), count: options.get('--shard-count')}};
}

export async function runTestFiles(files) {
  validateFiles(files);
  const children = new Set(), results = [];
  let cursor = 0, signalCode = 0;
  const cancel = code => {
    signalCode = code;
    for (const child of children) child.kill(code === 130 ? 'SIGINT' : 'SIGTERM');
  };
  const interrupt = () => cancel(130), terminate = () => cancel(143);
  process.on('SIGINT', interrupt);process.on('SIGTERM', terminate);
  try {
    const runFile = async index => {
      const file = files[index];let child;
      try {
        child = Bun.spawn([process.execPath, 'test', file], {stdin: 'ignore', stdout: 'inherit', stderr: 'inherit'});
        children.add(child);
        results[index] = {file, exitCode: await child.exited};
      } catch (error) {
        console.error(error);results[index] = {file, exitCode: 1};
      } finally {if (child) children.delete(child);}
    };
    while (!signalCode && cursor < files.length) {
      if (exclusiveFiles.has(basename(files[cursor]))) await runFile(cursor++);
      else {
        let end = cursor;
        while (end < files.length && !exclusiveFiles.has(basename(files[end]))) end++;
        await Promise.all(Array.from({length: Math.min(FILE_WORKERS, end - cursor)}, async () => {
          while (!signalCode && cursor < end) await runFile(cursor++);
        }));
      }
    }
  } finally {process.off('SIGINT', interrupt);process.off('SIGTERM', terminate);}
  return {results: results.filter(Boolean), exitCode: signalCode || (results.some(result => result.exitCode !== 0) ? 1 : 0)};
}

if (import.meta.main) {
  try {
    const {files: inventory, shard} = parseTestFileArgs(process.argv.slice(2));
    const files = shard ? partitionTestFiles(inventory, shard.index, shard.count) : inventory;
    if (shard) console.log(`Test file shard ${shard.index}/${shard.count}: ${files.length}/${inventory.length} selected`);
    const result = files.length ? await runTestFiles(files) : {results: [], exitCode: 0};
    console.log(`Test files: ${result.results.length}/${files.length} completed; ${result.results.filter(item => item.exitCode !== 0).length} failed`);
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`Invalid test-file arguments: ${error.message}`);process.exitCode = 1;
  }
}
