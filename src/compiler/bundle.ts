import { ATTR_DASH_CASE, ATTR_LOWER_CASE } from '../util/constants';
import { bundleModules } from './bundle-modules';
import { BundleResults, BundlerConfig, Logger, Manifest, StencilSystem } from './interfaces';
import { bundleStyles } from './bundle-styles';
import { generateComponentRegistry } from './bundle-registry';
import { WorkerManager } from './worker-manager';


export function bundle(sys: StencilSystem, logger: Logger, bundlerConfig: BundlerConfig, workerManager: WorkerManager) {
  // within MAIN thread
  const timeSpan = logger.createTimeSpan(`bundle started`);

  const bundleResults: BundleResults = {
    filesToWrite: {},
    diagnostics: [],
    componentRegistry: []
  };

  logger.debug(`bundle, include: ${bundlerConfig.include}`);
  logger.debug(`bundle, outDir: ${bundlerConfig.outDir}`);

  return Promise.resolve().then(() => {
    validateConfig(bundlerConfig);

    const userManifest = validateUserManifest(bundlerConfig.manifest);

    // kick off style and module bundling at the same time
    return Promise.all([
      bundleStyles(logger, bundlerConfig, workerManager, userManifest),
      bundleModules(logger, bundlerConfig, workerManager, userManifest)
    ]);

  }).then(results => {
    // both styles and modules are done bundling
    const styleResults = results[0];
    if (styleResults.diagnostics) {
      bundleResults.diagnostics = bundleResults.diagnostics.concat(styleResults.diagnostics);
    }
    if (styleResults.filesToWrite) {
      Object.assign(bundleResults.filesToWrite, styleResults.filesToWrite);
    }

    const moduleResults = results[1];
    if (moduleResults.diagnostics && moduleResults.diagnostics.length) {
      bundleResults.diagnostics = bundleResults.diagnostics.concat(moduleResults.diagnostics);
    }
    if (moduleResults.filesToWrite) {
      Object.assign(bundleResults.filesToWrite, moduleResults.filesToWrite);
    }

    bundleResults.componentRegistry = generateComponentRegistry(sys, bundlerConfig, styleResults, moduleResults, bundleResults.filesToWrite);

  })
  .catch(err => {
    bundleResults.diagnostics.push({
      msg: err.toString(),
      type: 'error',
      stack: err.stack
    });

  })
  .then(() => {
    timeSpan.finish('bundle, done');
    return bundleResults;
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
