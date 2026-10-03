import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';

const root = resolve(import.meta.dir, '..');
async function run(command, env = {}) {
  const child = Bun.spawn(command, { cwd: root, env: { ...process.env, ...env }, stdout: 'pipe', stderr: 'pipe' });
  const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (code) throw new Error(`${command.join(' ')}\n${err || out}`);
  return out.trim();
}

test('wire modules compile identically with both compilers and execute real HTTP under Bun and Node', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eliscript-wire-'));
  try {
    const bootstrap = resolve(directory, 'compiler');
    await run([resolve(root, 'bin/eliscript-bootstrap')], { ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrap });
    const sources = ['stdlib/mdp.eli', 'stdlib/mds.eli', 'stdlib/gepo.eli', 'tests/fixtures/wire.eli'];
    const outputs = [];
    for (const [compiler, family] of [['eliscript-seed', 'seed'], ['eliscript-portable', 'portable']]) {
      const out = resolve(directory, family); outputs.push(out);
      await mkdir(out); await symlink(resolve(root, 'runtime'), resolve(out, 'runtime'), 'dir');
      for (const source of sources) {
        const target = resolve(out, source === sources.at(-1) ? 'tests/fixtures/wire.mjs' : source);
        await mkdir(dirname(target), { recursive: true });
        await run([resolve(root, 'bin', compiler), '--source-map', '--output', target, resolve(root, source)], { ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrap });
      }
      for (const [host, flag, loader] of [['bun', '--preload', 'compiled-eli-bun-preload.mjs'], [process.env.NODE ?? 'node', '--experimental-loader', 'compiled-eli-node-loader.mjs']]) {
        const report = JSON.parse(await run([host, flag, resolve(root, 'tests/fixtures', loader), resolve(root, 'tests/fixtures/wire-host.mjs'), resolve(out, 'tests/fixtures/wire.mjs')]));
        expect(report).toEqual({ codec: true, discovery: true, usageSafe: true, post: true });
      }
    }
    for (const source of sources) {
      const file = source === sources.at(-1) ? 'tests/fixtures/wire.mjs' : source;
      for (const extension of ['', '.map']) expect(await readFile(resolve(outputs[0], file + extension), 'utf8')).toBe(await readFile(resolve(outputs[1], file + extension), 'utf8'));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 120000);
