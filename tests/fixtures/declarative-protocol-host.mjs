import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const declarations = await import(pathToFileURL(modulePath).href);
const box = new declarations.Box(7);

console.log(JSON.stringify({
  identity: {
    protocol: declarations.describe.protocol === declarations.IDescribe,
    operation: declarations.describe.operation,
    slot: typeof declarations.describe.slot,
    operations: Object.keys(declarations.IDescribe.operations),
  },
  type: {
    description: declarations.describe(box),
    measurement: declarations.measure(box, 3),
  },
  category: {
    description: declarations.describe(5),
    measurement: declarations.measure(5, 4),
  },
  fallback: {
    description: declarations.describe("text"),
    measurement: declarations.measure("text", 8),
  },
}));
