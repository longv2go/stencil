import { access, createModuleFileMeta, isTsSourceFile, readFile } from './util';
import { CompilerConfig, CompileResult, CompileResults, Logger, StencilSystem, WorkerBuildContext } from './interfaces';
// import { generateManifest } from './manifest';
// import { setupCompilerWatch } from './watch';
import { transpile } from './transpile';
import { WorkerManager } from './worker-manager';


export function compile(sys: StencilSystem, logger: Logger, workerManager: WorkerManager, compilerConfig: CompilerConfig) {
  // within main thread
  logger.debug(`compile, include: ${compilerConfig.include}`);
  logger.debug(`compile, outDir: ${compilerConfig.compilerOptions.outDir}`);

  compilerConfig.include = compilerConfig.include || [];

  if (!compilerConfig.exclude) {
    compilerConfig.exclude = ['node_modules', 'bower_components'];
  }

  const compileResults: CompileResults = {
    moduleFiles: [],
    diagnostics: []
  };

  return Promise.all(compilerConfig.include.map(includePath => {
    return access(sys, includePath).then(pathExists => {
      if (!pathExists) {
        return Promise.resolve(null);
      }
      return compileDirectory(sys, logger, includePath, compilerConfig, workerManager, compileResults);
    });

  })).then(() => {
    if (compileResults.diagnostics && compileResults.diagnostics.length > 0) {
      compileResults.diagnostics.forEach(d => {
        logger[d.level](d.msg);
        d.stack && logger.debug(d.stack);
      });
    }

    return compileResults;
  });

  // return Promise.all(scanDirPromises)
  //   .then(() => {
  //     return transpile(config, ctx);

  //   }).then(() => {
  //     return processStyles(config, ctx);

  //   }).then(() => {
  //     return generateManifest(config, ctx);

  //   }).then(() => {
  //     return setupCompilerWatch(config, ctx, config.sys.typescript.sys);

  //   }).then(() => {
  //     config.logger.info('compile, done');
  //     return ctx.results;

  //   });
}


