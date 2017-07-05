import { BuildConfig } from './interfaces';
import { normalizeBuildConfig } from './build';


export function init(buildConfig: BuildConfig) {
  normalizeBuildConfig(buildConfig);

  buildConfig.logger.error(`stencil init, coming soon...`);
}
