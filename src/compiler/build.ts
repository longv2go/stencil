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
      buildConfig.outDir);

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
        buildConfig.outDir,
        buildConfig.outDir
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
      // only ensure the directories it needs exists and writes the files
      return writeFiles(sys, filesToWrite, buildConfig.outDir);

    } else {
      // first removes any directories and files that aren't in the files to write
      // then ensure the directories it needs exists and writes the files
      return updateDirectories(sys, filesToWrite, buildConfig.outDir);
    }

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
    compilerOptions: {
      outDir: buildConfig.outDir,
      module: 'commonjs',
      target: 'es5',
      rootDir: buildConfig.include[0] // todo
    },
    include: buildConfig.include,
    exclude: [
      'node_modules',
      'test'
    ],
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
    include: buildConfig.include,
    outDir: buildConfig.outDir,
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
  if (!buildConfig.logger) {
    throw new Error(`config.logger required`);
  }
  if (!buildConfig.process) {
    throw new Error(`config.process required`);
  }
  if (!buildConfig.sys.cwd) {
    throw new Error('config.cwd required');
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

  if (typeof buildConfig.rootDir !== 'string') {
    buildConfig.rootDir = buildConfig.sys.cwd;
  }

  // default to "App" namespace if one wasn't provided
  if (typeof buildConfig.namespace !== 'string') {
    buildConfig.namespace = DEFAULT_NAMESPACE;
  }

  buildConfig.devMode = !!buildConfig.devMode;
  buildConfig.watch = !!buildConfig.watch;
  buildConfig.collection = !!buildConfig.collection;
  buildConfig.collections = buildConfig.collections || [];
  buildConfig.bundles = buildConfig.bundles || [];

  if (typeof buildConfig.numWorkers === 'number') {
    buildConfig.numWorkers = Math.min(Math.max(buildConfig.numWorkers, 0), 8);
  } else {
    buildConfig.numWorkers = DEFAULT_NUM_OF_WORKERS;
  }

  if (!buildConfig.include || !buildConfig.include.length) {
    buildConfig.include = [DEFAULT_SRC_DIR];
  }

  buildConfig.include = buildConfig.include.map(includeDir => {
    if (!buildConfig.sys.path.isAbsolute(includeDir)) {
      return buildConfig.sys.path.join(buildConfig.rootDir, includeDir);
    }
    return includeDir;
  });

  if (!buildConfig.outDir) {
    buildConfig.outDir = DEFAULT_OUT_DIR;
  }
  if (!buildConfig.sys.path.isAbsolute(buildConfig.outDir)) {
    buildConfig.outDir = buildConfig.sys.path.join(buildConfig.rootDir, buildConfig.outDir);
  }

  if (!buildConfig.collectionOutDir) {
    buildConfig.collectionOutDir = DEFAULT_COLLECTION_DIR;
  }
  if (!buildConfig.sys.path.isAbsolute(buildConfig.collectionOutDir)) {
    buildConfig.collectionOutDir = buildConfig.sys.path.join(buildConfig.rootDir, buildConfig.outDir);
  }

  return buildConfig;
}


const DEFAULT_NAMESPACE = 'APP';
const DEFAULT_SRC_DIR = 'src';
const DEFAULT_OUT_DIR = 'dist';
const DEFAULT_COLLECTION_DIR = 'collection';
const DEFAULT_NUM_OF_WORKERS = 4;
