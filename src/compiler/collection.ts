import { BuildConfig } from '../util/interfaces';
import { CompilerConfig, MainBuildContext } from './interfaces';
import { compile } from './compile';
import { generateDependentManifests } from './manifest';
import { validateBuildConfig } from './build';
import { WorkerManager } from './worker-manager';


export function collection(buildConfig: BuildConfig, mainCtx?: MainBuildContext) {
  // use the same build context object throughout the build
  mainCtx = mainCtx || {};

  if (!mainCtx.workerManager) {
    mainCtx.workerManager = new WorkerManager(buildConfig.sys, buildConfig.logger);
    mainCtx.workerManager.connect(buildConfig.numWorkers);
  }

  buildConfig.logger.info(`build, ${buildConfig.isDevMode ? 'dev' : 'prod'} mode`);

  return Promise.resolve().then(() => {
    // validate our data is good to go
    validateBuildConfig(buildConfig);

    return generateDependentManifests(
      buildConfig.sys,
      buildConfig.logger,
      buildConfig.collections,
      buildConfig.rootDir,
      buildConfig.compiledDir);

  }).then(() => {

    return compileProject(buildConfig, mainCtx.workerManager).then(() => {
      // if (results.errors && results.errors.length > 0) {
      //   results.errors.forEach(err => {
      //     buildConfig.logger.error(err);
      //   });
      //   throw 'build error';
      // }
    });

  }).then(() => {

    // remove temp compiled dir
    // removeFilePath(buildConfig.sys, buildConfig.compiledDir);
    buildConfig.logger.info(`build, done`);

  }).catch(err => {
    buildConfig.logger.error(err);
    err.stack && buildConfig.logger.error(err.stack);
  });
}


function compileProject(buildConfig: BuildConfig, workerManager: WorkerManager) {
  const config: CompilerConfig = {
    compilerOptions: {
      outDir: buildConfig.destDir,
      module: 'commonjs',
      target: 'es5',
      rootDir: buildConfig.srcDir
    },
    include: [
      buildConfig.srcDir
    ],
    exclude: [
      'node_modules',
      'compiler',
      'test'
    ],
    isDevMode: buildConfig.isDevMode,
    bundles: buildConfig.bundles,
    isWatch: buildConfig.isWatch
  };

  return compile(buildConfig.sys, buildConfig.logger, workerManager, config);
}
