import { compileFile, loadCompiler } from "./bun.mjs";
import { buildProject } from "./project.mjs";

export async function executeBuild(options) {
  const compiler = options.compiler ?? await loadCompiler(options.moduleDirectory);
  const request = compiler.build_operation_request(options);
  if (request.mode === "single") {
    return compileFile({ ...request, compiler });
  }

  const projectOptions = {
    entry: request.entry,
    entries: request.entries,
    outDir: request.outDir,
    root: request.root,
    portableEntries: request.portableEntries,
    useCache: request.useCache,
    moduleDirectory: options.moduleDirectory,
  };
  if (options.compiler !== undefined) {
    projectOptions.compiler = compiler;
    projectOptions.compilerDigest = options.compilerDigest;
  }
  return buildProject(projectOptions);
}
