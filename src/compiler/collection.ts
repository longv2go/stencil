import { BuildConfig } from '../util/interfaces';
import { CompilerConfig, MainBuildContext } from './interfaces';
import { compile } from './compile';
import { generateDependentManifests } from './manifest';
import { validateBuildConfig } from './build';
import { WorkerManager } from './worker-manager';


export function collection(buildConfig: BuildConfig, mainCtx?: MainBuildContext) {
  const sys = buildConfig.sys;
  const logger = buildConfig.logger;

  const timeSpan = logger.createTimeSpan(`collection, ${buildConfig.isDevMode ? 'dev' : 'prod'} mode, started`);

  buildConfig.writeCompiledToDisk = true;

  mainCtx = mainCtx || {};

  if (!mainCtx.workerManager) {
    mainCtx.workerManager = new WorkerManager(buildConfig.sys, buildConfig.logger);
    mainCtx.workerManager.connect(buildConfig.numWorkers);
  }

  return Promise.resolve().then(() => {
    // validate our data is good to go
    validateBuildConfig(buildConfig);

    return generateDependentManifests(
      sys,
      logger,
      buildConfig.collections,
      buildConfig.rootDir,
      buildConfig.destDir);

  }).then(() => {
    return compileProject(buildConfig, mainCtx.workerManager);

  }).catch(err => {
    buildConfig.logger.error(err);

  }).then(() => {
    mainCtx.workerManager.disconnect();

    if (buildConfig.isWatch) {
      timeSpan.finish(`collection finished, watching files ...`);

    } else {
      timeSpan.finish(`collection finished`);
    }
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
    isWatch: buildConfig.isWatch,
    writeCompiledToDisk: buildConfig.writeCompiledToDisk
  };

  return compile(buildConfig.sys, buildConfig.logger, workerManager, config);
}
