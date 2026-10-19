const formats = new Set(['eliscript-wasm-source-map', 'eliscript-native-source-map']);
const ownedDocuments = new WeakSet();

// The artifact loader alone hands over a newly decoded, authenticated graph.
// Ordinary caller documents retain the public mapping API's snapshot contract.
export function ownCompilerDebugDocument(document) {
  if (document !== null && typeof document === 'object') ownedDocuments.add(document);
  return document;
}

function offset(value, label) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value)) return BigInt(value);
  throw new TypeError(label + ' must be an exact byte offset');
}

function range(value) {
  return value && Number.isSafeInteger(value.start) && value.start >= 0 &&
    Number.isSafeInteger(value.end) && value.end >= value.start;
}

function intervalIndex(entries) {
  // Keep indices into the complete records instead of one wrapper object per
  // instruction range. Source records and their original order remain intact.
  const sorted = [];
  for (let index = 0; index < entries.length; index++) if (range(entries[index])) sorted.push(index);
  sorted.sort((a, b) => entries[a].start - entries[b].start || a - b);
  const maximumEnds = new Float64Array(sorted.length);
  let end = 0;
  for (let index = 0; index < sorted.length; index++) {
    end = Math.max(end, entries[sorted[index]].end);maximumEnds[index] = end;
  }
  return byte => {
    let low = 0, high = sorted.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (entries[sorted[middle]].start <= byte) low = middle + 1;
      else high = middle;
    }
    const matches = [];
    for (let i = low - 1; i >= 0 && maximumEnds[i] > byte; i--) {
      const index = sorted[i];
      if (entries[index].end > byte) matches.push(index);
    }
    matches.sort((a, b) => (entries[b].depth ?? 0) - (entries[a].depth ?? 0) ||
      (entries[a].end - entries[a].start) - (entries[b].end - entries[b].start) || a - b);
    return matches.map(index => entries[index]);
  };
}

// Addresses are supplied by the execution adapter. No engine-specific stack
// spelling, guessed instruction address or nearest preceding source is used.
export function createCompilerDebugMap(document) {
  if (!document || !formats.has(document.format) || document.version !== 1 ||
      document.offsetUnit !== 'byte' || !Array.isArray(document.functions) || !Array.isArray(document.ranges)) {
    throw new TypeError('unsupported compiler instruction map');
  }
  const debug = ownedDocuments.has(document) ? document : structuredClone(document);
  const wasm = debug.format === 'eliscript-wasm-source-map';
  if (debug.offsetBase !== (wasm ? 'module' : 'code-section')) throw new TypeError('incorrect compiler map offset base');
  const code = debug.codeSection;
  if (!code || wasm && (!Number.isSafeInteger(code.payloadStart) || !Number.isSafeInteger(code.end)) ||
      !wasm && (!Number.isSafeInteger(code.fileOffset) || !Number.isSafeInteger(code.virtualAddress) || !Number.isSafeInteger(code.size))) {
    throw new TypeError('compiler map has no exact code section');
  }
  const functions = debug.functions.map(fn => wasm ? {...fn, start: fn.instructions?.start, end: fn.instructions?.end} : fn);
  if (functions.some(fn => !range(fn)) || debug.ranges.some(item => !range(item))) throw new TypeError('invalid compiler instruction range');
  const findFunction = intervalIndex(functions), findRanges = intervalIndex(debug.ranges);
  const sources = new Map();
  for (const source of debug.sources ?? []) {
    if (typeof source.filename !== 'string' || sources.has(source.filename) || !Array.isArray(source.macroOrigins)) {
      throw new TypeError('invalid compiler macro source map');
    }
    sources.set(source.filename, source);
  }
  const byIndex = new Map();
  for (const fn of functions) {
    if (!Number.isSafeInteger(fn.index) || byIndex.has(fn.index)) throw new TypeError('invalid compiler function index');
    byIndex.set(fn.index, fn);
  }

  function normalize(address, {offsetBase = debug.offsetBase, loadAddress = 0, functionIndex, returnAddress = false} = {}) {
    let byte = offset(address, 'instruction address');
    if (wasm) {
      if (offsetBase === 'code-payload') byte += BigInt(code.payloadStart);
      else if (offsetBase === 'function-body' || offsetBase === 'function-instructions') {
        const fn = byIndex.get(functionIndex);
        if (!fn) return null;
        byte += BigInt(offsetBase === 'function-body' ? fn.body.start : fn.instructions.start);
      } else if (offsetBase !== 'module') throw new TypeError('unsupported WASM instruction offset base');
      if (returnAddress) byte--;
      if (byte < BigInt(code.payloadStart) || byte >= BigInt(code.end)) return null;
    } else {
      if (offsetBase === 'file') byte -= BigInt(code.fileOffset);
      else if (offsetBase === 'virtual-address') byte -= BigInt(code.virtualAddress);
      else if (offsetBase === 'loaded-address') byte -= offset(loadAddress, 'image load slide') + BigInt(code.virtualAddress);
      else if (offsetBase !== 'code-section') throw new TypeError('unsupported native instruction offset base');
      // ARM64 link registers point at the instruction after the call.
      if (returnAddress) byte -= 4n;
      if (byte < 0n || byte >= BigInt(code.size)) return null;
    }
    return Number(byte);
  }

  return Object.freeze({
    target: debug.target,
    offsetBase: debug.offsetBase,
    lookup(address, options) {
      const byte = normalize(address, options);
      if (byte === null) return null;
      const fn = findFunction(byte)[0] ?? null;
      if (options?.functionIndex !== undefined && fn?.index !== options.functionIndex) return null;
      const matches = findRanges(byte).filter(item => fn === null || item.functionIndex === fn.index);
      const mapped = matches.find(item => item.span != null);
      const span = mapped?.span ?? fn?.span ?? null;
      const source = span === null ? undefined : sources.get(span.filename);
      const macroOrigins = source?.macroOrigins.filter(event => event.callSpan?.start === span.start &&
        event.callSpan?.end === span.end && event.callSpan?.filename === span.filename) ?? [];
      return {
        target: debug.target, offset: byte, offsetBase: debug.offsetBase,
        function: fn?.name ?? null, functionIndex: fn?.index ?? null,
        span,
        source: source?.id ?? null,
        macroOrigins,
        generated: mapped === undefined && fn?.span == null,
        ranges: matches,
      };
    },
    mapFrames(frames, options = {}) {
      if (!Array.isArray(frames)) throw new TypeError('compiler stack frames must be an array');
      return frames.map(frame => {
        if (!frame || frame.address === undefined) return {frame, source: null};
        return {frame, source: this.lookup(frame.address, {...options, ...frame})};
      });
    },
  });
}

export function locateCompilerInstruction(document, address, options) {
  return createCompilerDebugMap(document).lookup(address, options);
}
