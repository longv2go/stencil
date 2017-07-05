import { CompilerConfig, CompileResults, Diagnostic, Logger, ModuleFiles,
  ModuleFileMeta, StencilSystem, TranspileResults } from './interfaces';
import { readFile } from './util';
import { componentClass } from './transformers/component-class';
import { jsxToVNode } from './transformers/jsx-to-vnode';
import { removeImports } from './transformers/remove-imports';
import { updateLifecycleMethods } from './transformers/update-lifecycle-methods';
import * as ts from 'typescript';


export function transpileWorker(sys: StencilSystem, moduleFileCache: ModuleFiles, compilerConfig: CompilerConfig, filePath: string) {
  // within WORKER thread
  const transpileResults: TranspileResults = {
    moduleFiles: {},
    diagnostics: []
  };

  return readFile(sys, filePath).then(srcText => {
    const moduleFile: ModuleFileMeta = {
      filePath: filePath,
      fileName: sys.path.basename(filePath),
      srcText: srcText
    };
    transpileResults.moduleFiles[filePath] = moduleFile;
    moduleFileCache[filePath] = moduleFile;

    return transpileFile(sys, moduleFileCache, compilerConfig, moduleFile, transpileResults);

  }).then(() => {
    return transpileResults;
  });
}


function transpileFile(sys: StencilSystem, moduleFileCache: ModuleFiles, compilerConfig: CompilerConfig, moduleFile: ModuleFileMeta, transpileResults: TranspileResults) {
  const tsCompilerOptions = createTsCompilerConfigs(compilerConfig);

  const tsHost: ts.CompilerHost = {
    getSourceFile: (filePath) => ts.createSourceFile(filePath, moduleFile.srcText, ts.ScriptTarget.ES2015),
    getDefaultLibFileName: () => 'lib.d.ts',
    getCurrentDirectory: () => '',
    getDirectories: () => [],
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',

    fileExists: (filePath) => {
      return !!filePath;
    },

    readFile: (filePath) => {
      let moduleFile = moduleFileCache[filePath];

      if (!moduleFile) {
        // file not in-memory yet
        moduleFile = {
          filePath: filePath,
          fileName: sys.path.basename(filePath),
          // sync file read required :(
          srcText: sys.fs.readFileSync(filePath, 'utf-8')
        };

        transpileResults.moduleFiles[filePath] = moduleFile;
        moduleFileCache[filePath] = moduleFile;
      }

      return moduleFile.srcText;
    },

    writeFile: (jsFilePath: string, jsText: string, writeByteOrderMark: boolean, onError: any, sourceFiles: ts.SourceFile[]): void => {
      sourceFiles.forEach(tsSourceFile => {
        const moduleFile = transpileResults.moduleFiles[tsSourceFile.fileName];
        if (moduleFile) {
          moduleFile.jsFilePath = jsFilePath;
          moduleFile.jsText = jsText;
        }
      });
      writeByteOrderMark; onError;
    }
  };

  const program = ts.createProgram([moduleFile.filePath], tsCompilerOptions, tsHost);

  const result = program.emit(undefined, tsHost.writeFile, undefined, false, {
    before: [
      componentClass(transpileResults.moduleFiles, transpileResults.diagnostics),
      removeImports(),
      updateLifecycleMethods()
    ],
    after: [
      jsxToVNode(transpileResults.moduleFiles)
    ]
  });

  result.diagnostics.forEach(d => {
    const diagnostic: Diagnostic = {
      msg: d.messageText.toString(),
      type: 'error',
      filePath: d.file && d.file.fileName,
      start: d.start,
      length: d.length,
      category: d.category,
      code: d.code
    };
    transpileResults.diagnostics.push(diagnostic);
  });

  // return Promise.all(processCssModulesFiles.map(moduleFile => {
  //   return processIncludedStyles(sys, logger, compilerConfig, moduleFile, compileResults);
  // }));
}


