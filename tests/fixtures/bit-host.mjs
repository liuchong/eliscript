import { pathToFileURL } from "node:url";

const usage = await import(pathToFileURL(process.argv[2]).href);
const bit = await import(pathToFileURL(process.argv[3]).href);
const intrinsic = usage.__eliscript_portable__["intrinsic-results"];
const evaluate = usage.__eliscript_portable__["bit-evaluation"];
const library = bit.__eliscript_portable__;
const sample = 0x1234_5678;
const order = [];
const evaluationResult = evaluate(
  () => {
    order.push("left");
    return 1;
  },
  () => {
    order.push("right");
    return 2;
  },
);

console.log(JSON.stringify({
  intrinsics: intrinsic(),
  evaluation: { result: evaluationResult, order },
  library: {
    zero: library["bit-count"](0),
    all: library["bit-count"](-1),
    alternating: library["bit-count"](0x5555_5555),
    high: library["bit-count"](0x8000_0000),
    rotateLeft: library["rotate-left"](sample, 8),
    rotateRight: library["rotate-right"](sample, 8),
    rotateIdentity: library["rotate-left"](sample, 32),
    rotateMasked: library["rotate-left"](sample, -24),
  },
}));
