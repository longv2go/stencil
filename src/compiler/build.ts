import { BuildConfig, Manifest } from '../util/interfaces';
import { BuildResults, BundlerConfig, CompilerConfig, FilesToWrite } from './interfaces';
import { bundle } from './bundle';
import { compile } from './compile';
import { generateDependentManifests, mergeManifests, updateManifestUrls } from './manifest';
import { generateProjectFiles } from './build-project';
import { updateDirectories, writeFiles } from './fs-util';
import { WorkerManager } from './worker-manager';


export function build(buildConfig: BuildConfig) {
  normalizeBuildConfig(buildConfig);

  const sys = buildConfig.sys;
  const logger = buildConfig.logger;

  const timeSpan = logger.createTimeSpan(`build, ${buildConfig.devMode ? 'dev' : 'prod'} mode, started`);

  const workerManager = new WorkerManager(buildConfig.sys, buildConfig.logger);
  workerManager.connect(buildConfig.numWorkers);

  const buildResults: BuildResults = {
    diagnostics: [],
    manifest: {},
    componentRegistry: []
  };

  const filesToWrite: FilesToWrite = {};

  return Promise.resolve().then(() => {
    return generateDependentManifests(
      sys,
      logger,
      buildConfig.collections,
      buildConfig.rootDir,
      buildConfig.dest);

  }).then(dependentManifests => {
    return compileProject(buildConfig, workerManager).then(compileResults => {
      if (compileResults.diagnostics) {
        buildResults.diagnostics = buildResults.diagnostics.concat(compileResults.diagnostics);
      }
      if (compileResults.filesToWrite) {
        Object.assign(filesToWrite, compileResults.filesToWrite);
      }

      const resultsManifest: Manifest = compileResults.manifest || {};

      const localManifest = updateManifestUrls(
        logger,
        sys,
        resultsManifest,
        buildConfig.dest,
        buildConfig.dest
      );
      return mergeManifests([].concat((localManifest || []), dependentManifests));
    });

  }).then(manifest => {
    // bundle all of the components into their separate files
    return bundleProject(buildConfig, workerManager, manifest).then(bundleResults => {
      if (bundleResults.diagnostics) {
        buildResults.diagnostics = buildResults.diagnostics.concat(bundleResults.diagnostics);
      }
      if (bundleResults.filesToWrite) {
        Object.assign(filesToWrite, bundleResults.filesToWrite);
      }

      // generate the loader and core files for this project
      return generateProjectFiles(buildConfig, bundleResults.componentRegistry, filesToWrite);
    });

  }).then(() => {
    // write all the files in one go
    if (buildConfig.devMode) {
      // dev mode
      // only ensure the directories it needs exists and writes the files
      return writeFiles(sys, buildConfig.rootDir, filesToWrite, buildConfig.dest);
    }

    // prod mode
    // first removes any directories and files that aren't in the files to write
    // then ensure the directories it needs exists and writes the files
    return updateDirectories(sys, buildConfig.rootDir, filesToWrite, buildConfig.dest);

  }).catch(err => {
    buildResults.diagnostics.push({
      msg: err.toString(),
      type: 'error',
      stack: err.stack
    });

  }).then(() => {
    buildResults.diagnostics.forEach(d => {
      if (d.type === 'error' && logger.level === 'debug' && d.stack) {
        logger.error(d.stack);
      } else {
        logger[d.type](d.msg);
      }
    });

    if (buildConfig.watch) {
      timeSpan.finish(`build ready, watching files...`);

    } else {
      workerManager.disconnect();
      timeSpan.finish(`build finished`);
    }

    return buildResults;
  });
}


function compileProject(buildConfig: BuildConfig, workerManager: WorkerManager) {
  const config: CompilerConfig = {
    collectionDir: buildConfig.collectionDest,
    module: 'commonjs',
    target: 'es5',
    rootDir: buildConfig.src,
    srcDir: buildConfig.src,
    devMode: buildConfig.devMode,
    bundles: buildConfig.bundles,
    watch: buildConfig.watch,
    collection: buildConfig.collection
  };

  return compile(buildConfig.sys, buildConfig.logger, workerManager, config);
}


