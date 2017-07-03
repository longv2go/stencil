import { WorkerBuildContext, ModuleFileMeta, StencilSystem, StyleFileMeta } from './interfaces';


export function getFileMeta(sys: StencilSystem, ctx: WorkerBuildContext, filePath: string): Promise<ModuleFileMeta> {
  return Promise.resolve().then(() => {
    const fileMeta = ctx.moduleFiles.get(filePath);
    if (fileMeta) {
      return fileMeta;
    }

    return readFile(sys, filePath).then(srcText => {
      return createModuleFileMeta(sys, ctx, filePath, srcText);
    });
  });
}


export function createModuleFileMeta(sys: StencilSystem, ctx: WorkerBuildContext, filePath: string, srcText: string) {
  ctx.moduleFiles = ctx.moduleFiles || new Map();

  let moduleFile = ctx.moduleFiles.get(filePath);
  if (!moduleFile) {
    moduleFile = {
      fileName: sys.path.basename(filePath),
      filePath: filePath,
      fileExt: sys.path.extname(filePath),
      srcDir: sys.path.dirname(filePath),
      srcText: srcText,
      jsFilePath: null,
      jsText: null,
      isTsSourceFile: isTsSourceFile(filePath),
      hasCmpClass: false,
      cmpMeta: null,
      cmpClassName: null,
      isWatching: false,
      recompileOnChange: false,
      rebundleOnChange: false,
      transpiledCount: 0
    };

    ctx.moduleFiles.set(filePath, moduleFile);
  }

  if (moduleFile.isTsSourceFile) {
    moduleFile.hasCmpClass = hasCmpClass(moduleFile.srcText, moduleFile.filePath);
  }

  return moduleFile;
}


export function createStyleFileMeta(sys: StencilSystem, ctx: WorkerBuildContext, filePath: string, srcText: string): StyleFileMeta {
  ctx.styleFiles = ctx.styleFiles || new Map();

  let styleFiles = ctx.styleFiles.get(filePath);
  if (!styleFiles) {
    styleFiles = {
      fileName: sys.path.basename(filePath),
      filePath: filePath,
      fileExt: sys.path.extname(filePath),
      srcDir: sys.path.dirname(filePath),
      srcText: srcText,
      cssFilePath: null,
      cssText: null,
      isScssSourceFile: isScssSourceFile(filePath),
      isWatching: false,
      recompileOnChange: false,
      rebundleOnChange: false
    };

    ctx.styleFiles.set(filePath, styleFiles);
  }

  return styleFiles;
}


