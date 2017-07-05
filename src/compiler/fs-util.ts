import { FilesToWrite, StencilSystem } from './interfaces';


export function writeFiles(sys: StencilSystem, filesToWrite: FilesToWrite) {
  const fileNames = Object.keys(filesToWrite);
  if (!fileNames.length) return Promise.resolve();

  return Promise.resolve();
}


export function updateDirectories(sys: StencilSystem, filesToWrite: FilesToWrite, ensureDir: string) {
  const fileNames = Object.keys(filesToWrite);
  if (!fileNames.length) return Promise.resolve();

  return Promise.resolve();
}
