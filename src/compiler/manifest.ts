import { CompileResults, Collection, ComponentMeta, CompilerConfig, FilesToWrite,
  Logger, Manifest, Bundle, StencilSystem, StyleMeta } from './interfaces';
import { readFile } from './util';
import { resolveFrom } from './resolve-from';


export function generateManifest(sys: StencilSystem, logger: Logger, compilerConfig: CompilerConfig, compileResults: CompileResults, filesToWrite: FilesToWrite) {
  const manifest: Manifest = {
    components: [],
    bundles: []
  };

  const destDir = compilerConfig.collectionDir;

  logger.debug(`manifest, generateManifest, destDir: ${destDir}`);

  // normalize bundle component tags
  compilerConfig.bundles.forEach(b => {
    if (Array.isArray(b.components)) {
      b.components = b.components.map(c => c.toLowerCase().trim());
      return;
    }

    logger.error(`manifest, generateManifest: missing bundle components array, instead received: ${b.components}`);

    b.components = [];
  });

  const fileNames = Object.keys(compileResults.moduleFiles);

  fileNames.forEach(fileName => {
    const f = compileResults.moduleFiles[fileName];

    if (!f.cmpMeta || !f.cmpMeta.tagNameMeta) return;

    let includeComponent = false;
    for (var i = 0; i < compilerConfig.bundles.length; i++) {
      if (compilerConfig.bundles[i].components.indexOf(f.cmpMeta.tagNameMeta) > -1) {
        includeComponent = true;
        break;
      }
    }

    if (!includeComponent) return;

    const cmpMeta: ComponentMeta = Object.assign({}, <any>f.cmpMeta);

    cmpMeta.componentClass = f.cmpClassName;
    cmpMeta.componentUrl = f.jsFilePath.replace(destDir + sys.path.sep, '');

    const componentDir = sys.path.dirname(cmpMeta.componentUrl);

    if (cmpMeta.styleMeta) {
      const modeNames = Object.keys(cmpMeta.styleMeta);

      modeNames.forEach(modeName => {
        const cmpMode = cmpMeta.styleMeta[modeName];
        if (cmpMode.styleUrls) {
          cmpMode.styleUrls = cmpMode.styleUrls.map(styleUrl => {
            return sys.path.join(componentDir, styleUrl);
          });
        }
      });
    }

    if (!cmpMeta.listenersMeta.length) {
      delete cmpMeta.listenersMeta;
    }

    if (!cmpMeta.methodsMeta.length) {
      delete cmpMeta.methodsMeta;
    }

    if (!cmpMeta.propsMeta.length) {
      delete cmpMeta.propsMeta;
    }

    if (!cmpMeta.propWillChangeMeta.length) {
      delete cmpMeta.propWillChangeMeta;
    }

    if (!cmpMeta.propDidChangeMeta.length) {
      delete cmpMeta.propDidChangeMeta;
    }

    // place property at the bottom
    const slotMeta = cmpMeta.slotMeta;
    delete cmpMeta.slotMeta;
    cmpMeta.slotMeta = slotMeta;

    const shadow = cmpMeta.isShadowMeta;
    delete cmpMeta.isShadowMeta;
    cmpMeta.isShadowMeta = shadow;

    manifest.components.push(cmpMeta);
  });

  manifest.bundles = (compilerConfig.bundles && compilerConfig.bundles.slice()) || [];

  manifest.bundles = manifest.bundles.sort((a, b) => {
    if (a.components && a.components.length && b.components && b.components.length) {
      if (a.components[0].toLowerCase() < b.components[0].toLowerCase()) return -1;
      if (a.components[0].toLowerCase() > b.components[0].toLowerCase()) return 1;
    }
    return 0;
  });

  manifest.components = manifest.components.sort((a, b) => {
    if (a.tagNameMeta.toLowerCase() < b.tagNameMeta.toLowerCase()) return -1;
    if (a.tagNameMeta.toLowerCase() > b.tagNameMeta.toLowerCase()) return 1;
    return 0;
  });

  const manifestFilePath = sys.path.join(compilerConfig.collectionDir, MANIFEST_FILE_NAME);
  const manifestJson = JSON.stringify(manifest, null, 2);

  logger.debug(`manifest, generateManifest: ${manifestFilePath}`);

  filesToWrite[manifestFilePath] = manifestJson;

  return manifest;
}


export function generateDependentManifests(sys: StencilSystem, logger: Logger, collections: Collection[], rootDir: string, destDir: string) {
  return Promise.all(collections.map(collection => {

    const manifestJsonFile = resolveFrom(sys, rootDir, collection);
    const manifestDir = sys.path.dirname(manifestJsonFile);

    return readFile(sys, manifestJsonFile).then(manifestJsonContent => {
      const manifest: Manifest = JSON.parse(manifestJsonContent);

      return updateManifestUrls(logger, sys, manifest, manifestDir, destDir);
    });

  }));
}


export function updateManifestUrls(logger: Logger, sys: StencilSystem, manifest: Manifest, manifestDir: string, destDir: string): Manifest {
  logger.debug(`manifest, updateManifestUrls, manifestDir: ${manifestDir}`);

  const components = (manifest.components || []).map((comp: ComponentMeta) => {
    const styleMeta = updateStyleUrls(sys, comp.styleMeta, manifestDir, destDir);

    return {
      ...comp,
      styleMeta,
      componentUrl: sys.path.join(manifestDir, comp.componentUrl)
    };
  });

  return {
    ...manifest,
    components
  };
}


function updateStyleUrls(sys: StencilSystem, styleMeta: StyleMeta, manifestDir: string, destDir: string): StyleMeta {
  return Object.keys(styleMeta || {}).reduce((styleData: StyleMeta, styleMode: string) => {
    const style = styleMeta[styleMode];

    const styleUrls = style.styleUrls
      .map((styleUrl: string) => sys.path.relative(destDir, sys.path.join(manifestDir, styleUrl)));

    styleData[styleMode] = {
      ...style,
      styleUrls
    };

    return styleData;
  }, <StyleMeta>{});
}


export function mergeManifests(manifestPriorityList: Manifest[]): Manifest {
  let removedComponents: string[] = [];

  return manifestPriorityList.reduce((allData: Manifest, collectionManifest: Manifest) => {
    const bundles = (collectionManifest.bundles || []).map((bundle: Bundle) => {
        const components = (bundle.components || []).filter(tag => removedComponents.indexOf(tag) === -1);

        components.forEach(tag => removedComponents.push(tag));

        return {
          ...bundle,
          components
        };
      })
      .filter((bundle: Bundle) => bundle.components.length !== 0);

    return {
      components: allData.components.concat(collectionManifest.components),
      bundles: allData.bundles.concat(bundles)
    };
  }, <Manifest>{ components: [], bundles: []});
}


const MANIFEST_FILE_NAME = 'manifest.json';
