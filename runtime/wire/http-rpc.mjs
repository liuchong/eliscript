const mediaType = 'text/markdown; charset=utf-8';
const line = value => String(value).replace(/[\r\n]/gu, ' ');
function path(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || /[\s?#`\\]/u.test(value) || value.includes('//') || (value !== '/' && value.endsWith('/')) || value.split('/').some(p => p === '.' || p === '..') || ['/.well-known/gepo', '/.gepo'].some(p => value === p || value.startsWith(p + '/')) || new URL(value, 'https://local.invalid').pathname !== value) throw new TypeError('Expected a canonical public operation path');
  return value;
}
function target(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new TypeError('Expected an HTTP URL without credentials');
  url.hash = ''; return url;
}
function parent(value) { return value === '/' ? null : value.slice(0, value.lastIndexOf('/')) || '/'; }

export function defineOperation(options) {
  path(options.path);
  if (typeof options.execute !== 'function') throw new TypeError('Operation requires an execute function');
  return Object.freeze({ title: options.path, summary: 'Invoke this operation.', contentType: 'application/json', request: 'Body is service-defined.', success: 'Use HTTP status and response representation.', failures: [], effect: 'Service-defined.', retry: 'No automatic POST retry.', ...options });
}

export function usageMarkdown(operation) {
  path(operation.path);
  return `# ${line(operation.title ?? operation.path)}\n\nPOST \`${operation.path}\` with Content-Type: ${line(operation.contentType ?? 'application/json')}.\n\nPurpose: ${line(operation.summary ?? '')}\nRequest: ${line(operation.request ?? 'Body is service-defined.')}\nSuccess: ${line(operation.success ?? 'Use HTTP status and response representation.')}\nFailures: ${line((operation.failures ?? []).join('; ') || 'Use applicable HTTP error statuses.')}\nEffect: ${line(operation.effect ?? 'Service-defined.')}\nRetry: ${line(operation.retry ?? 'No automatic POST retry.')}\n`;
}

function tree(operations) {
  const nodes = new Map([['/', { operation: null, children: new Set() }]]);
  for (const operation of operations) {
    path(operation.path);
    if (nodes.get(operation.path)?.operation) throw new TypeError('Duplicate operation path');
    if (!nodes.has(operation.path)) nodes.set(operation.path, { operation: null, children: new Set() });
    nodes.get(operation.path).operation = operation;
    let child = operation.path;
    while (parent(child) !== null) {
      const directory = parent(child);
      if (!nodes.has(directory)) nodes.set(directory, { operation: null, children: new Set() });
      nodes.get(directory).children.add(child); child = directory;
    }
  }
  return nodes;
}

export function pathIndexMarkdown(title, operations, location = '/') {
  path(location);
  const nodes = tree(operations), node = nodes.get(location);
  if (!node) return null;
  const children = [...node.children].sort();
  const kind = node.operation ? (children.length ? 'operation and directory' : 'operation') : 'directory';
  let result = `# ${line(title ?? 'Service')}\n\nGEPO 0.2\nPath: \`${location}\`\nParent: ${parent(location) === null ? 'none' : `\`${parent(location)}\``}\nKind: ${kind}\n`;
  if (node.operation) result += `\n## Usage\n\n${usageMarkdown(node.operation)}`;
  result += '\n## Children\n\n';
  if (!children.length) result += node.operation ? 'No immediate child paths.\n' : 'The visible capability set is empty.\n';
  else for (const child of children) result += `- \`${child}\` — ${line(nodes.get(child).operation?.summary ?? 'Directory')}\n`;
  return result;
}

export function discoveryCandidates(value) {
  const url = target(value); url.search = '';
  const root = url.origin;
  return [...new Set([...(url.pathname !== '/' ? [`${url.href}?.gepo`] : []), `${root}/?.gepo`, `${root}/.gepo`, `${root}/.well-known/gepo`])];
}

