import { build, normalizeBuildConfig } from './build';
import { BuildConfig } from './interfaces';
import { setupWorkerProcess } from './worker-manager';


export function run(taskName: string, buildConfig: BuildConfig) {

  normalizeBuildConfig(buildConfig);

  switch (taskName) {
    case 'build':
      build(buildConfig);
      break;

    case 'worker':
      setupWorkerProcess(buildConfig.sys, buildConfig.logger, buildConfig.process);
      break;

    default:
      buildConfig.logger.error(`Invalid stencil command: "${taskName}"`);
      break;
  }
}
