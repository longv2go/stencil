import { BuildConfig } from '../util/interfaces';
import { BuildResults, CompilerConfig, FilesToWrite } from './interfaces';
import { compile } from './compile';
import { generateDependentManifests } from './manifest';
import { updateDirectories, writeFiles } from './fs-util';
import { validateBuildConfig } from './build';
import { WorkerManager } from './worker-manager';


export function collection(buildConfig: BuildConfig) {
  const sys = buildConfig.sys;
  const logger = buildConfig.logger;

  const timeSpan = logger.createTimeSpan(`collection, ${buildConfig.devMode ? 'dev' : 'prod'} mode, started`);

  buildConfig.collection = true;

  const workerManager = new WorkerManager(buildConfig.sys, buildConfig.logger);
  workerManager.connect(buildConfig.numWorkers);

  const buildResults: BuildResults = {
    diagnostics: [],
    manifest: {},
    componentRegistry: []
  };

  const filesToWrite: FilesToWrite = {};

  return Promise.resolve().then(() => {
    // validate our data is good to go
    validateBuildConfig(buildConfig);

    return generateDependentManifests(
      sys,
      logger,
      buildConfig.collections,
      buildConfig.rootDir,
      buildConfig.collectionOutDir);

  }).then(() => {
    return compileProject(buildConfig, workerManager).then(compileResults => {
      if (compileResults.diagnostics) {
        buildResults.diagnostics = buildResults.diagnostics.concat(compileResults.diagnostics);
      }
      if (compileResults.filesToWrite) {
        Object.assign(filesToWrite, compileResults.filesToWrite);
      }
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
      timeSpan.finish(`collection ready, watching files ...`);

    } else {
      workerManager.disconnect();
      timeSpan.finish(`collection finished`);
    }
  });
}


function compileProject(buildConfig: BuildConfig, workerManager: WorkerManager) {
  const config: CompilerConfig = {
    compilerOptions: {
      outDir: buildConfig.outDir,
      module: 'commonjs',
      target: 'es5',
      rootDir: buildConfig.srcDir
    },
    include: buildConfig.include,
    exclude: [
      'node_modules',
      'compiler',
      'test'
    ],
    devMode: buildConfig.devMode,
    bundles: buildConfig.bundles,
    watch: buildConfig.watch,
    collection: buildConfig.collection
  };

  return compile(buildConfig.sys, buildConfig.logger, workerManager, config);
}