export function readFile(sys: StencilSystem, filePath: string) {
  return new Promise<string>((resolve, reject) => {
    sys.fs.readFile(filePath, 'utf-8', (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}


export function writeFile(sys: StencilSystem, filePath: string, content: string): Promise<any> {
  return new Promise((resolve, reject) => {
    sys.fs.writeFile(filePath, content, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}


export function copyFile(sys: StencilSystem, src: string, dest: string) {
  return readFile(sys, src).then(content => {
    return writeFile(sys, dest, content);
  });
}


export function writeFiles(sys: StencilSystem, files: Map<string, string>) {
  const paths: string[] = [];

  files.forEach((content, filePath) => {
    content;
    paths.push(filePath);
  });

  return ensureDirs(sys, paths).then(() => {
    const promises: Promise<any>[] = [];

    files.forEach((content, filePath) => {
      promises.push(writeFile(sys, filePath, content));
    });

    return Promise.all(promises);
  });
}


export function access(sys: StencilSystem, filePath: string): Promise<boolean> {
  return new Promise(resolve => {
    sys.fs.access(filePath, err => {
      if (err) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}


export function ensureDir(sys: StencilSystem, filePath: string) {
  return ensureDirs(sys, [filePath]);
}


export function ensureDirs(sys: StencilSystem, filePaths: string[]) {
  const path = sys.path;
  const fs = sys.fs;

  let checkDirs: string[] = [];

  filePaths.forEach(p => {
    const dir = path.dirname(p);
    if (checkDirs.indexOf(dir) === -1) {
      checkDirs.push(dir);
    }
  });

  checkDirs = checkDirs.sort((a, b) => {
    if (a.split(path.sep).length < b.split(path.sep).length) {
      return -1;
    }
    if (a.split(path.sep).length > b.split(path.sep).length) {
      return 1;
    }
    if (a.length < b.length) {
      return -1;
    }
    if (a.length > b.length) {
      return 1;
    }
    if (a < b) {
      return -1;
    }
    if (a > b) {
      return 1;
    }
    return 0;
  });

  const dirExists = new Set();

  return new Promise((resolve, reject) => {

    function checkDir(resolve: Function) {
      const dir = checkDirs.shift();
      if (!dir) {
        resolve();
        return;
      }

      var chunks = dir.split(path.sep);

      checkChunk(chunks, 0, resolve);
    }

    function checkChunk(chunks: string[], appendIndex: number, resolve: Function) {
      if (appendIndex >= chunks.length - 1) {
        checkDir(resolve);
        return;
      }

      const dir = chunks.slice(0, appendIndex + 2).join(path.sep);

      if (dirExists.has(dir)) {
        checkChunk(chunks, ++appendIndex, resolve);
        return;
      }

      fs.access(dir, err => {
        if (err) {
          // no access
          fs.mkdir(dir, err => {
            if (err) {
              reject(err);

            } else {
              checkChunk(chunks, ++appendIndex, resolve);
            }
          });

        } else {
          // has access
          dirExists.add(dir);
          checkChunk(chunks, ++appendIndex, resolve);
        }
      });
    }

    checkDir(resolve);
  });
}


export function remove(sys: StencilSystem, fsPath: string) {
  return new Promise(resolve => {
    sys.fs.stat(fsPath, (err, stats) => {
      if (err) {
        resolve();

      } else if (stats.isFile()) {
        sys.fs.unlink(fsPath, () => {
          resolve();
        });

      } else {
        // read all directory files
        sys.fs.readdir(fsPath, (err, files) => {
          if (err) {
            resolve();

          } else {
            Promise.all(files.map(file => remove(sys, sys.path.join(fsPath, file)))).then(() => {
              // delete all sub files/directories
              sys.fs.rmdir(fsPath, () => {
                resolve();
              });
            });
          }
        });
      }
    });
  });
}


export function emptyDir(sys: StencilSystem, path: string): Promise<any> {
  return access(sys, path).then(pathExists => {
    if (pathExists) {
      // path already exists, so let's remove all sub files/directories
      return new Promise(resolve => {
        sys.fs.readdir(path, (err, files) => {
          if (err) {
            return Promise.resolve();
          }
          return Promise.all(files.map(fsPath => {
            return remove(sys, sys.path.join(path, fsPath));
          })).then(() => {
            resolve();
          });
        });
      });

    } else {
      // make sure it was created if it didn't already exist
      return ensureDir(sys, sys.path.join(path, 'file.tmp'));
    }
  });
}


export function isTsSourceFile(filePath: string) {
  const parts = filePath.toLowerCase().split('.');
  if (parts.length > 1) {
    if (parts[parts.length - 1] === 'ts' || parts[parts.length - 1] === 'tsx') {
      if (parts.length > 2 && parts[parts.length - 2] === 'd') {
        return false;
      }
      return true;
    }
  }
  return false;
}

export function isScssSourceFile(filePath: string) {
  const parts = filePath.toLowerCase().split('.');
  if (parts.length > 1) {
    return (parts[parts.length - 1] === 'scss');
  }
  return false;
}


export function hasCmpClass(sourceText: string, filePath: string) {
  if (filePath.indexOf('.tsx') === -1) {
    return false;
  }

  if (sourceText.indexOf('@Component') === -1) {
    return false;
  }

  return true;
}
