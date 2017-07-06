import { StencilSystem } from './interfaces';


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
