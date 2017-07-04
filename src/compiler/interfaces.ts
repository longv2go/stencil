export * from '../util/interfaces';
import { ComponentMeta, Manifest, Bundle } from '../util/interfaces';
import { WorkerManager } from './worker-manager';


export interface CompilerConfig {
  compilerOptions: CompilerOptions;
  include: string[];
  exclude?: string[];
  isDevMode?: boolean;
  bundles?: Bundle[];
  isWatch?: boolean;
  writeCompiledToDisk?: boolean;
}


export interface CompilerOptions {
  declaration?: boolean;
  lib?: string[];
  module?: 'es2015' | 'commonjs';
  rootDir?: string;
  outDir?: string;
  sourceMap?: boolean;
  target?: 'es5' | 'es2015';
}


export interface BundlerConfig {
  namespace: string;
  srcDir: string;
  destDir: string;
  isDevMode?: boolean;
  attachRegistryTo?: 'core'|'loader';
  isWatch?: boolean;
  attrCase?: number;
  manifest: Manifest;
}


export interface FileMeta {
  fileName: string;
  fileExt: string;
  filePath: string;
  srcDir: string;
  srcText: string;
  isWatching: boolean;
  recompileOnChange: boolean;
  rebundleOnChange: boolean;
}


export interface ModuleFileMeta extends FileMeta {
  jsFilePath: string;
  jsText: string;
  isTsSourceFile: boolean;
  hasCmpClass: boolean;
  cmpMeta: ComponentMeta;
  cmpClassName: string;
  transpiledCount: number;
}


export interface StyleFileMeta extends FileMeta {
  cssFilePath: string;
  cssText: string;
  isScssSourceFile: boolean;
}


export interface MainBuildContext {
  workerManager?: WorkerManager;
  results?: Results;
}


export interface WorkerBuildContext {
  moduleFiles?: Map<string, ModuleFileMeta>;
  styleFiles?: Map<string, StyleFileMeta>;
}


export interface ModuleResults {
  bundles?: {
    [bundleId: string]: string;
  };
  diagnostics?: Diagnostic[];
}


export interface CompileResults {
  moduleFiles?: {[filePath: string]: ModuleFileMeta};
  diagnostics?: Diagnostic[];
  includedSassFiles?: string[];
  manifest?: Manifest;
}


export interface StylesResults {
  bundles?: {
    [bundleId: string]: {
      [modeName: string]: string;
    };
  };
  diagnostics?: Diagnostic[];
}


export interface Diagnostic {
  msg: string;
  level: 'error'|'warn';
  filePath?: string;
  start?: number;
  length?: number;
  category?: any;
  code?: number;
  stack?: string;
}


export interface Results {
  compileResults?: CompileResults;
  diagnostics?: Diagnostic[];
  manifest?: Manifest;
  componentRegistry?: string;
}
