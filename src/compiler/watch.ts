// import { WorkerBuildContext, BundlerConfig, CompilerConfig } from './interfaces';
// import { bundleWatch } from './bundle';
// import { compileWatch } from './compile';
// import * as ts from 'typescript';


// export function setupCompilerWatch(config: CompilerConfig, ctx: WorkerBuildContext, tsSys: ts.System) {
//   if (!config.isWatch || ctx.isCompilerWatchInitialized) return;
//   ctx.isCompilerWatchInitialized = true;

//   const changedFiles: string[] = [];
//   let timerId: NodeJS.Timer;

//   function compilerFileChanged(config: CompilerConfig, ctx: WorkerBuildContext, changedFile: string) {
//     if (changedFiles.indexOf(changedFile) === -1) {
//       changedFiles.push(changedFile);
//     }

//     const wasDeleted = ctx.moduleFiles.delete(changedFile);

//     config.logger.debug(`${changedFile} was ${wasDeleted ? 'removed from cache' : 'not found in the cache'}`);

//     clearTimeout(timerId);

//     timerId = setTimeout(() => {
//       config.logger.debug(`recompile`);

//       compileWatch(config, ctx, changedFiles.slice());

//       changedFiles.length = 0;
//     }, 200);
//   }

//   config.include.forEach(includePath => {
//     config.logger.debug(`compile, watching directory: ${includePath}`);

//     tsSys.watchDirectory(includePath === '' ? '.' : includePath, (changedFile: string) => {
//       compilerFileChanged(config, ctx, changedFile);
//     }, true);
//   });

//   ctx.moduleFiles.forEach(f => {
//     if (f.recompileOnChange && !f.isWatching) {
//       tsSys.watchFile(f.filePath, (changedFile) => {
//         compilerFileChanged(config, ctx, changedFile);
//       });
//     }
//   });
// }


// export function setupBundlerWatch(config: BundlerConfig, ctx: WorkerBuildContext, tsSys: ts.System) {
//   if (!config.isWatch || ctx.isBundlerWatchInitialized) return;

//   ctx.isBundlerWatchInitialized = true;

//   config.logger.debug(`bundle, watching directory: ${config.srcDir}`);

//   const changedFiles: string[] = [];
//   let timerId: any;

//   function bundlerFileChanged(config: BundlerConfig, ctx: WorkerBuildContext, changedFile: string) {
//     if (changedFiles.indexOf(changedFile) === -1) {
//       changedFiles.push(changedFile);
//     }

//     clearTimeout(timerId);

//     timerId = setTimeout(() => {
//       config.logger.debug(`rebundle`);

//       bundleWatch(config, ctx, changedFiles.slice());

//       changedFiles.length = 0;
//     }, 200);
//   }

//   tsSys.watchDirectory(config.srcDir === '' ? '.' : config.srcDir, (changedFile) => {
//     bundlerFileChanged(config, ctx, changedFile);
//   }, true);

//   ctx.moduleFiles.forEach(f => {
//     if (f.rebundleOnChange && !f.isWatching) {
//       tsSys.watchFile(f.filePath, (changedFile) => {
//         bundlerFileChanged(config, ctx, changedFile);
//       });
//     }
//   });
// }
