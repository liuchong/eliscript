// Experimental, deliberately partial backend. This is not a public compiler.
// Only pure scalar f64 expressions and statement control flow are accepted.
export function emitNumericC(program) {
  let serial = 0;
  const fail = (node, message) => {
    const span = node.span ?? {};
    throw new Error(`${span.filename ?? program.filename}:${span.line ?? 1}: ${message}`);
  };
  const fresh = () => `v${serial++}`;
  const expression = (node, scope) => {
    const { kind, value, children } = node;
    if (kind === "literal" && !node.properties) {
      if (typeof value === "number" && Number.isFinite(value)) {
        const text = String(value);
        const literal = /[.e]/i.test(text) ? text : `${text}.0`;
        return { type: "double", code: Object.is(value, -0) ? "(-0.0)" : `(${literal})` };
      }
      if (typeof value === "boolean") return { type: "int", code: value ? "1" : "0" };
    }
    if (kind === "reference" && scope.has(value)) return scope.get(value);
    if (kind === "short-circuit" && ["and", "or"].includes(value) && children.length >= 2) {
      const args = children.map((child) => expression(child, scope));
      if (args.some((arg) => arg.type !== "int")) fail(node, "and/or requires booleans in this probe");
      return { type: "int", code: `(${args.map((arg) => arg.code).join(value === "and" ? " && " : " || ")})` };
    }
    if (kind === "intrinsic") {
      const args = children.map((child) => expression(child, scope));
      if (args.some((arg) => arg.type !== "double")) fail(node, "numeric operands required");
      if (["1+", "1-"].includes(value) && args.length === 1) {
        return { type: "double", code: `(${args[0].code} ${value === "1+" ? "+" : "-"} 1.0)` };
      }
      if (["+", "-", "*", "/"].includes(value) && args.length === 2) {
        return { type: "double", code: `(${args[0].code} ${value} ${args[1].code})` };
      }
      if (["<", "<=", ">", ">=", "="].includes(value) && args.length === 2) {
        return { type: "int", code: `(${args[0].code} ${value === "=" ? "==" : value} ${args[1].code})` };
      }
    }
    if (kind === "conditional" && children.length === 3) {
      const [condition, yes, no] = children.map((child) => expression(child, scope));
      if (condition.type !== "int" || yes.type !== no.type) fail(node, "typed conditional required");
      return { type: yes.type, code: `(${condition.code} ? ${yes.code} : ${no.code})` };
    }
    fail(node, `unsupported expression ${kind}:${value}; no silent fallback`);
  };
  const block = (nodes, scope, returning = false) => {
    if (nodes.length === 0) throw new Error("empty numeric body");
    return nodes.map((node, index) => statement(node, scope, returning && index === nodes.length - 1)).join("\n");
  };
  const statement = (node, scope, returning) => {
    if (node.kind === "lexical-bindings") {
      const inner = new Map(scope);
      const bindings = node.children.slice(0, node.properties.bindingCount);
      const lines = [];
      const seen = new Set();
      for (const binding of bindings) {
        if (binding.kind !== "lexical-binding" || binding.children.length !== 1 || seen.has(binding.value)) {
          fail(binding, "simple, initialized, distinct bindings required");
        }
        seen.add(binding.value);
        const init = expression(binding.children[0], node.properties.sequential ? inner : scope);
        const code = fresh();
        lines.push(`${init.type} ${code} = ${init.code};`);
        inner.set(binding.value, { type: init.type, code });
      }
      lines.push(block(node.children.slice(bindings.length), inner, returning));
      return `{\n${lines.join("\n")}\n}`;
    }
    if (node.kind === "loop" && node.value === "while" && !returning) {
      const condition = expression(node.children[0], scope);
      if (condition.type !== "int") fail(node, "while requires a boolean; numeric truthiness is not C truthiness");
      return `while (${condition.code}) {\n${block(node.children.slice(1), scope)}\n}`;
    }
    if (node.kind === "assignment" && !returning) {
      return node.children.map((pair) => {
        const target = scope.get(pair.value);
        if (pair.kind !== "assignment-pair" || !target) fail(pair, "assignment requires a local binding");
        const rhs = expression(pair.children[0], scope);
        if (rhs.type !== target.type) fail(pair, "assignment changes scalar type");
        return `${target.code} = ${rhs.code};`;
      }).join("\n");
    }
    if (node.kind === "sequence") return block(node.children, scope, returning);
    const result = expression(node, scope);
    if (returning && result.type !== "double") fail(node, "numeric function result required");
    return returning ? `return ${result.code};` : `(void)${result.code};`;
  };
  const functions = [];
  const exported = new Set();
  for (const node of program.body) {
    if (node.kind === "export-declaration") {
      node.children.forEach((child) => exported.add(child.value));
      continue;
    }
    if (node.kind !== "function-declaration" || node.properties.async) fail(node, "only synchronous numeric functions and exports are supported");
    if (functions.some((fn) => fn.name === node.value)) fail(node, "duplicate function");
    const scope = new Map();
    const parameters = node.children.slice(0, node.properties.parameterCount);
    for (const parameter of parameters) {
      if (parameter.kind !== "parameter-binding" || parameter.properties.parameterKind !== "required" || scope.has(parameter.value)) {
        fail(parameter, "distinct required numeric parameters only");
      }
      scope.set(parameter.value, { type: "double", code: fresh() });
    }
    const symbol = `eli_${functions.length}`;
    const args = [...scope.values()].map((arg) => `double ${arg.code}`).join(", ") || "void";
    const body = block(node.children.slice(parameters.length), scope, true);
    functions.push({ name: node.value, symbol, arity: parameters.length, code: `double ${symbol}(${args}) {\n${body}\n}` });
  }
  if (functions.length === 0) throw new Error("no numeric functions");
  for (const name of exported) if (!functions.some((fn) => fn.name === name)) throw new Error(`unknown export ${name}`);
  return {
    code: "/* Generated from Eliscript IR; f64 subset, no fast-math/FMA. */\n" + functions.map((fn) => fn.code).join("\n\n") + "\n",
    functions: functions.map(({ code, ...fn }) => fn),
  };
}
