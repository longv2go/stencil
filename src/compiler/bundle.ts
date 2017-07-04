import { ATTR_DASH_CASE, ATTR_LOWER_CASE } from '../util/constants';
import { BundlerConfig, Logger, MainBuildContext, Manifest, Results, StencilSystem } from './interfaces';
// import { bundleModules } from './bundle-modules';
import { bundleStyles } from './bundle-styles';
// import { generateComponentRegistry } from './bundle-registry';


export function bundle(sys: StencilSystem, logger: Logger, bundlerConfig: BundlerConfig, mainCtx: MainBuildContext): Promise<Results> {
  // within MAIN thread
  const timeSpan = logger.createTimeSpan(`bundle started`);

  logger.debug(`bundle, srcDir: ${bundlerConfig.srcDir}`);
  logger.debug(`bundle, destDir: ${bundlerConfig.destDir}`);

  return Promise.resolve().then(() => {
    validateConfig(bundlerConfig);

    const userManifest = validateUserManifest(bundlerConfig.manifest);

sys;
    // kick off style and module bundling at the same time
    return Promise.all([
      bundleStyles(logger, bundlerConfig, mainCtx.workerManager, userManifest),
      // bundleModules(logger, bundlerConfig, mainCtx.workerManager, userManifest)
    ]);

  }).then(bundleResults => {
    // both styles and modules are done bundling
    const styleResults = bundleResults[0];
    if (styleResults.diagnostics && styleResults.diagnostics.length) {
      styleResults.diagnostics.forEach(d => {
        logger[d.level](d.msg);
        d.stack && logger.debug(d.stack);
      });
    }

    // const moduleResults = bundleResults[1];
    // if (moduleResults.diagnostics && moduleResults.diagnostics.length) {
    //   moduleResults.diagnostics.forEach(d => {
    //     logger[d.level](d.msg);
    //     d.stack && logger.debug(d.stack);
    //   });
    // }

    // return generateComponentRegistry(sys, bundlerConfig, styleResults, moduleResults);

  })
  .catch(err => {
    logger.error(err);
    err.stack && logger.debug(err.stack);
  })
  .then(() => {
    timeSpan.finish('bundle, done');

    return mainCtx.results;
  });
}


function validateConfig(config: BundlerConfig) {
  config.attrCase = normalizeAttrCase(config.attrCase);
}


function validateUserManifest(manifest: Manifest) {
  if (!manifest) {
    throw 'config.manifest required';
  }
  if (!manifest.bundles) {
    throw 'config.manifest.bundles required';
  }
  if (!manifest.components) {
    throw 'config.manifest.components required';
  }

  // sort by tag name and ensure they're lower case
  manifest.bundles.forEach(b => {
    b.components = b.components.sort().map(c => c.toLowerCase().trim());
  });
  manifest.components.forEach(c => {
    c.tagNameMeta = c.tagNameMeta.toLowerCase().trim();
  });

  return manifest;
}


function normalizeAttrCase(attrCase: any) {
  if (attrCase === ATTR_LOWER_CASE || attrCase === ATTR_DASH_CASE) {
    // already using a valid attr case value
    return attrCase;
  }

  if (typeof attrCase === 'string') {
    if (attrCase.trim().toLowerCase() === 'dash') {
      return ATTR_DASH_CASE;
    }

    if (attrCase.trim().toLowerCase() === 'lower') {
      return ATTR_LOWER_CASE;
    }
  }

  // default to use dash-case for attributes
  return ATTR_DASH_CASE;
}