export function processIncludedStyles(sys: StencilSystem, logger: Logger, compilerConfig: CompilerConfig, moduleFile: ModuleFileMeta, compileResults: CompileResults) {
  if (!moduleFile.cmpMeta || !moduleFile.cmpMeta.styleMeta) {
    return Promise.resolve(null);
  }

  const destDir = compilerConfig.compilerOptions.outDir;

  logger.debug(`compile, processStyles, destDir ${destDir}`);

  const promises: Promise<any>[] = [];
  compileResults.includedSassFiles = compileResults.includedSassFiles || [];

  const modeNames = Object.keys(moduleFile.cmpMeta.styleMeta);
  modeNames.forEach(modeName => {
    const modeMeta = Object.assign({}, moduleFile.cmpMeta.styleMeta[modeName]);

    if (modeMeta.styleUrls) {
      modeMeta.styleUrls.forEach(styleUrl => {
        const scssFileName = sys.path.basename(styleUrl);
        const scssFilePath = sys.path.join(sys.path.dirname(moduleFile.filePath), scssFileName);
        promises.push(
          getIncludedSassFiles(sys, logger, compileResults, scssFilePath)
        );
      });
    }

  });

  return Promise.all(promises);
}


function getIncludedSassFiles(sys: StencilSystem, logger: Logger, compileResults: CompileResults, scssFilePath: string) {
  return new Promise(resolve => {

    const sassConfig = {
      file: scssFilePath,
      outFile: `${scssFilePath}.tmp`
    };

    compileResults.includedSassFiles = compileResults.includedSassFiles || [];

    if (compileResults.includedSassFiles.indexOf(scssFilePath) === -1) {
      compileResults.includedSassFiles.push(scssFilePath);
    }

    logger.debug(`compile, getIncludedSassFiles: ${scssFilePath}`);

    sys.sass.render(sassConfig, (err, result) => {
      if (err) {
        compileResults.diagnostics = compileResults.diagnostics || [];
        compileResults.diagnostics.push({
          msg: err,
          type: 'error'
        });

      } else if (result.stats) {
        result.stats.includedFiles.forEach((includedFile: string) => {
          if (compileResults.includedSassFiles.indexOf(includedFile) === -1) {
            compileResults.includedSassFiles.push(includedFile);
          }
        });
      }

      // always resolve
      resolve();
    });

  });
}


function createTsCompilerConfigs(compilerConfig: CompilerConfig) {
  const tsCompilerOptions: ts.CompilerOptions = Object.assign({}, (<any>compilerConfig.compilerOptions));

  tsCompilerOptions.noImplicitUseStrict = true;
  tsCompilerOptions.moduleResolution = ts.ModuleResolutionKind.NodeJs;
  tsCompilerOptions.module = ts.ModuleKind.ES2015;
  tsCompilerOptions.target = getTsScriptTarget(compilerConfig.compilerOptions.target);
  tsCompilerOptions.isolatedModules = true;
  tsCompilerOptions.allowSyntheticDefaultImports = true;
  tsCompilerOptions.allowJs = true;
  tsCompilerOptions.jsx = ts.JsxEmit.React;
  tsCompilerOptions.jsxFactory = 'h';

  tsCompilerOptions.lib = tsCompilerOptions.lib || [];
  if (!tsCompilerOptions.lib.indexOf('lib.dom.d.ts')) {
    tsCompilerOptions.lib.push('lib.dom.d.ts');
  }
  if (!tsCompilerOptions.lib.indexOf('lib.es2015.d.ts')) {
    tsCompilerOptions.lib.push('lib.es2015.d.ts');
  }
  if (!tsCompilerOptions.lib.indexOf('lib.es5.d.ts')) {
    tsCompilerOptions.lib.push('lib.es5.d.ts');
  }

  return tsCompilerOptions;
}


export function getTsScriptTarget(str: 'es5' | 'es2015') {
  if (str === 'es2015') {
    return ts.ScriptTarget.ES2015;
  }

  return ts.ScriptTarget.ES5;
}