function bundleProject(buildConfig: BuildConfig, workerManager: WorkerManager, manifest: Manifest) {
  const bundlerConfig: BundlerConfig = {
    namespace: buildConfig.namespace,
    srcDir: buildConfig.src,
    destDir: buildConfig.dest,
    manifest: manifest,
    devMode: buildConfig.devMode,
    watch: buildConfig.watch
  };

  return bundle(buildConfig.sys, buildConfig.logger, bundlerConfig, workerManager);
}


export function normalizeBuildConfig(buildConfig: BuildConfig) {
  if (!buildConfig) {
    throw new Error(`invalid build config`);
  }
  if (!buildConfig.rootDir) {
    throw new Error('config.rootDir required');
  }
  if (!buildConfig.logger) {
    throw new Error(`config.logger required`);
  }
  if (!buildConfig.process) {
    throw new Error(`config.process required`);
  }
  if (!buildConfig.sys) {
    throw new Error('config.sys required');
  }
  if (!buildConfig.sys.fs) {
    throw new Error('config.sys.fs required');
  }
  if (!buildConfig.sys.createWorker) {
    throw new Error('config.sys.createWorker required');
  }
  if (!buildConfig.sys.generateContentHash) {
    throw new Error('config.sys.generateContentHash required');
  }
  if (!buildConfig.sys.getClientCoreFile) {
    throw new Error('config.sys.getClientCoreFile required');
  }
  if (!buildConfig.sys.minifyCss) {
    throw new Error('config.sys.minifyCss required');
  }
  if (!buildConfig.sys.minifyJs) {
    throw new Error('config.sys.minifyJs required');
  }
  if (!buildConfig.sys.module) {
    throw new Error('config.sys.module required');
  }
  if (!buildConfig.sys.path) {
    throw new Error('config.sys.path required');
  }
  if (!buildConfig.sys.rollup) {
    throw new Error('config.sys.rollup required');
  }
  if (!buildConfig.sys.sass) {
    throw new Error('config.sys.sass required');
  }
  if (!buildConfig.sys.typescript) {
    throw new Error('config.sys.typescript required');
  }

  if (typeof buildConfig.namespace !== 'string') {
    buildConfig.namespace = DEFAULT_NAMESPACE;
  }

  if (typeof buildConfig.src !== 'string') {
    buildConfig.src = DEFAULT_SRC_DIR;
  }
  if (!buildConfig.sys.path.isAbsolute(buildConfig.src)) {
    buildConfig.src = buildConfig.sys.path.join(buildConfig.rootDir, buildConfig.src);
  }

  if (typeof buildConfig.dest !== 'string') {
    buildConfig.dest = DEFAULT_DEST_DIR;
  }
  if (!buildConfig.sys.path.isAbsolute(buildConfig.dest)) {
    buildConfig.dest = buildConfig.sys.path.join(buildConfig.rootDir, buildConfig.dest);
  }

  if (typeof buildConfig.collectionDest !== 'string') {
    buildConfig.collectionDest = DEFAULT_COLLECTION_DIR;
  }
  if (!buildConfig.sys.path.isAbsolute(buildConfig.collectionDest)) {
    buildConfig.collectionDest = buildConfig.sys.path.join(buildConfig.rootDir, buildConfig.dest);
  }

  if (typeof buildConfig.numWorkers === 'number') {
    buildConfig.numWorkers = Math.min(Math.max(buildConfig.numWorkers, 0), 8);
  } else {
    buildConfig.numWorkers = DEFAULT_NUM_OF_WORKERS;
  }

  buildConfig.devMode = !!buildConfig.devMode;
  buildConfig.watch = !!buildConfig.watch;
  buildConfig.collection = !!buildConfig.collection;
  buildConfig.collections = buildConfig.collections || [];
  buildConfig.bundles = buildConfig.bundles || [];

  return buildConfig;
}


const DEFAULT_NAMESPACE = 'App';
const DEFAULT_SRC_DIR = 'src';
const DEFAULT_DEST_DIR = 'dist';
const DEFAULT_COLLECTION_DIR = 'collection';
const DEFAULT_NUM_OF_WORKERS = 4;
