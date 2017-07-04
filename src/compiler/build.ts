import { BuildConfig, Manifest } from '../util/interfaces';
import { BundlerConfig, CompilerConfig, MainBuildContext } from './interfaces';
import { bundle } from './bundle';
import { compile } from './compile';
import { generateDependentManifests, mergeManifests, updateManifestUrls } from './manifest';
// import { generateProjectCore } from './build-project-core';
import { WorkerManager } from './worker-manager';
// import { emptyDir } from './util';


export function build(buildConfig: BuildConfig, mainCtx?: MainBuildContext) {
  const sys = buildConfig.sys;
  const logger = buildConfig.logger;

  const timeSpan = logger.createTimeSpan(`build, ${buildConfig.isDevMode ? 'dev' : 'prod'} mode, started`);

  buildConfig.writeCompiledToDisk = false;

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

  }).then(dependentManifests => {
    return compileProject(buildConfig, mainCtx.workerManager).then(compileResults => {

      const resultsManifest: Manifest = compileResults.manifest || {};

      const localManifest = updateManifestUrls(
        logger,
        sys,
        resultsManifest,
        buildConfig.destDir,
        buildConfig.destDir
      );
      return mergeManifests([].concat((localManifest || []), dependentManifests));
    });

  }).then(manifest => {
    // bundle all of the components into their separate files
    return bundleProject(buildConfig, mainCtx, manifest);

  }).catch(err => {
    logger.error(err);
    err.stack && logger.debug(err.stack);

  }).then(() => {
    mainCtx.workerManager.disconnect();

    if (buildConfig.isWatch) {
      timeSpan.finish(`build ready, watching files ...`);

    } else {
      timeSpan.finish(`build finished`);
    }
  });

  // }).then(bundleProjectResults => {
  //   // generate the core loader and aux files for this project
  //   return generateProjectCore(buildConfig, bundleProjectResults.componentRegistry);

  // }).then(() => {
  //   // remove temp compiled dir
  //   // remove is async but no need to wait on it
  //   // removeFilePath(buildConfig.sys, buildConfig.compiledDir);

  //   buildConfig.logger.info(`build, done`);

  // }).catch(err => {
  //   buildConfig.logger.error(err);
  //   err.stack && buildConfig.logger.error(err.stack);
  // });
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
      'test'
    ],
    isDevMode: buildConfig.isDevMode,
    bundles: buildConfig.bundles,
    isWatch: buildConfig.isWatch,
    writeCompiledToDisk: buildConfig.writeCompiledToDisk
  };

  return compile(buildConfig.sys, buildConfig.logger, workerManager, config);
}


function bundleProject(buildConfig: BuildConfig, mainCtx: MainBuildContext, manifest: Manifest) {
  const bundlerConfig: BundlerConfig = {
    namespace: buildConfig.namespace,
    srcDir: buildConfig.srcDir,
    destDir: buildConfig.destDir,
    manifest: manifest,
    isDevMode: buildConfig.isDevMode,
    isWatch: buildConfig.isWatch
  };

  return bundle(buildConfig.sys, buildConfig.logger, bundlerConfig, mainCtx);
}


export function validateBuildConfig(buildConfig: BuildConfig) {
  if (!buildConfig.srcDir) {
    throw `config.srcDir required`;
  }
  if (!buildConfig.sys) {
    throw 'config.sys required';
  }
  if (!buildConfig.sys.fs) {
    throw 'config.sys.fs required';
  }
  if (!buildConfig.sys.path) {
    throw 'config.sys.path required';
  }
  if (!buildConfig.sys.sass) {
    throw 'config.sys.sass required';
  }
  if (!buildConfig.sys.rollup) {
    throw 'config.sys.rollup required';
  }
  if (!buildConfig.sys.typescript) {
    throw 'config.sys.typescript required';
  }

  // ensure we've at least got empty objects
  buildConfig.bundles = buildConfig.bundles || [];
  buildConfig.collections = buildConfig.collections || [];

  // default to "App" namespace if one wasn't provided
  buildConfig.namespace = (buildConfig.namespace || 'App').trim();

  // default to "bundles" directory if one wasn't provided
  buildConfig.namespace = (buildConfig.namespace || 'bundles').trim();
}
