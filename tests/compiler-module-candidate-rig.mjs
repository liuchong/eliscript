import {readFile,mkdir,symlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Build approved sources with explicit isolated candidate overrides. Every
// candidate still goes through the ordinary compiler and backend build path.
export async function buildCompilerCandidate(directory,sourceRoot,overrides={}) {
 const {buildBackends}=await import(pathToFileURL(resolve(sourceRoot,'tools/backends/build.mjs')).href);
 const baseline=await buildBackends({outputRoot:resolve(directory,'baseline')});
 const entries=await Promise.all(Object.entries(overrides).map(async([name,path])=>[resolve(sourceRoot,name),await readFile(path,'utf8')]));
 if((await Promise.all(entries.map(async([path,source])=>(await readFile(path,'utf8'))===source))).every(Boolean))return baseline;
 await mkdir(resolve(directory,'candidate'),{recursive:true});
 await symlink(resolve(directory,'baseline/bootstrap'),resolve(directory,'candidate/bootstrap'),'dir');
 const replacements=new Map(entries),frontend={...baseline.compiler,compile_string_with_source_map(source,path,...args){return baseline.compiler.compile_string_with_source_map(replacements.get(resolve(path))??source,path,...args);}};
 return buildBackends({outputRoot:resolve(directory,'candidate'),frontend});
}
