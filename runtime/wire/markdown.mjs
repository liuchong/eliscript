const own = (value, key) => Object.hasOwn(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const put = (target, key, value) => Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u;

export class MarkdownError extends Error {
  constructor(code, line, message) { super(`${code} at line ${line}: ${message}`); this.name = 'MarkdownError'; this.code = code; this.line = line; }
}
const fail = (code, line, message) => { throw new MarkdownError(code, line, message); };

function scalar(text) {
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2)
    return text.slice(1, -1).replace(/\\(["\\ntr])/gu, (_, c) => ({ n: '\n', t: '\t', r: '\r' }[c] ?? c));
  if (number.test(text)) {
    const value = Number(text);
    if (!Number.isFinite(value)) throw new RangeError('Number exceeds finite IEEE 754 range');
    return value;
  }
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null' || text === '') return null;
  if (text === '{}') return {};
  if (text === '[]') return [];
  return text;
}

function cells(text) {
  const result = []; let cell = '';
  for (let i = 1; i < text.length - 1; i++) {
    if (text[i] === '\\' && text[i + 1] === '|') { cell += '|'; i++; }
    else if (text[i] === '|') { result.push(cell.trim()); cell = ''; }
    else cell += text[i];
  }
  result.push(cell.trim()); return result;
}

function tokenize(source) {
  const lines = source.replace(/^\uFEFF/u, '').split(/\r\n?|\n/u);
  const tokens = []; let fence = null; let html = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], text = raw.trim(), line = i + 1;
    if (fence) { if (new RegExp(`^ {0,3}${fence.char}{${fence.size},}\\s*$`, 'u').test(raw)) fence = null; continue; }
    if (html) { if (html === 'blank' ? text === '' : html.test(raw)) html = null; continue; }
    const fenced = raw.match(/^ {0,3}(`{3,}|~{3,})/u);
    if (fenced) { fence = { char: fenced[1][0], size: fenced[1].length }; continue; }
    if (/^ {0,3}<!--/u.test(raw)) { if (!raw.includes('-->')) html = /-->/u; continue; }
    const special = raw.match(/^ {0,3}<(script|pre|style|textarea)(?:\s|>)/iu);
    if (special) { const end = new RegExp(`</${special[1]}>`, 'iu'); if (!end.test(raw)) html = end; continue; }
    if (/^ {0,3}<\?/u.test(raw)) { if (!raw.includes('?>')) html = /\?>/u; continue; }
    if (/^ {0,3}<!\[CDATA\[/u.test(raw)) { if (!raw.includes(']]>')) html = /\]\]>/u; continue; }
    if (/^ {0,3}<![A-Z]/u.test(raw)) { if (!raw.includes('>')) html = />/u; continue; }
    const blockTag = /^ {0,3}<\/?(?:address|article|aside|base|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|\/?>)/iu;
    if (blockTag.test(raw) || /^ {0,3}<\/?[A-Za-z][\w-]*(?:\s[^>]*|\/?)>\s*$/u.test(raw)) { html = 'blank'; continue; }
    const heading = raw.match(/^ {0,3}(#{1,2})(?:[ \t]+(.*)|$)/u);
    if (heading) {
      const title = (heading[2] ?? '').replace(/(?:^|\s+)#+\s*$/u, '').trim();
      if (!title) fail('MDP-E007', line, 'Empty heading');
      tokens.push({ kind: 'heading', level: heading[1].length, title, line }); continue;
    }
    const field = text.match(/^-\s+([^]*?):(?: (.*)|\s*)$/u);
    const pipe = text.startsWith('|') && text.endsWith('|') && text.length > 1;
    if (!field && !pipe) continue;
    const leading = raw.match(/^\s*/u)[0];
    if (leading.includes('\t')) fail('MDP-E009', line, 'Tab indentation');
    const level = Math.floor(leading.length / 2);
    if (field) { tokens.push({ kind: 'field', key: field[1].trim(), text: (field[2] ?? '').trim(), level, line }); continue; }
    if (i + 1 >= lines.length || !lines[i + 1].trim().startsWith('|') || !lines[i + 1].trim().endsWith('|')) continue;
    const separator = cells(lines[i + 1].trim());
    if (!separator.every(c => /^:?-+:?$/u.test(c))) continue;
    if (lines[i + 1].match(/^\s*/u)[0].includes('\t')) fail('MDP-E009', line + 1, 'Tab indentation');
    const headers = cells(text);
    if (headers.some(h => !h) || new Set(headers).size !== headers.length) fail('MDP-E005', line, 'Invalid table header');
    if (separator.length !== headers.length) fail('MDP-E004', line + 1, 'Separator width');
    const rows = []; i++;
    while (i + 1 < lines.length && /^\s*\|.*\|\s*$/u.test(lines[i + 1])) {
      if (lines[i + 1].match(/^\s*/u)[0].includes('\t')) fail('MDP-E009', i + 2, 'Tab indentation');
      const row = cells(lines[++i].trim());
      if (row.length !== headers.length) fail('MDP-E004', i + 1, 'Row width');
      if (headers.length === 1) rows.push(scalar(row[0]));
      else { const value = {}; row.forEach((c, j) => { if (c !== '') put(value, headers[j], scalar(c)); }); rows.push(value); }
    }
    tokens.push({ kind: 'table', value: rows, level, line });
  }
  return tokens;
}

export function parse(source, options = {}) {
  const { maxLength = 16777216, maxDepth = 256 } = options;
  if (typeof source !== 'string') throw new TypeError('Markdown source must be a string');
  if (!Number.isSafeInteger(maxLength) || maxLength < 1 || !Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > 512) throw new RangeError('Invalid parser limits');
  if (source.length > maxLength) throw new RangeError('Markdown length limit');
  const tokens = tokenize(source); let cursor = 0;
  function block(level, root = false) {
    if (level > maxDepth) throw new RangeError('Markdown depth limit');
    let value = {}, mode = 'object', populated = false;
    while (cursor < tokens.length) {
      const token = tokens[cursor];
      if (token.kind === 'heading' || token.level < level) break;
      if (token.level > level && !(token.kind === 'table' && level === 0 && token.level <= 1))
        fail(token.kind === 'table' || token.key === '' ? 'MDP-E006' : 'MDP-E009', token.line, 'Unattached indentation');
      cursor++;
      if (token.kind === 'table') {
        if (root) fail('MDP-E006', token.line, 'Root table');
        if (populated) fail('MDP-E002', token.line, 'Mixed contents');
        value = token.value; mode = 'table'; populated = true; continue;
      }
      const element = token.key === '';
      if (element && root) fail('MDP-E006', token.line, 'Root element');
      if (mode === 'table' || (populated && element !== (mode === 'elements'))) fail('MDP-E002', token.line, 'Mixed contents');
      if (element && !populated) { value = []; mode = 'elements'; }
      if (!element && own(value, token.key)) fail('MDP-E003', token.line, 'Duplicate key');
      let child = scalar(token.text);
      const next = tokens[cursor];
      if (next && next.kind !== 'heading' && next.level > level) {
        if (next.level !== level + 1 || token.text !== '') fail(next.kind === 'table' ? 'MDP-E006' : 'MDP-E009', next.line, 'Child requires a container');
        child = block(level + 1);
      }
      if (element) value.push(child); else put(value, token.key, child);
      populated = true;
    }
    return value;
  }
  const result = block(0, true); let current = null;
  while (cursor < tokens.length) {
    const token = tokens[cursor++];
    if (token.level === 1) {
      if (own(result, token.title)) fail('MDP-E003', token.line, 'Duplicate section');
      current = block(0); put(result, token.title, current);
    } else {
      if (current === null) fail('MDP-E001', token.line, 'Orphan heading');
      if (Array.isArray(current)) fail('MDP-E002', token.line, 'Table with subsection');
      if (own(current, token.title)) fail('MDP-E003', token.line, 'Duplicate subsection');
      put(current, token.title, block(0));
    }
  }
  return result;
}

function atom(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    return value === '' || value.trim() !== value || /[\n\r\t]/u.test(value) || number.test(value) || ['true', 'false', 'null', '{}', '[]'].includes(value) || (value.startsWith('"') && value.endsWith('"'))
      ? '"' + value.replace(/["\\\n\r\t]/gu, c => ({ '"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t' }[c])) + '"' : value;
  }
  if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return String(value);
  if (Array.isArray(value) && value.length === 0) return '[]';
  if (object(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Object.keys(value).length === 0) return '{}';
  throw new TypeError('Expected a finite JSON scalar');
}
const leaf = value => value === null || typeof value !== 'object' || (Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0);
function keyText(key, heading = false) {
  if (!key || key.trim() !== key || /[\r\n\t]/u.test(key) || (heading ? /\s#+$/u.test(key) : /: /u.test(key))) throw new TypeError('Unrepresentable Markdown key');
  return key;
}

export function encode(value, options = {}) {
  const { maxDepth = 256, maxLength = 16777216 } = options;
  if (!object(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('Markdown document must be a plain object');
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > 512 || !Number.isSafeInteger(maxLength) || maxLength < 1) throw new RangeError('Invalid encoder limits');
  const active = new Set();
  function body(data, depth) {
    if (depth > maxDepth) throw new RangeError('Markdown depth limit');
    if (active.has(data)) throw new TypeError('Cyclic Markdown value');
    active.add(data); const pad = '  '.repeat(depth); let lines = [];
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) if (!own(data, i)) throw new TypeError('Sparse arrays are not JSON values');
      if (data.every(v => leaf(v))) lines = [`${pad}| value |`, `${pad}| --- |`, ...data.map(v => `${pad}| ${atom(v).replaceAll('|', '\\|')} |`)];
      else {
        const keys = [...new Set(data.flatMap(v => object(v) ? Object.keys(v) : []))];
        if (keys.length > 1 && data.every(v => object(v) && Object.values(v).every(leaf))) {
          const row = values => `${pad}| ${values.join(' | ')} |`;
          const cell = v => atom(v).replaceAll('|', '\\|');
          lines = [row(keys.map(k => keyText(k).replaceAll('|', '\\|'))), row(keys.map(() => '---')), ...data.map(v => row(keys.map(k => own(v, k) ? cell(v[k]) : '')))];
        } else for (const child of data) {
          if (leaf(child)) lines.push(`${pad}- : ${atom(child)}`);
          else lines.push(`${pad}- :`, ...body(child, depth + 1));
        }
      }
    } else if (object(data)) {
      if (Object.getPrototypeOf(data) !== Object.prototype && Object.getPrototypeOf(data) !== null) throw new TypeError('Expected plain JSON object');
      for (const [key, child] of Object.entries(data)) {
        if (leaf(child)) lines.push(`${pad}- ${keyText(key)}: ${atom(child)}`);
        else lines.push(`${pad}- ${keyText(key)}:`, ...body(child, depth + 1));
      }
    } else throw new TypeError('Expected JSON container');
    active.delete(data); return lines;
  }
  active.add(value); const preamble = [], sections = [];
  for (const [key, child] of Object.entries(value)) {
    if (leaf(child)) preamble.push(`- ${keyText(key)}: ${atom(child)}`);
    else sections.push(`# ${keyText(key, true)}\n\n${body(child, 0).join('\n')}`);
  }
  const output = [...(preamble.length ? [preamble.join('\n')] : []), ...sections].join('\n\n') + '\n';
  if (output.length > maxLength) throw new RangeError('Markdown length limit');
  return output;
}
