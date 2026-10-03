import { expect, test } from 'bun:test';
import { createService, createClient, discoveryCandidates, pathIndexMarkdown } from '../runtime/wire/http-rpc.mjs';

test('hierarchical HTTP discovery and usage never execute operations; invocation uses POST', async () => {
  let calls = 0;
  const service = createService({ title: 'Example', operations: [
    { path: '/math/add', title: 'Add', request: 'JSON a,b', success: '200 JSON sum', effect: 'Read only', execute: async req => { calls++; const { a, b } = await req.json(); return Response.json({ sum: a + b }); } },
    { path: '/math', title: 'Math', execute: () => new Response('math') },
  ] });
  const fetch = (url, options) => service(new Request(url, options));
  const client = createClient({ fetch });
  const discovery = await client.discover('https://example.test/');
  expect(discovery.state).toBe('found');
  expect(discovery.paths).toEqual(['/math']);
  const index = await client.index('https://example.test/math?secret=removed');
  expect(index.body).toContain('operation and directory');
  expect(index.body).toContain('`/math/add`');
  expect((await client.usage('https://example.test/math/add?.gepo&x=1')).body).toContain('POST `/math/add`');
  expect(calls).toBe(0);
  await expect(client.invoke('https://example.test/math/add', '{}')).rejects.toThrow();
  expect(calls).toBe(0);
  const reply = await client.invoke('https://example.test/math/add', '{"a":2,"b":3}', { allowPost: true, contentType: 'application/json' });
  expect(JSON.parse(reply.body)).toEqual({ sum: 5 });
  expect(calls).toBe(1);
  expect((await service(new Request('https://example.test/math/add?.gepo=false'))).status).toBe(200);
  expect((await service(new Request('https://example.test/math/add', { method: 'HEAD' }))).body).toBeNull();
  const headIndex = await service(new Request('https://example.test/.gepo', { method: 'HEAD' }));
  expect(headIndex.status).toBe(200); expect(headIndex.body).toBeNull();
  expect((await service(new Request('https://example.test/.gepo', { method: 'OPTIONS' }))).headers.get('Allow')).toBe('GET, HEAD, OPTIONS');
  expect((await service(new Request('https://example.test/.gepo', { method: 'POST' }))).status).toBe(405);
  expect((await service(new Request('https://example.test/math', { method: 'DELETE' }))).status).toBe(405);
});

test('fallback validates response content, distinguishes empty, and strips unrelated queries', async () => {
  const urls = [];
  const client = createClient({ fetch: async (url, options) => {
    urls.push(String(url)); expect(options.redirect).toBe('manual');
    if (urls.length === 1) return new Response('<html>GEPO</html>', { headers: { 'Content-Type': 'text/html' } });
    return new Response(pathIndexMarkdown('Empty', [], '/'), { headers: { 'Content-Type': 'text/markdown' } });
  } });
  expect((await client.discover('https://example.test/?secret=x#fragment')).state).toBe('empty');
  expect(urls).toEqual(['https://example.test/?.gepo', 'https://example.test/.gepo']);
  expect(discoveryCandidates('https://example.test/a?secret=x')[0]).toBe('https://example.test/a?.gepo');
  const rootService = createService({ operations: [{ path: '/', execute: () => new Response('root') }] });
  const rootClient = createClient({ fetch: (url, options) => rootService(new Request(url, options)) });
  expect((await rootClient.discover('https://example.test')).state).toBe('found');
  expect(() => createService({ operations: [{ path: '/a/../b', execute() {} }] })).toThrow();
  await expect(client.discover('https://user:password@example.test')).rejects.toThrow();
});

test('HTTP authorization, bounded bodies, redirects and lost POST responses retain their boundaries', async () => {
  let calls = 0;
  const service = createService({ operations: [{ path: '/private', execute: () => { calls++; return new Response('done'); } }], authorize: () => false });
  expect((await service(new Request('https://example.test/private', { method: 'POST' }))).status).toBe(403);
  expect(calls).toBe(0);
  const client = createClient({ fetch: async () => new Response('12345'), maxBytes: 4 });
  await expect(client.usage('https://example.test/a')).rejects.toThrow('limit');
  const redirect = createClient({ fetch: async () => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.test/' } }) });
  await expect(redirect.usage('https://example.test/a')).rejects.toThrow('Redirect');
  let posts = 0;
  const loss = createClient({ fetch: async (url, opts) => { if (opts.method === 'POST') { posts++; throw new Error('lost'); } return new Response('usage'); } });
  await expect(loss.invoke('https://example.test/a', '', { allowPost: true })).rejects.toThrow('lost');
  expect(posts).toBe(1);
  const timeout = createClient({ fetch: () => new Promise(() => {}), timeoutMs: 10 });
  await expect(timeout.usage('https://example.test/a')).rejects.toThrow('timeout');
  const stalledBody = createClient({ fetch: async () => new Response(new ReadableStream({ pull() {} })), timeoutMs: 10 });
  await expect(stalledBody.usage('https://example.test/a')).rejects.toThrow('timeout');
  const aborted = new AbortController(); aborted.abort(new Error('cancelled'));
  let requests = 0;
  const cancelled = createClient({ fetch: async () => { requests++; return new Response('bad'); } });
  await expect(cancelled.usage('https://example.test/a', { signal: aborted.signal })).rejects.toThrow('cancelled');
  expect(requests).toBe(0);
});

test('identity visibility and application representations remain service-defined', async () => {
  const service = createService({ operations: [
    { path: '/public/read', execute: () => Response.json({ ok: true }) },
    { path: '/private/read', execute: () => new Response('secret') },
  ], visible: (request, operation) => !operation.path.startsWith('/private') || request.headers.get('Authorization') === 'example-user',
  authorize: request => request.method !== 'POST' ? true : new Response('Sign in', { status: 401 }) });
  const publicIndex = await (await service(new Request('https://example.test/?.gepo'))).text();
  expect(publicIndex).toContain('`/public`'); expect(publicIndex).not.toContain('/private');
  const privateIndex = await (await service(new Request('https://example.test/?.gepo', { headers: { Authorization: 'example-user' } }))).text();
  expect(privateIndex).toContain('`/private`');
  expect((await service(new Request('https://example.test/public/read', { method: 'POST' }))).status).toBe(401);
  const notFound = createClient({ fetch: async () => new Response('ordinary site') });
  const failure = await notFound.discover('https://example.test');
  expect(failure.state).toBe('not-found'); expect(failure.attempts).toHaveLength(3);
  const json = createClient({ fetch: async () => Response.json({ protocol: 'GEPO', children: ['/api'] }), classify: response => {
    const body = JSON.parse(response.body); return { accepted: body.protocol === 'GEPO', paths: body.children, empty: !body.children.length };
  } });
  expect((await json.discover('https://example.test')).paths).toEqual(['/api']);
});