export function classifyDiscovery(response) {
  if (response.status < 200 || response.status >= 300 || !response.contentType) return { accepted: false, paths: [], empty: false };
  const type = response.contentType.split(';')[0].trim().toLowerCase();
  if (!['text/markdown', 'text/plain'].includes(type) || !/\bGEPO\b/u.test(response.body)) return { accepted: false, paths: [], empty: false };
  const children = response.body.split(/^## Children\s*$/mu).at(-1);
  const paths = [...new Set([...children.matchAll(/^\s*-\s+`(\/[^`\s]*)`/gmu)].map(m => m[1]))];
  if (!paths.length && /^Path: `\/`$/mu.test(response.body) && /^Kind: operation$/mu.test(response.body)) paths.push('/');
  const empty = /visible capability set is empty|no visible (?:operations|capabilities)/iu.test(children);
  return { accepted: paths.length > 0 || empty, paths, empty };
}

export function createService({ title = 'Service', operations = [], authorize = () => true, visible = () => true } = {}) {
  const entries = operations.map(defineOperation); tree(entries);
  const response = (body, status = 200, headers = {}) => new Response(body, { status, headers: { 'Content-Type': mediaType, 'Cache-Control': 'private, no-store', ...headers } });
  return async function serve(request) {
    const url = new URL(request.url);
    const fixedEntry = ['/.gepo', '/.well-known/gepo'].includes(url.pathname);
    const discovery = ['GET', 'HEAD'].includes(request.method) && (url.searchParams.has('.gepo') || fixedEntry);
    const location = fixedEntry ? '/' : url.pathname;
    const available = [];
    for (const operation of entries) if (await visible(request, operation)) available.push(operation);
    const nodes = tree(available), node = nodes.get(location);
    if (!node) return response('Unknown path', 404);
    const permission = await authorize(request, node.operation, discovery ? 'index' : request.method === 'POST' ? 'invoke' : 'usage');
    if (permission instanceof Response) return permission;
    if (permission !== true) return response('Forbidden', 403);
    const allow = node.operation && !fixedEntry ? 'GET, HEAD, OPTIONS, POST' : 'GET, HEAD, OPTIONS';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Allow: allow } });
    if (request.method === 'GET' || request.method === 'HEAD') {
      const body = discovery || !node.operation ? pathIndexMarkdown(title, available, location) : usageMarkdown(node.operation);
      return response(request.method === 'HEAD' ? null : body);
    }
    if (request.method !== 'POST' || !node.operation || ['/.gepo', '/.well-known/gepo'].includes(url.pathname)) return response('Method not allowed', 405, { Allow: allow });
    const result = await node.operation.execute(request);
    if (!(result instanceof Response)) throw new TypeError('Operation must return a Response');
    return result;
  };
}

export function createClient({ fetch: transport = globalThis.fetch, headers: defaults = {}, maxBytes = 2097152, timeoutMs = 30000, classify = classifyDiscovery } = {}) {
  if (typeof transport !== 'function' || typeof classify !== 'function' || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new TypeError('Invalid client options');
  const defaultHeaders = new Headers(defaults);
  async function send(url, method, body, options = {}) {
    const headers = new Headers(defaultHeaders);
    new Headers(options.headers).forEach((value, key) => headers.set(key, value));
    if (!headers.has('Accept')) headers.set('Accept', 'text/markdown, text/plain;q=0.8, */*;q=0.1');
    if (options.contentType) headers.set('Content-Type', options.contentType);
    const controller = new AbortController();
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    if (signal.aborted) throw signal.reason ?? new Error('HTTP request aborted');
    const timer = setTimeout(() => controller.abort(new Error('HTTP timeout')), timeoutMs);
    let onAbort;
    const aborted = new Promise((resolve, reject) => {
      onAbort = () => reject(signal.reason ?? new Error('HTTP request aborted'));
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const reply = await Promise.race([aborted, transport(url.href, { method, body, headers, redirect: 'manual', signal })]);
      if (reply.status >= 300 && reply.status < 400) { await reply.body?.cancel(); throw new Error('Redirect requires explicit caller handling'); }
      const chunks = []; let size = 0;
      if (reply.body) {
        const reader = reply.body.getReader();
        try {
          while (true) {
            const { done, value } = await Promise.race([aborted, reader.read()]); if (done) break;
            size += value.byteLength;
            if (size > maxBytes) { await reader.cancel(); throw new RangeError('HTTP response byte limit'); }
            chunks.push(value);
          }
        } catch (error) { await reader.cancel().catch(() => {}); throw error; }
        finally { reader.releaseLock(); }
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return { url: url.href, status: reply.status, contentType: reply.headers.get('Content-Type'), headers: reply.headers, body: new TextDecoder().decode(bytes) };
    } finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort); }
  }
  async function usage(value, options = {}) {
    const url = target(value); url.searchParams.delete('.gepo');
    return send(url, 'GET', undefined, options);
  }
  async function index(value, options = {}) {
    const url = target(value); url.search = '.gepo';
    return send(url, 'GET', undefined, options);
  }
  return Object.freeze({ usage, index,
    async discover(value, options = {}) {
      const attempts = [];
      for (const candidate of discoveryCandidates(value)) {
        const reply = await send(target(candidate), 'GET', undefined, options);
        const result = await classify(reply);
        attempts.push({ url: reply.url, status: reply.status, accepted: result.accepted });
        if (result.accepted) return { ...reply, paths: result.paths, state: result.empty ? 'empty' : 'found', attempts };
      }
      return { state: 'not-found', attempts };
    },
    async invoke(value, body, options = {}) {
      if (options.allowPost !== true) throw new TypeError('Invocation requires allowPost: true');
      if (body === undefined) throw new TypeError('Invocation requires an explicit body');
      const url = target(value);
      if (url.searchParams.has('.gepo')) throw new TypeError('Discovery parameter is reserved');
      const description = await usage(url, options);
      if (description.status < 200 || description.status >= 300) throw new Error(`Usage request failed: ${description.status}`);
      return send(url, 'POST', body, options);
    },
  });
}
