import { CompilerConfig, Diagnostic, ModuleFiles, ModuleFileMeta, StencilSystem, TranspileResults } from './interfaces';
import { componentClass } from './transformers/component-class';
import { jsxToVNode } from './transformers/jsx-to-vnode';
import { readFile } from './util';
import { removeImports } from './transformers/remove-imports';
import { updateLifecycleMethods } from './transformers/update-lifecycle-methods';
import * as ts from 'typescript';


export function transpileWorker(sys: StencilSystem, moduleFileCache: ModuleFiles, compilerConfig: CompilerConfig, tsFilePath: string) {
  // within WORKER thread
  const transpileResults: TranspileResults = {
    moduleFiles: {},
    diagnostics: []
  };

  return readFile(sys, tsFilePath).then(tsText => {
    const moduleFile: ModuleFileMeta = {
      tsfilePath: tsFilePath,
      tsText: tsText
    };
    transpileResults.moduleFiles[tsFilePath] = moduleFile;
    moduleFileCache[tsFilePath] = moduleFile;

    return transpileFile(sys, moduleFileCache, compilerConfig, moduleFile, transpileResults);

  }).then(() => {
    return transpileResults;
  });
}


function transpileFile(sys: StencilSystem, moduleFileCache: ModuleFiles, compilerConfig: CompilerConfig, moduleFile: ModuleFileMeta, transpileResults: TranspileResults) {
  const tsCompilerOptions = createTsCompilerConfigs(compilerConfig);

  const moduleStylesToProcess: ModuleFileMeta[] = [];

  const tsHost: ts.CompilerHost = {
    getSourceFile: (filePath) => ts.createSourceFile(filePath, moduleFile.tsText, ts.ScriptTarget.ES2015),
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
          tsfilePath: filePath,
          // sync file read required :(
          tsText: sys.fs.readFileSync(filePath, 'utf-8')
        };

        transpileResults.moduleFiles[filePath] = moduleFile;
        moduleFileCache[filePath] = moduleFile;
      }

      return moduleFile.tsText;
    },

    writeFile: (jsFilePath: string, jsText: string, writeByteOrderMark: boolean, onError: any, sourceFiles: ts.SourceFile[]): void => {
      sourceFiles.forEach(tsSourceFile => {
        const moduleFile = transpileResults.moduleFiles[tsSourceFile.fileName];
        if (moduleFile) {
          moduleFile.jsFilePath = jsFilePath;
          moduleFile.jsText = jsText;
          moduleStylesToProcess.push(moduleFile);
        }
      });
      writeByteOrderMark; onError;
    }
  };

  const program = ts.createProgram([moduleFile.tsfilePath], tsCompilerOptions, tsHost);

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

  return Promise.all(moduleStylesToProcess.map(moduleFile => {
    return processIncludedStyles(sys, transpileResults.diagnostics, moduleFile);
  }));
}


function processIncludedStyles(sys: StencilSystem, diagnostics: Diagnostic[], moduleFile: ModuleFileMeta) {
  if (!moduleFile.cmpMeta || !moduleFile.cmpMeta.styleMeta) {
    return Promise.resolve([]);
  }

  const promises: Promise<any>[] = [];

  const modeNames = Object.keys(moduleFile.cmpMeta.styleMeta);
  modeNames.forEach(modeName => {
    const modeMeta = Object.assign({}, moduleFile.cmpMeta.styleMeta[modeName]);

    if (modeMeta.styleUrls) {
      modeMeta.styleUrls.forEach(styleUrl => {
        const ext = sys.path.extname(styleUrl).toLowerCase();

        if (ext === '.scss' || ext === '.sass') {
          const scssFileName = sys.path.basename(styleUrl);
          const scssFilePath = sys.path.join(sys.path.dirname(moduleFile.tsfilePath), scssFileName);
          promises.push(
            getIncludedSassFiles(sys, diagnostics, moduleFile, scssFilePath)
          );
        }
      });
    }

  });

  return Promise.all(promises);
}


function getIncludedSassFiles(sys: StencilSystem, diagnostics: Diagnostic[], moduleFile: ModuleFileMeta, scssFilePath: string) {
  return new Promise(resolve => {

    const sassConfig = {
      file: scssFilePath
    };

    moduleFile.includedSassFiles = moduleFile.includedSassFiles || [];

    if (moduleFile.includedSassFiles.indexOf(scssFilePath) === -1) {
      moduleFile.includedSassFiles.push(scssFilePath);
    }

    sys.sass.render(sassConfig, (err, result) => {
      if (err) {
        diagnostics.push({
          msg: err.message,
          filePath: err.file,
          type: 'error'
        });

      } else if (result.stats && result.stats.includedFiles) {
        result.stats.includedFiles.forEach((includedFile: string) => {
          if (moduleFile.includedSassFiles.indexOf(includedFile) === -1) {
            moduleFile.includedSassFiles.push(includedFile);
          }
        });
      }

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
