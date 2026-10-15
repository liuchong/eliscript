// Every test file gets a fresh process. Persistent bun:test worker isolates can
// retain native resources across files; process exit is the isolation boundary.
export const FILE_WORKERS = 2;

export async function runTestFiles(files) {
  if (!Array.isArray(files) || files.length === 0 ||
      files.some(file => typeof file !== 'string' || !file.endsWith('.test.mjs')) ||
      new Set(files).size !== files.length) throw new TypeError('expected unique test files');
  const children = new Set(), results = [];
  let cursor = 0, signalCode = 0;
  const cancel = code => {
    signalCode = code;
    for (const child of children) child.kill(code === 130 ? 'SIGINT' : 'SIGTERM');
  };
  const interrupt = () => cancel(130), terminate = () => cancel(143);
  process.on('SIGINT', interrupt);process.on('SIGTERM', terminate);
  try {
    await Promise.all(Array.from({length: Math.min(FILE_WORKERS, files.length)}, async () => {
      while (!signalCode && cursor < files.length) {
        const index = cursor++, file = files[index];let child;
        try {
          child = Bun.spawn([process.execPath, 'test', file], {stdin: 'ignore', stdout: 'inherit', stderr: 'inherit'});
          children.add(child);
          results[index] = {file, exitCode: await child.exited};
        } catch (error) {
          console.error(error);results[index] = {file, exitCode: 1};
        } finally {if (child) children.delete(child);}
      }
    }));
  } finally {process.off('SIGINT', interrupt);process.off('SIGTERM', terminate);}
  return {results: results.filter(Boolean), exitCode: signalCode || (results.some(result => result.exitCode !== 0) ? 1 : 0)};
}

if (import.meta.main) {
  const files = process.argv.slice(2), result = await runTestFiles(files);
  console.log(`Test files: ${result.results.length}/${files.length} completed; ${result.results.filter(item => item.exitCode !== 0).length} failed`);
  process.exitCode = result.exitCode;
}
