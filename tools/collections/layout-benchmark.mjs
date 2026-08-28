import {
  ArrayNode,
  BitmapIndexedNode,
  MapEntry,
  mapAssoc,
  mapDissoc,
  mapFind,
  mapHash,
} from "../../runtime/core/map-internals.mjs";

export const LAYOUT_HOST_REPORT_FORMAT = "eliscript-hamt-layout-host";
export const LAYOUT_HOST_REPORT_VERSION = 1;
export const DEFAULT_OCCUPANCIES = Object.freeze([
  4, 8, 12, 15, 16, 20, 24, 28, 32,
]);

const NOT_FOUND = -1;
const MIXED_WEIGHTS = Object.freeze({ lookup: 0.8, assoc: 0.1, dissoc: 0.1 });

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function validatePositiveInteger(name, value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function validateOccupancies(occupancies) {
  const values = [...occupancies];
  if (values.length === 0) {
    throw new TypeError("occupancies must not be empty");
  }
  let previous = 0;
  for (const occupancy of values) {
    if (!Number.isInteger(occupancy) || occupancy <= previous || occupancy > 32) {
      throw new TypeError(
        "occupancies must be strictly increasing integers between 1 and 32",
      );
    }
    previous = occupancy;
  }
  return Object.freeze(values);
}

function branchKeys(requiredPerBranch = 2) {
  const keys = Array.from({ length: 32 }, () => []);
  let remaining = 32 * requiredPerBranch;
  for (let candidate = 0; remaining > 0; candidate += 1) {
    const branch = mapHash(candidate) & 31;
    if (keys[branch].length < requiredPerBranch) {
      keys[branch].push(Object.freeze({ key: candidate, hash: mapHash(candidate) }));
      remaining -= 1;
    }
  }
  return Object.freeze(keys.map((values) => Object.freeze(values)));
}

function scenarioFor(occupancy, keys) {
  const entries = [];
  let bitmap = 0;
  const children = Array(32).fill(undefined);
  const probes = [];

  for (let branch = 0; branch < occupancy; branch += 1) {
    const { key, hash } = keys[branch][0];
    const entry = new MapEntry(key, branch + 1, hash);
    entries.push(entry);
    children[branch] = entry;
    bitmap = (bitmap | (1 << branch)) >>> 0;
    probes.push(Object.freeze({ key, hash, expected: branch + 1 }));
  }

  const missingBranch = occupancy < 32 ? occupancy : 0;
  const missing = keys[missingBranch][occupancy < 32 ? 0 : 1];
  probes.push(Object.freeze({
    key: missing.key,
    hash: missing.hash,
    expected: NOT_FOUND,
  }));

  return Object.freeze({
    occupancy,
    bitmapRoot: new BitmapIndexedNode(bitmap, entries),
    arrayRoot: new ArrayNode(occupancy, children),
    probes: Object.freeze(probes),
  });
}

function validateRoot(root, probes) {
  for (const probe of probes) {
    const actual = mapFind(root, probe.hash, probe.key, NOT_FOUND);
    if (actual !== probe.expected) {
      throw new Error(
        `layout benchmark lookup mismatch: expected ${probe.expected}, received ${actual}`,
      );
    }
  }
}

function lookupChecksum(root, probes, iterations) {
  let checksum = 0;
  for (let index = 0; index < iterations; index += 1) {
    const probe = probes[index % probes.length];
    const value = mapFind(root, probe.hash, probe.key, NOT_FOUND);
    checksum = Math.imul((checksum ^ value) >>> 0, 0x45d9_f3b) >>> 0;
  }
  return checksum;
}

function measureLookups(root, probes, iterations, samples, now) {
  const warmupIterations = Math.max(1_000, Math.floor(iterations / 5));
  lookupChecksum(root, probes, warmupIterations);

  const timings = [];
  let checksum;
  for (let sample = 0; sample < samples; sample += 1) {
    const started = now();
    const current = lookupChecksum(root, probes, iterations);
    timings.push(now() - started);
    if (checksum === undefined) {
      checksum = current;
    } else if (checksum !== current) {
      throw new Error("layout benchmark checksum changed between samples");
    }
  }
  return Object.freeze({
    samplesMs: Object.freeze(timings),
    medianMs: median(timings),
    checksum,
  });
}

function mutationChecksum(root, probes, iterations, operation) {
  let checksum = 0;
  for (let index = 0; index < iterations; index += 1) {
    const probe = probes[index % (probes.length - 1)];
    const result = operation === "assoc"
      ? mapAssoc(root, probe.hash, probe.key, -(index + 2))
      : mapDissoc(root, probe.hash, probe.key);
    const signal = operation === "assoc"
      ? Number(result.changed) + (Number(result.added) << 1)
      : Number(result.removed);
    const occupancy = result.item instanceof ArrayNode
      ? result.item.count
      : result.item.items.length;
    checksum = Math.imul(
      (checksum ^ signal ^ occupancy) >>> 0,
      0x45d9_f3b,
    ) >>> 0;
  }
  return checksum;
}

function measureMutations(root, probes, iterations, samples, now, operation) {
  const warmupIterations = Math.max(500, Math.floor(iterations / 10));
  mutationChecksum(root, probes, warmupIterations, operation);

  const timings = [];
  let checksum;
  for (let sample = 0; sample < samples; sample += 1) {
    const started = now();
    const current = mutationChecksum(root, probes, iterations, operation);
    timings.push(now() - started);
    if (checksum === undefined) {
      checksum = current;
    } else if (checksum !== current) {
      throw new Error(`${operation} benchmark checksum changed between samples`);
    }
  }
  return Object.freeze({
    samplesMs: Object.freeze(timings),
    medianMs: median(timings),
    checksum,
  });
}

async function settleHeap(collectGarbage) {
  if (collectGarbage === undefined) {
    return;
  }
  await collectGarbage();
  await collectGarbage();
  await Promise.resolve();
}

async function measureNodeBytes({
  factory,
  nodeCount,
  samples,
  collectGarbage,
  heapUsed,
}) {
  if (collectGarbage === undefined || heapUsed === undefined) {
    return Object.freeze({ samples: Object.freeze([]), median: null });
  }

  const bytes = [];
  for (let sample = 0; sample < samples; sample += 1) {
    await settleHeap(collectGarbage);
    const before = heapUsed();
    let nodes = Array.from({ length: nodeCount }, factory);
    await settleHeap(collectGarbage);
    const after = heapUsed();
    const retained = nodes[0] === nodes[nodes.length - 1] ? 0 : nodes.length;
    if (retained !== nodeCount) {
      throw new Error("layout benchmark failed to retain distinct nodes");
    }
    bytes.push(Math.max(0, after - before) / nodeCount);
    nodes = null;
    await settleHeap(collectGarbage);
  }

  return Object.freeze({
    samples: Object.freeze(bytes),
    median: median(bytes),
  });
}

function finiteRatio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function mixedOperationCost(
  lookup,
  assoc,
  dissoc,
  lookupIterations,
  mutationIterations,
) {
  return MIXED_WEIGHTS.lookup * (lookup.medianMs / lookupIterations) +
    MIXED_WEIGHTS.assoc * (assoc.medianMs / mutationIterations) +
    MIXED_WEIGHTS.dissoc * (dissoc.medianMs / mutationIterations);
}

export async function runLayoutHostBenchmark({
  host,
  occupancies = DEFAULT_OCCUPANCIES,
  lookupIterations = 250_000,
  mutationIterations = 50_000,
  timingSamples = 7,
  memoryNodeCount = 20_000,
  memorySamples = 3,
  now = () => performance.now(),
  collectGarbage,
  heapUsed,
} = {}) {
  if (host === null || typeof host !== "object") {
    throw new TypeError("layout benchmark host metadata is required");
  }
  const occupancyValues = validateOccupancies(occupancies);
  validatePositiveInteger("lookupIterations", lookupIterations);
  validatePositiveInteger("mutationIterations", mutationIterations);
  validatePositiveInteger("timingSamples", timingSamples);
  validatePositiveInteger("memoryNodeCount", memoryNodeCount);
  validatePositiveInteger("memorySamples", memorySamples);

  const keys = branchKeys();
  const measurements = [];
  for (const occupancy of occupancyValues) {
    const scenario = scenarioFor(occupancy, keys);
    validateRoot(scenario.bitmapRoot, scenario.probes);
    validateRoot(scenario.arrayRoot, scenario.probes);

    const bitmapLookup = measureLookups(
      scenario.bitmapRoot,
      scenario.probes,
      lookupIterations,
      timingSamples,
      now,
    );
    const arrayLookup = measureLookups(
      scenario.arrayRoot,
      scenario.probes,
      lookupIterations,
      timingSamples,
      now,
    );
    if (bitmapLookup.checksum !== arrayLookup.checksum) {
      throw new Error("bitmap and array layout checksums differ");
    }
    const bitmapAssoc = measureMutations(
      scenario.bitmapRoot,
      scenario.probes,
      mutationIterations,
      timingSamples,
      now,
      "assoc",
    );
    const arrayAssoc = measureMutations(
      scenario.arrayRoot,
      scenario.probes,
      mutationIterations,
      timingSamples,
      now,
      "assoc",
    );
    const bitmapDissoc = measureMutations(
      scenario.bitmapRoot,
      scenario.probes,
      mutationIterations,
      timingSamples,
      now,
      "dissoc",
    );
    const arrayDissoc = measureMutations(
      scenario.arrayRoot,
      scenario.probes,
      mutationIterations,
      timingSamples,
      now,
      "dissoc",
    );
    if (bitmapAssoc.checksum !== arrayAssoc.checksum ||
        bitmapDissoc.checksum !== arrayDissoc.checksum) {
      throw new Error("bitmap and array mutation checksums differ");
    }

    const bitmapMemory = await measureNodeBytes({
      factory: () => new BitmapIndexedNode(
        scenario.bitmapRoot.bitmap,
        scenario.bitmapRoot.items.slice(),
      ),
      nodeCount: memoryNodeCount,
      samples: memorySamples,
      collectGarbage,
      heapUsed,
    });
    const arrayMemory = await measureNodeBytes({
      factory: () => new ArrayNode(
        scenario.arrayRoot.count,
        scenario.arrayRoot.children.slice(),
      ),
      nodeCount: memoryNodeCount,
      samples: memorySamples,
      collectGarbage,
      heapUsed,
    });
    const bitmapMixed = mixedOperationCost(
      bitmapLookup,
      bitmapAssoc,
      bitmapDissoc,
      lookupIterations,
      mutationIterations,
    );
    const arrayMixed = mixedOperationCost(
      arrayLookup,
      arrayAssoc,
      arrayDissoc,
      lookupIterations,
      mutationIterations,
    );

    measurements.push(Object.freeze({
      occupancy,
      probes: scenario.probes.length,
      checksum: bitmapLookup.checksum,
      bitmap: Object.freeze({
        lookup: bitmapLookup,
        assoc: bitmapAssoc,
        dissoc: bitmapDissoc,
        bytesPerNode: bitmapMemory,
      }),
      array: Object.freeze({
        lookup: arrayLookup,
        assoc: arrayAssoc,
        dissoc: arrayDissoc,
        bytesPerNode: arrayMemory,
      }),
      ratios: Object.freeze({
        arrayToBitmapLookup: finiteRatio(
          arrayLookup.medianMs,
          bitmapLookup.medianMs,
        ),
        arrayToBitmapAssoc: finiteRatio(
          arrayAssoc.medianMs,
          bitmapAssoc.medianMs,
        ),
        arrayToBitmapDissoc: finiteRatio(
          arrayDissoc.medianMs,
          bitmapDissoc.medianMs,
        ),
        arrayToBitmapMixed: finiteRatio(arrayMixed, bitmapMixed),
        arrayToBitmapBytes: bitmapMemory.median === null || arrayMemory.median === null
          ? null
          : finiteRatio(arrayMemory.median, bitmapMemory.median),
      }),
    }));
  }

  return Object.freeze({
    format: LAYOUT_HOST_REPORT_FORMAT,
    version: LAYOUT_HOST_REPORT_VERSION,
    host: Object.freeze({ ...host }),
    parameters: Object.freeze({
      occupancies: occupancyValues,
      lookupIterations,
      mutationIterations,
      timingSamples,
      memoryNodeCount,
      memorySamples,
      mixedWeights: MIXED_WEIGHTS,
    }),
    validation: Object.freeze({
      passed: true,
      representations: Object.freeze(["bitmap-indexed", "array-32"]),
      lookupPath: "runtime/core/map-internals.mjs#mapFind",
    }),
    measurements: Object.freeze(measurements),
  });
}

export function validateLayoutHostReport(report) {
  const errors = [];
  if (report?.format !== LAYOUT_HOST_REPORT_FORMAT) {
    errors.push(`invalid format ${JSON.stringify(report?.format)}`);
  }
  if (report?.version !== LAYOUT_HOST_REPORT_VERSION) {
    errors.push(`invalid version ${JSON.stringify(report?.version)}`);
  }
  if (report?.validation?.passed !== true) {
    errors.push("lookup validation did not pass");
  }
  if (!Array.isArray(report?.measurements) || report.measurements.length === 0) {
    errors.push("measurements must not be empty");
  }
  if (report?.measurements?.length !== report?.parameters?.occupancies?.length) {
    errors.push("measurement and occupancy counts differ");
  }
  for (let index = 0; index < (report?.measurements?.length ?? 0); index += 1) {
    const measurement = report.measurements[index];
    if (!Number.isInteger(measurement.occupancy) || measurement.occupancy < 1 ||
        measurement.occupancy > 32) {
      errors.push(`invalid occupancy ${JSON.stringify(measurement.occupancy)}`);
    }
    if (measurement.occupancy !== report.parameters.occupancies[index]) {
      errors.push(`measurement ${index} does not match its declared occupancy`);
    }
    for (const representation of ["bitmap", "array"]) {
      for (const operation of ["lookup", "assoc", "dissoc"]) {
        const measurementOperation = measurement?.[representation]?.[operation];
        if (!Number.isFinite(measurementOperation?.medianMs) ||
            measurementOperation.medianMs < 0) {
          errors.push(`${representation} ${operation} median is invalid`);
        }
        if (!Array.isArray(measurementOperation?.samplesMs) ||
            measurementOperation.samplesMs.length !== report.parameters.timingSamples) {
          errors.push(`${representation} ${operation} samples are missing`);
        }
      }
      const memory = measurement?.[representation]?.bytesPerNode;
      if (memory?.median === null) {
        if (!Array.isArray(memory.samples) || memory.samples.length !== 0) {
          errors.push(`${representation} unsupported memory samples must be empty`);
        }
      } else if (!Number.isFinite(memory?.median) || memory.median <= 0 ||
                 memory.samples?.length !== report.parameters.memorySamples) {
        errors.push(`${representation} memory samples are invalid`);
      }
    }
    if (measurement?.bitmap?.lookup?.checksum !==
        measurement?.array?.lookup?.checksum) {
      errors.push(`occupancy ${measurement.occupancy} checksum differs`);
    }
    for (const operation of ["assoc", "dissoc"]) {
      if (measurement?.bitmap?.[operation]?.checksum !==
          measurement?.array?.[operation]?.checksum) {
        errors.push(`occupancy ${measurement.occupancy} ${operation} checksum differs`);
      }
    }
    for (const [name, ratio] of Object.entries(measurement.ratios ?? {})) {
      if (ratio !== null && (!Number.isFinite(ratio) || ratio <= 0)) {
        errors.push(`occupancy ${measurement.occupancy} ${name} ratio is invalid`);
      }
    }
  }
  if (errors.length > 0) {
    throw new TypeError(`invalid HAMT layout host report: ${errors.join("; ")}`);
  }
  return report;
}
