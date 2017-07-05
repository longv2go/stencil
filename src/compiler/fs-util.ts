import { FilesToWrite, StencilSystem } from './interfaces';


export function writeFiles(sys: StencilSystem, filesToWrite: FilesToWrite, ensureDir: string): Promise<any> {
  // copy this object incase somehow it changes during the async writes
  // shouldn't be possible, but who knows
  filesToWrite = Object.assign({}, filesToWrite);

  const filePaths = Object.keys(filesToWrite);
  if (!filePaths.length) {
    return Promise.resolve();
  }

  const directories = getDirectoriesFromFiles(sys, filesToWrite);
  if (directories.indexOf(ensureDir) === -1) {
    directories.push(ensureDir);
  }

  return ensureDirectoriesExist(sys, directories, [sys.cwd]).then(() => {
    return writeToDisk(sys, filesToWrite);
  });
}


export function updateDirectories(sys: StencilSystem, filesToWrite: FilesToWrite, ensureDir: string): Promise<any> {
  return writeFiles(sys, filesToWrite, ensureDir);
}


function writeToDisk(sys: StencilSystem, filesToWrite: FilesToWrite): Promise<any> {
  // assumes directories to be saved in already exit
  return new Promise((resolve, reject) => {
    const filePathsToWrite = Object.keys(filesToWrite);
    let doneWriting = 0;
    let rejected = false;

    if (!filePathsToWrite.length) {
      // shouldn't be possible, but ya never know
      resolve();
      return;
    }

    filePathsToWrite.forEach(filePathToWrite => {
      sys.fs.writeFile(filePathToWrite, filesToWrite[filePathToWrite], (err) => {
        if (err) {
          rejected = true;
          reject(err);

        } else {
          doneWriting++;
          if (doneWriting >= filePathsToWrite.length && !rejected) {
            resolve();
          }
        }
      });
    });
  });
}


function ensureDirectoriesExist(sys: StencilSystem, directories: string[], existingDirectories: string[]) {
  return new Promise(resolve => {

    existingDirectories = existingDirectories.map(existingDirectory => {
      return existingDirectory + '/';
    });

    const checkDirectories = sortDirectories(sys, directories).slice();

    function ensureDir() {
      if (checkDirectories.length === 0) {
        resolve();
        return;
      }

      const checkDirectory = checkDirectories.shift();
      if (existingDirectories.indexOf(checkDirectory + '/') > -1) {
        ensureDir();
        return;
      }

      const dirPaths = checkDirectory.split(sys.path.sep);
      let pathSections = 1;

      function ensureSection() {
        if (pathSections >= dirPaths.length) {
          ensureDir();
          return;
        }

        const dirPath = dirPaths.slice(0, pathSections).join(sys.path.sep);
        sys.fs.mkdir(dirPath, () => {
          // not worrying about the error here
          // if there's an error, it's probably because this directory already exists
          // which is what we want, no need to check access AND mkdir
          existingDirectories.push(dirPath + '/');
          pathSections++;
          ensureSection();
        });
      }

      ensureSection();
    }

    ensureDir();
  });
}


function getDirectoriesFromFiles(sys: StencilSystem, filesToWrite: FilesToWrite) {
  const directories: string[] = [];

  Object.keys(filesToWrite).forEach(filePath => {
    const dir = sys.path.dirname(filePath);
    if (directories.indexOf(dir) === -1) {
      directories.push(dir);
    }
  });

  return directories;
}


function sortDirectories(sys: StencilSystem, directories: string[]) {
  return directories.sort((a, b) => {
    const aPaths = a.split(sys.path.sep).length;
    const bPaths = b.split(sys.path.sep).length;

    if (aPaths < bPaths) return -1;
    if (aPaths > bPaths) return 1;

    if (a < b) return -1;
    if (a > b) return 1;

    return 0;
  });
}

