import { inlineEnvironmentVariables } from './transformers/inline-environment-variables';
import * as ts from 'typescript';


export function transpile(): Promise<any> {
  const program = ts.createProgram(tsFilePaths, tsCompilerOptions, createCompilerHost());

  if (program.getSyntacticDiagnostics().length > 0) {
    return Promise.reject(program.getSyntacticDiagnostics());
  }

  const result = program.emit(undefined, tsHost.writeFile, undefined, false, {
    before: [
      inlineEnvironmentVariables(),
    ]
  });

  if (result.diagnostics.length > 0) {
    return Promise.reject(result.diagnostics);
  }
}

function createCompilerHost(): ts.CompilerHost {
  return <ts.CompilerHost>{
    getSourceFile: (filePath) => sourcesMap.get(filePath),
    getDefaultLibFileName: () => 'lib.d.ts',
    getCurrentDirectory: () => '',
    getDirectories: () => [],
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',

    fileExists: (filePath) => {
      return ctx.files.has(filePath);
    },

    readFile: (filePath) => {
      let fileMeta = ctx.files.get(filePath);
      if (fileMeta) {
        return fileMeta.srcText;
      }
      fileMeta = createFileMeta(config.packages, ctx, filePath, config.packages.fs.readFileSync(filePath, 'utf-8'));
      fileMeta.recompileOnChange = true;
      return fileMeta.srcText;
    },

    writeFile: (jsFilePath: string, jsText: string, writeByteOrderMark: boolean, onError: any, sourceFiles: ts.SourceFile[]): void => {
      sourceFiles.forEach(s => {
        const fileMeta = ctx.files.get(s.fileName);
        if (fileMeta) {
          fileMeta.recompileOnChange = true;
          fileMeta.jsFilePath = jsFilePath;
          fileMeta.jsText = jsText;
        }
      });

      if (jsText && jsText.trim().length) {
        outputs.set(jsFilePath, jsText);
      }

      writeByteOrderMark; onError;
    }
  };
}
