import { parse } from './markdown.mjs';

const own = (value, key) => Object.hasOwn(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const types = new Set(['any', 'string', 'int', 'float', 'number', 'bool', 'null', 'date', 'datetime']);
const reserved = new Set(['Preamble', 'Sections']);
function at(document, path) {
  let value = document;
  for (const part of path.split('.')) {
    if (!object(value) || !own(value, part)) return undefined;
    value = value[part];
  }
  return value;
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function typed(value, type) {
  switch (type) {
    case 'any': return true;
    case 'string': return typeof value === 'string';
    case 'int': return Number.isFinite(value) && Number.isInteger(value);
    case 'float': case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'bool': return typeof value === 'boolean';
    case 'null': return value === null;
    case 'date': return date(value);
    case 'datetime': return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/u.test(value) && date(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
  }
}

export function validate(data, schema) {
  if (typeof data === 'string') data = parse(data);
  if (typeof schema === 'string') schema = parse(schema);
  if (!object(data) || !object(schema) || schema.mds !== '0.1') throw new TypeError('Expected object data and an MDS/0.1 schema');
  for (const [name, value] of Object.entries(schema)) {
    if (!reserved.has(name) && object(value)) throw new TypeError('Schema field definition must be a table');
  }
  const definitions = Object.keys(schema).filter(k => !reserved.has(k) && Array.isArray(schema[k]));
  const fields = new Map();
  for (const name of [...definitions, ...(own(schema, 'Preamble') ? ['Preamble'] : [])]) {
    const rows = schema[name];
    if (!Array.isArray(rows)) throw new TypeError('Schema field definition must be a table');
    const seen = new Set();
    fields.set(name, rows.map(row => {
      if (!object(row) || typeof row.name !== 'string' || !row.name || !types.has(row.type) || seen.has(row.name)) throw new TypeError('Invalid schema field declaration');
      seen.add(row.name);
      if (own(row, 'required') && typeof row.required !== 'boolean') throw new TypeError('required must be boolean');
      for (const key of ['min', 'max', 'min_len', 'max_len']) if (own(row, key) && (typeof row[key] !== 'number' || !Number.isFinite(row[key]) || (key.endsWith('_len') && (!Number.isInteger(row[key]) || row[key] < 0)))) throw new TypeError(`Invalid ${key} constraint`);
      if ((row.min !== undefined && row.max !== undefined && row.min > row.max) || (row.min_len !== undefined && row.max_len !== undefined && row.min_len > row.max_len)) throw new TypeError('Inverted field bounds');
      if (own(row, 'enum') && typeof row.enum !== 'string') throw new TypeError('enum must be text');
      let pattern;
      if (own(row, 'pattern')) {
        if (typeof row.pattern !== 'string') throw new TypeError('pattern must be text');
        pattern = new RegExp(row.pattern, 'u');
      }
      return { ...row, pattern };
    }));
  }
  let declarations;
  if (own(schema, 'Sections')) {
    if (!Array.isArray(schema.Sections)) throw new TypeError('Sections must be a table');
    declarations = schema.Sections;
  } else declarations = definitions.map(name => ({ name, required: true }));
  const declared = new Map();
  for (const row of declarations) {
    if (!object(row) || typeof row.name !== 'string' || !row.name || row.name.split('.').some(p => !p) || declared.has(row.name) || !['object', 'list', 'any'].includes(row.kind ?? 'any')) throw new TypeError('Invalid section declaration');
    for (const key of ['required', 'additional']) if (own(row, key) && typeof row[key] !== 'boolean') throw new TypeError(`${key} must be boolean`);
    for (const key of ['min_rows', 'max_rows']) if (own(row, key) && (!Number.isSafeInteger(row[key]) || row[key] < 0)) throw new TypeError(`Invalid ${key} constraint`);
    if (row.min_rows !== undefined && row.max_rows !== undefined && row.min_rows > row.max_rows) throw new TypeError('Inverted row bounds');
    declared.set(row.name, row);
  }
  const errors = [];
  const error = (path, rule, expected, actual) => errors.push({ path, rule, expected, actual });
  function checkRow(value, rows, path, additional = true) {
    if (!object(value)) { error(path, 'kind', 'object', value); return; }
    for (const row of rows) {
      const fieldPath = `${path}.${row.name}`;
      if (!own(value, row.name)) { if (row.required) error(fieldPath, 'required', true, 'missing'); continue; }
      const actual = value[row.name];
      if (!typed(actual, row.type)) { error(fieldPath, 'type', row.type, actual); continue; }
      if (row.enum !== undefined && !row.enum.split(',').map(v => v.trim()).includes(String(actual))) error(fieldPath, 'enum', row.enum, actual);
      for (const key of ['min', 'max']) if (typeof actual === 'number' && row[key] !== undefined && (key === 'min' ? actual < row[key] : actual > row[key])) error(fieldPath, key, row[key], actual);
      if (typeof actual === 'string') {
        const length = [...actual].length;
        for (const key of ['min_len', 'max_len']) if (row[key] !== undefined && (key === 'min_len' ? length < row[key] : length > row[key])) error(fieldPath, key, row[key], length);
        if (row.pattern && !row.pattern.test(actual)) error(fieldPath, 'pattern', row.pattern.source, actual);
      }
    }
    if (!additional) {
      const allowed = new Set(rows.map(r => r.name));
      for (const key of Object.keys(value)) if (!allowed.has(key) && (value[key] === null || typeof value[key] !== 'object')) error(`${path}.${key}`, 'additional', false, value[key]);
    }
  }
  if (fields.has('Preamble')) checkRow(data, fields.get('Preamble'), 'preamble');
  for (const name of new Set([...definitions, ...declared.keys()])) {
    const policy = declared.get(name) ?? {};
    const value = at(data, name);
    if (value === undefined) { if (policy.required) error(name, 'required', true, 'missing'); continue; }
    const kind = Array.isArray(value) ? 'list' : object(value) ? 'object' : 'scalar';
    if (policy.kind && policy.kind !== 'any' && policy.kind !== kind) { error(name, 'kind', policy.kind, kind); continue; }
    if (Array.isArray(value)) {
      for (const key of ['min_rows', 'max_rows']) if (policy[key] !== undefined && (key === 'min_rows' ? value.length < policy[key] : value.length > policy[key])) error(name, key, policy[key], value.length);
      if (fields.has(name)) value.forEach((row, i) => checkRow(row, fields.get(name), `${name}[${i}]`, policy.additional));
    } else if (fields.has(name)) checkRow(value, fields.get(name), name, policy.additional);
  }
  return { valid: errors.length === 0, errors };
}
