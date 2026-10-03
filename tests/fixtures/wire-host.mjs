import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const wire = await import(pathToFileURL(process.argv[2]));
assert.deepEqual(wire.codec_report().data, { User: { name: 'Ada', age: 42 } });
assert.equal(wire.codec_report().validation.valid, true);
assert.deepEqual(wire.roundtrip({ User: { name: '小明😀', tags: ['中文', 'a|b'], nested: { ok: true } } }), { User: { name: '小明😀', tags: ['中文', 'a|b'], nested: { ok: true } } });
let calls = 0;
const serve = wire.make_service([{ path: '/rpc/echo', title: 'Echo', execute: async request => {
  calls++; return new Response(await request.text(), { headers: { 'Content-Type': 'text/markdown; variant=mdp' } });
} }]);
const server = createServer(async (req, res) => {
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const response = await serve(new Request(`http://127.0.0.1:${server.address().port}${req.url}`, {
      method: req.method, headers: req.headers, ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
    }));
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
  } catch { res.writeHead(500); res.end('Server error'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const client = wire.make_client({ timeoutMs: 3000 });
  assert.equal((await client.discover(origin)).state, 'found');
  assert.match((await client.index(`${origin}/rpc`)).body, /`\/rpc\/echo`/u);
  await client.usage(`${origin}/rpc/echo`); assert.equal(calls, 0);
  const response = await client.invoke(`${origin}/rpc/echo`, '- value: 42\n', { allowPost: true, contentType: 'text/markdown; variant=mdp' });
  assert.equal(response.body, '- value: 42\n'); assert.equal(calls, 1);
  const payload = { User: { name: '中文😀', nested: [1, { ok: true }] } };
  assert.deepEqual(await wire.echo_data(`${origin}/rpc/echo`, payload), payload);
  assert.equal(calls, 2);
  console.log(JSON.stringify({ codec: true, discovery: true, usageSafe: true, post: true }));
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
