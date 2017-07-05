import { BuildConfig, CompileResults, FilesToWrite, ModuleFiles } from './interfaces';
import { generateManifest } from './manifest';
import { isTsSourceFile, readFile } from './util';
import { transpileWorker } from './transpile';
import { WorkerManager } from './worker-manager';


export function compile(buildConfig: BuildConfig, workerManager: WorkerManager) {
  // within MAIN thread
  const logger = buildConfig.logger;

  const timeSpan = buildConfig.logger.createTimeSpan(`compile started`);

  logger.debug(`compile, srcDir: ${buildConfig.src}`);
  logger.debug(`compile, collectionDest: ${buildConfig.collectionDest}`);

  const compileResults: CompileResults = {
    moduleFiles: {},
    diagnostics: [],
    manifest: {},
    filesToWrite: {},
    includedSassFiles: []
  };

  return compileDirectory(buildConfig, buildConfig.src, workerManager, compileResults, compileResults.filesToWrite).then(() => {
    compileResults.manifest = generateManifest(buildConfig, compileResults);

  }).then(() => {
    return copySourceSassFilesToDest(buildConfig, compileResults);

  }).catch(err => {
    logger.error(err);
    err.stack && logger.debug(err.stack);

  }).then(() => {
    timeSpan.finish(`compile finished`);
    return compileResults;
  });
}


function compileDirectory(buildConfig: BuildConfig, dir: string, workerManager: WorkerManager, compileResults: CompileResults, filesToWrite: FilesToWrite): Promise<any> {
  // within MAIN thread
  return new Promise(resolve => {
    // loop through this directory and sub directories looking for
    // files that need to be transpiled
    const sys = buildConfig.sys;
    const logger = buildConfig.logger;

    logger.debug(`compileDirectory: ${dir}`);

    sys.fs.readdir(dir, (err, files) => {
      if (err) {
        compileResults.diagnostics.push({
          msg: `Unable to read: ${dir}`,
          type: 'error',
          stack: err.stack
        });
        resolve();
        return;
      }

      const promises: Promise<any>[] = [];

      files.forEach(dirItem => {
        // let's loop through each of the files we've found so far
        const readPath = sys.path.join(dir, dirItem);

        if (!isValidDirectory(buildConfig.exclude, readPath)) {
          // don't bother continuing for invalid directories
          return;
        }

        promises.push(new Promise(resolve => {

          sys.fs.stat(readPath, (err, stats) => {
            if (err) {
              // derp, not sure what's up here, let's just print out the error
              compileResults.diagnostics.push({
                msg: `compileDirectory, fs.stat: ${readPath}, ${err}`,
                type: 'error'
              });
              resolve();

            } else if (stats.isDirectory()) {
              // looks like it's yet another directory
              // let's keep drilling down
              compileDirectory(buildConfig, readPath, workerManager, compileResults, filesToWrite).then(() => {
                resolve();
              });

            } else if (stats.isFile() && isTsSourceFile(readPath)) {
              // woot! we found a typescript file that needs to be transpiled
              // let's send this over to our worker manager who can
              // then assign a worker to this exact file
              compileFile(buildConfig, workerManager, readPath, compileResults, filesToWrite).then(() => {
                resolve();
              });

            } else {
              // idk, don't care, just resolve
              resolve();
            }
          });

        }));

      });

      Promise.all(promises).then(() => {
        // cool, all the recursive scan directories have finished
        // let this resolve and start bubbling up the resolves
        resolve();
      });
    });

  });
}


function compileFile(buildConfig: BuildConfig, workerManager: WorkerManager, filePath: string, compileResults: CompileResults, filesToWrite: FilesToWrite) {
  // within MAIN thread
  // let's send this over to our worker manager who can
  // then assign a worker to this exact file
  return workerManager.compileFile(buildConfig, filePath).then(workerResult => {
    // awesome, our worker friend finished the job and responded
    // let's resolve and let the main thread take it from here
    if (workerResult.moduleFiles) {
      Object.keys(workerResult.moduleFiles).forEach(tsFilePath => {
        const moduleFile = workerResult.moduleFiles[tsFilePath];

        compileResults.moduleFiles[tsFilePath] = moduleFile;

        if (buildConfig.collection) {
          filesToWrite[moduleFile.jsFilePath] = moduleFile.jsText;
        }

        if (moduleFile.includedSassFiles) {
          moduleFile.includedSassFiles.forEach(includedSassFile => {
            if (compileResults.includedSassFiles.indexOf(includedSassFile) === -1) {
              compileResults.includedSassFiles.push(includedSassFile);
            }
          });
        }
      });
    }

    if (workerResult.diagnostics) {
      compileResults.diagnostics = compileResults.diagnostics.concat(workerResult.diagnostics);
    }
  });
}


export function compileFileWorker(buildConfig: BuildConfig, workerId: number, moduleFileCache: ModuleFiles, filePath: string) {
  // within WORKER thread

  const compileResults: CompileResults = {
    moduleFiles: {},
    diagnostics: [],
    filesToWrite: {},
    workerId: workerId
  };

  return Promise.resolve().then(() => {

    return transpileWorker(buildConfig, moduleFileCache, filePath).then(transpileResults => {
      if (transpileResults.diagnostics) {
        compileResults.diagnostics = compileResults.diagnostics.concat(transpileResults.diagnostics);
      }
      if (transpileResults.moduleFiles) {
        Object.assign(compileResults.moduleFiles, transpileResults.moduleFiles);
      }
    });

  }).catch(err => {
    compileResults.diagnostics.push({
      msg: err.toString(),
      type: 'error',
      stack: err.stack
    });

  }).then(() => {
    return compileResults;
  });
}


function copySourceSassFilesToDest(buildConfig: BuildConfig, compileResults: CompileResults): Promise<any> {
  if (!buildConfig.collection) {
    return Promise.resolve();
  }

  const sys = buildConfig.sys;

  return Promise.all(compileResults.includedSassFiles.map(sassSrcPath => {
    return readFile(sys, sassSrcPath).then(sassSrcText => {
      const includeDir = sassSrcPath.indexOf(buildConfig.src) === 0;
      let sassDestPath: string;

      if (includeDir) {
        sassDestPath = sys.path.join(
          buildConfig.collectionDest,
          sys.path.relative(buildConfig.src, sassSrcPath)
        );

      } else {
        sassDestPath = sys.path.join(
          buildConfig.rootDir,
          sys.path.relative(buildConfig.rootDir, sassSrcPath)
        );
      }

      compileResults.filesToWrite[sassDestPath] = sassSrcText;
    });
  }));
}


function isValidDirectory(exclude: string[], filePath: string) {
  for (var i = 0; i < exclude.length; i++) {
    if (filePath.indexOf(exclude[i]) > -1) {
      return false;
    }
  }
  return true;
}
