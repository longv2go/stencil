import { BuildConfig } from '../../util/interfaces';
import { CORE_NAME } from '../../util/constants';
import { generatePreamble } from '../util';


export function generateCore(config: BuildConfig, globalJsContent: string[], publicPath: string) {
  let staticName = CORE_NAME;
  if (config.devMode) {
    staticName += '.dev';
  }
  staticName += '.js';

  return config.sys.getClientCoreFile({ staticName: staticName }).then(coreContent => {
    // concat the projects core code
    const jsContent = [
      globalJsContent.join('\n'),
      coreContent
    ].join('\n').trim();

    return wrapCoreJs(config, jsContent, publicPath);
  });
}


export function generateCoreEs5(config: BuildConfig, globalJsContent: string[], publicPath: string) {
  let staticName = CORE_NAME + '.es5';
  if (config.devMode) {
    staticName += '.dev';
  }
  staticName += '.js';

  const documentRegistryPolyfill = config.sys.path.join('polyfills', 'document-register-element.js');

  return Promise.all([
    config.sys.getClientCoreFile({ staticName: staticName }),
    config.sys.getClientCoreFile({ staticName: documentRegistryPolyfill })

  ]).then(results => {
    const coreContent = results[0];
    const docRegistryPolyfillContent = results[1];

    // replace the default core with the project's namespace
    // concat the custom element polyfill and projects core code
    const jsContent = [
      docRegistryPolyfillContent + '\n\n',
      generatePreamble(config),
      globalJsContent.join('\n'),
      coreContent
    ].join('\n').trim();

    return wrapCoreJs(config, jsContent, publicPath);
  });
}


function wrapCoreJs(config: BuildConfig, jsContent: string, publicPath: string) {
  let output = [
    generatePreamble(config),
    `(function(coreGlobal,projectNamespace,publicPath){`,
    `"use strict";\n`,
    jsContent.trim(),
    `\n})({},"${config.namespace}","${publicPath}/");`
  ].join('');

  return output;
}
