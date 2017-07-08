import { BuildConfig, BuildContext, Diagnostic, ModuleFileMeta, StencilSystem, TranspileResults } from './interfaces';
import { componentClass } from './transformers/component-class';
import { isSassSourceFile, readFile } from './util';
import { jsxToVNode } from './transformers/jsx-to-vnode';
import { removeImports } from './transformers/remove-imports';
import { updateLifecycleMethods } from './transformers/update-lifecycle-methods';
import * as ts from 'typescript';


export function transpile(buildConfig: BuildConfig, ctx: BuildContext, tsFilePath: string) {
  // within WORKER thread
  const transpileResults: TranspileResults = {
    moduleFiles: {},
    diagnostics: []
  };

  return getModuleFile(buildConfig, ctx, tsFilePath).then(moduleFile => {
    if (typeof moduleFile.jsText === 'string') {
      // already transpiled
      transpileResults.moduleFiles[tsFilePath] = moduleFile;
      return Promise.resolve();
    }

    return transpileFile(buildConfig, ctx, moduleFile, transpileResults).then(() => {
      transpileResults.moduleFiles[tsFilePath] = moduleFile;
    });

  }).catch(err => {
    transpileResults.diagnostics.push({
      msg: err,
      type: 'error',
      stack: err.stack
    });

  }).then(() => {
    return transpileResults;
  });
}


function transpileFile(buildConfig: BuildConfig, ctx: BuildContext, moduleFile: ModuleFileMeta, transpileResults: TranspileResults) {
  const sys = buildConfig.sys;
  const tsCompilerOptions = createTsCompilerConfigs(buildConfig);
  const moduleStylesToProcess: ModuleFileMeta[] = [];

  const tsHost: ts.CompilerHost = {
    getSourceFile: (filePath) => {
      return ts.createSourceFile(filePath, moduleFile.tsText, ts.ScriptTarget.ES2015);
    },
    getDefaultLibFileName: () => 'lib.d.ts',
    getCurrentDirectory: () => '',
    getDirectories: () => [],
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => false,
    getNewLine: () => '\n',

    fileExists: (filePath) => {
      return filePath === moduleFile.tsFilePath;
    },

    readFile: (tsFilePath) => {
      let moduleFile = ctx.moduleFiles[tsFilePath];
      if (!moduleFile) {
        // file not in-memory yet
        moduleFile = {
          tsFilePath: tsFilePath,
          // sync file read required :(
          tsText: sys.fs.readFileSync(tsFilePath, 'utf-8')
        };

        ctx.moduleFiles[tsFilePath] = moduleFile;
      }

      return moduleFile.tsText;
    },

    writeFile: (jsFilePath: string, jsText: string, writeByteOrderMark: boolean, onError: any, sourceFiles: ts.SourceFile[]): void => {
      sourceFiles.forEach(sourceFile => {
        const tsSourceFilePath = sourceFile.fileName;
        let moduleFile = ctx.moduleFiles[tsSourceFilePath];

        if (moduleFile) {
          moduleFile.jsFilePath = jsFilePath;
          moduleFile.jsText = jsText;

        } else {
          moduleFile = ctx.moduleFiles[tsSourceFilePath] = {
            tsFilePath: tsSourceFilePath,
            jsFilePath: jsFilePath,
            jsText: jsText
          };
        }
        moduleFile.relatedModuleFiles = sourceFiles.map(sf => sf.fileName);

        transpileResults.moduleFiles[tsSourceFilePath] = moduleFile;

        moduleStylesToProcess.push(moduleFile);
      });
      writeByteOrderMark; onError;
    }
  };

  const program = ts.createProgram([moduleFile.tsFilePath], tsCompilerOptions, tsHost);

  const result = program.emit(undefined, tsHost.writeFile, undefined, false, {
    before: [
      componentClass(ctx.moduleFiles, transpileResults.diagnostics),
      removeImports(),
      updateLifecycleMethods()
    ],
    after: [
      jsxToVNode(ctx.moduleFiles)
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
    const modeMeta = moduleFile.cmpMeta.styleMeta[modeName];

    if (modeMeta.styleUrls) {
      modeMeta.styleUrls.forEach(styleUrl => {
        if (isSassSourceFile(styleUrl)) {
          const scssFileName = sys.path.basename(styleUrl);
          const scssFilePath = sys.path.join(sys.path.dirname(moduleFile.tsFilePath), scssFileName);
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


function createTsCompilerConfigs(buildConfig: BuildConfig) {
  // create defaults
  const tsCompilerOptions: ts.CompilerOptions = {
    allowJs: true,

    // Filename can be non-ts file.
    allowNonTsExtensions: true,

    allowSyntheticDefaultImports: true,
    isolatedModules: true,
    jsx: ts.JsxEmit.React,
    jsxFactory: 'h',
    lib: [
      'lib.dom.d.ts',
      'lib.es2015.d.ts',
      'lib.es5.d.ts'
    ],
    module: ts.ModuleKind.ES2015,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    noImplicitUseStrict: true,

    // transpileModule does not write anything to disk so there is no need to verify that there are no conflicts between input and output paths.
    suppressOutputPathCheck: true,

    target: ts.ScriptTarget.ES5,
  };

  // add custom values
  tsCompilerOptions.outDir = buildConfig.collectionDest;
  tsCompilerOptions.rootDir = buildConfig.src;

  return tsCompilerOptions;
}


function getModuleFile(buildConfig: BuildConfig, ctx: BuildContext, tsFilePath: string) {
  let moduleFile = ctx.moduleFiles[tsFilePath];
  if (moduleFile) {
    return Promise.resolve(moduleFile);
  }

  return readFile(buildConfig.sys, tsFilePath).then(tsText => {
    moduleFile = ctx.moduleFiles[tsFilePath] = {
      tsFilePath: tsFilePath,
      tsText: tsText
    };

    return moduleFile;
  });
}
