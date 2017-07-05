export * from '../util/interfaces';
import { Bundle, ComponentMeta, Diagnostic, Manifest, LoadComponentRegistry } from '../util/interfaces';


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


export interface ModuleFileMeta {
  fileName: string;
  filePath: string;
  srcText: string;
  jsFilePath?: string;
  jsText?: string;
  hasCmpClass?: boolean;
  cmpMeta?: ComponentMeta;
  cmpClassName?: string;
}


export interface ModuleFiles {
  [filePath: string]: ModuleFileMeta;
}


export interface CompileResults {
  moduleFiles: ModuleFiles;
  diagnostics: Diagnostic[];
  includedSassFiles?: string[];
  manifest?: Manifest;
  filesToWrite: FilesToWrite;
}


export interface TranspileResults {
  moduleFiles: ModuleFiles;
  diagnostics: Diagnostic[];
}


export interface ModuleResults {
  bundles: {
    [bundleId: string]: string;
  };
  filesToWrite: FilesToWrite;
  diagnostics: Diagnostic[];
}


export interface FilesToWrite {
  [filePath: string]: string;
}


export interface StylesResults {
  bundles: {
    [bundleId: string]: {
      [modeName: string]: string;
    };
  };
  filesToWrite: FilesToWrite;
  diagnostics: Diagnostic[];
}


export interface BundleResults {
  filesToWrite: FilesToWrite;
  diagnostics: Diagnostic[];
  componentRegistry: LoadComponentRegistry[];
}


export interface BuildResults {
  diagnostics: Diagnostic[];
  manifest: Manifest;
  componentRegistry: LoadComponentRegistry[];
}
