import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resourceLimits, startResourceSupervisor} from './resource-supervisor.mjs';

// The separator is mandatory so command arguments (including -- and negative
// numbers) pass through untouched. There is no unguarded execution option.
export function parseProtectedCommandArgs(args, env = process.env) {
  const separator = args.indexOf('--');
  if (separator < 0 || separator === args.length - 1)
    throw new TypeError('usage: guarded-command.mjs [--tree-rss-bytes N] [--total-rss-bytes N] -- command [args...]');
  const values = new Map();
  for (let index = 0; index < separator; index += 2) {
    const option = args[index], value = args[index + 1];
    if (!['--tree-rss-bytes', '--total-rss-bytes'].includes(option) || values.has(option) ||
        index + 1 >= separator || !/^[1-9][0-9]*$/.test(value))
      throw new TypeError('resource options require unique positive integer byte counts');
    values.set(option, Number(value));
  }
  const ceiling = resourceLimits({treeBytes: env.ELISCRIPT_TEST_TREE_RSS_BYTES,
    totalBytes: env.ELISCRIPT_TEST_TOTAL_RSS_BYTES});
  const limits = resourceLimits({treeBytes: values.get('--tree-rss-bytes') ?? ceiling.treeBytes,
    totalBytes: values.get('--total-rss-bytes') ?? ceiling.totalBytes});
  if (limits.treeBytes > ceiling.treeBytes || limits.totalBytes > ceiling.totalBytes)
    throw new RangeError('command-line limits cannot raise an existing environment limit');
  const command = args[separator + 1], commandArgs = args.slice(separator + 2);
  if (typeof command !== 'string' || command.length === 0 || commandArgs.some(arg => typeof arg !== 'string'))
    throw new TypeError('expected a command and string arguments');
  return {command, args: commandArgs, limits};
}

export async function runProtectedCommand(command, args = [], options = {}) {
  if (typeof command !== 'string' || !command || !Array.isArray(args) || args.some(arg => typeof arg !== 'string'))
    throw new TypeError('expected a command and string arguments');
  const archiveDirectory = resolve('.eliscript-cache', 'test-results');
  const archive = resolve(archiveDirectory, `guarded-command-${Date.now()}-${process.pid}.json`);
  let supervisor, signalCode = 0, outcome;
  const interrupt = () => {signalCode = 130;supervisor?.cancel('SIGINT');};
  const terminate = () => {signalCode = 143;supervisor?.cancel('SIGTERM');};
  process.on('SIGINT', interrupt);process.on('SIGTERM', terminate);
  try {
    supervisor = await startResourceSupervisor({limits: options.limits});
    if (signalCode) {
      supervisor.cancel(signalCode === 130 ? 'SIGINT' : 'SIGTERM');
      outcome = {failure: 'cancelled', exitCode: signalCode};
    } else outcome = await supervisor.run({id: 'command', file: command, command, args,
      cwd: options.cwd ?? process.cwd(), env: process.env});
  } catch (error) {
    outcome = {failure: 'resource-supervisor-unavailable', message: error.message, exitCode: 1};
  } finally {
    try {if (supervisor) await supervisor.close();}
    finally {process.off('SIGINT', interrupt);process.off('SIGTERM', terminate);}
  }
  const result = {...outcome, exitCode: signalCode || outcome.exitCode,
    ...(supervisor?.failure && !outcome.failure ? {failure: supervisor.failure.failure, exitCode: signalCode || 1} : {})};
  try {
    await mkdir(archiveDirectory, {recursive: true});
    await writeFile(archive, JSON.stringify({command, args, ...result,
      resourceFailure: supervisor?.failure ?? null}, null, 2) + '\n');
  } catch (error) {
    console.error(`Cannot archive protected command outcome: ${error.message}`);result.exitCode = signalCode || 1;
  }
  if (result.failure) console.error(`[${result.failure}] protected command stopped; details: ${archive}`);
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const {command, args, limits} = parseProtectedCommandArgs(process.argv.slice(2));
    process.exitCode = (await runProtectedCommand(command, args, {limits})).exitCode;
  } catch (error) {console.error(error.message);process.exitCode = 1;}
}