function compileDirectory(sys: StencilSystem, logger: Logger, dir: string, compilerConfig: CompilerConfig, workerManager: WorkerManager, compileResults: CompileResults): Promise<any> {
  return new Promise(resolve => {
    // loop through this directory and sub directories looking for
    // files that need to be transpiled
    logger.debug(`compileDirectory: ${dir}`);

    sys.fs.readdir(dir, (err, files) => {
      if (err) {
        compileResults.diagnostics.push({
          msg: `compileDirectory, fs.readdir: ${dir}, ${err}`,
          level: 'error'
        });
        resolve();
        return;
      }

      const promises: Promise<any>[] = [];

      files.forEach(dirItem => {
        // let's loop through each of the files we've found so far
        const readPath = sys.path.join(dir, dirItem);

        if (!isValidDirectory(compilerConfig, readPath)) {
          // don't bother continuing for invalid directories
          return;
        }

        promises.push(new Promise(resolve => {

          sys.fs.stat(readPath, (err, stats) => {
            if (err) {
              // derp, not sure what's up here, let's just print out the error
              compileResults.diagnostics.push({
                msg: `compileDirectory, fs.stat: ${readPath}, ${err}`,
                level: 'error'
              });
              resolve();

            } else if (stats.isDirectory()) {
              // looks like it's yet another directory
              // let's keep drilling down
              compileDirectory(sys, logger, readPath, compilerConfig, workerManager, compileResults).then(() => {
                resolve();
              });

            } else if (isTsSourceFile(readPath)) {
              // woot! we found a typescript file that needs to be transpiled
              // let's send this over to our worker manager who can
              // then assign a worker to this exact file
              workerManager.compileFile(compilerConfig, readPath).then(compileWorkerResult => {
                // awesome, our worker friend finished the job and responded
                // let's resolve and let the main thread take it from here
                if (compileWorkerResult.moduleFile) {
                  compileResults.moduleFiles.push(compileWorkerResult.moduleFile);
                }
                if (compileWorkerResult.diagnostics) {
                  compileResults.diagnostics = compileResults.diagnostics.concat(compileWorkerResult.diagnostics);
                }

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


export function compileFileWorker(sys: StencilSystem, logger: Logger, ctx: WorkerBuildContext, compilerConfig: CompilerConfig, filePath: string) {
  // within worker thread
  return transpile(sys, logger, ctx, compilerConfig, filePath).then(compileResult => {

    return processIncludedStyles(sys, logger, ctx, compilerConfig, compileResult).then(() => {
      return compileResult;
    });

  }).catch(err => {
    const compileResult: CompileResult = {
      diagnostics: [{
        msg: err.toString(),
        level: 'error',
        stack: err.stack
      }]
    };
    return compileResult;
  });
}


function processIncludedStyles(sys: StencilSystem, logger: Logger, ctx: WorkerBuildContext, compilerConfig: CompilerConfig, compileResult: CompileResult) {
  if (!compileResult || !compileResult.moduleFile) {
    return Promise.resolve(null);
  }
  const moduleFile = compileResult.moduleFile;
  if (!moduleFile.isTsSourceFile || !moduleFile.cmpMeta || !moduleFile.cmpMeta.styleMeta) {
    return Promise.resolve(null);
  }

  const destDir = compilerConfig.compilerOptions.outDir;

  logger.debug(`compile, processStyles, destDir ${destDir}`);

  const promises: Promise<any>[] = [];
  compileResult.includedSassFiles = [];

  const modeNames = Object.keys(moduleFile.cmpMeta.styleMeta);
  modeNames.forEach(modeName => {
    const modeMeta = Object.assign({}, moduleFile.cmpMeta.styleMeta[modeName]);

    if (modeMeta.styleUrls) {
      modeMeta.styleUrls.forEach(styleUrl => {
        const scssFileName = sys.path.basename(styleUrl);
        const scssFilePath = sys.path.join(moduleFile.srcDir, scssFileName);
        promises.push(
          getIncludedSassFiles(sys, logger, ctx, compileResult, scssFilePath)
        );
      });
    }

  });

  return Promise.all(promises).then(() => {
    const files = new Map<string, string>();
    const promises: Promise<any>[] = [];

    compileResult.includedSassFiles.forEach(includedSassFile => {

      compilerConfig.include.forEach(includeDir => {
        if (includedSassFile.indexOf(includeDir) === 0) {
          const src = includedSassFile;
          const relative = includedSassFile.replace(includeDir, '');
          const dest = sys.path.join(destDir, relative);

          promises.push(readFile(sys, src).then(content => {
            files.set(dest, content);
          }));
        }
      });

    });

    return Promise.all(promises).then(() => {
      // return writeFiles(sys, files).catch(err => {
      //   compileResult.diagnostics = compileResult.diagnostics || [];
      //   compileResult.diagnostics.push({
      //     msg: `processIncludedStyles, writeFiles: ${err}`,
      //     level: 'error'
      //   });
      // });
    });
  });
}


function getIncludedSassFiles(sys: StencilSystem, logger: Logger, ctx: WorkerBuildContext, compileResult: CompileResult, scssFilePath: string) {
  return new Promise(resolve => {

    const sassConfig = {
      file: scssFilePath,
      outFile: `${scssFilePath}.tmp`
    };

    if (compileResult.includedSassFiles.indexOf(scssFilePath) === -1) {
      compileResult.includedSassFiles.push(scssFilePath);
    }

    logger.debug(`compile, getIncludedSassFiles: ${scssFilePath}`);

    sys.sass.render(sassConfig, (err, result) => {
      if (err) {
        logger.error(`sass.render, getIncludedSassFiles, ${err}`);

      } else {
        result.stats.includedFiles.forEach((includedFile: string) => {
          if (compileResult.includedSassFiles.indexOf(includedFile) === -1) {
            compileResult.includedSassFiles.push(includedFile);

            const fileMeta = createModuleFileMeta(sys, ctx, includedFile, '');
            fileMeta.recompileOnChange = true;
          }
        });
      }

      // always resolve
      resolve();
    });

  });
}


function isValidDirectory(config: CompilerConfig, filePath: string) {
  for (var i = 0; i < config.exclude.length; i++) {
    if (filePath.indexOf(config.exclude[i]) > -1) {
      return false;
    }
  }
  return true;
}
