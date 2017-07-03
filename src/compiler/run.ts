import { build } from './build';
import { collection } from './collection';
import { BuildConfig, TaskOptions } from './interfaces';
import { setupWorkerProcess } from './worker-manager';


export function run(taskName: string, opts: TaskOptions) {
  const rootDir = opts.rootDir;
  const sys = opts.sys;
  const stencilConfig = opts.stencilConfig;

  const compiledDir = sys.path.join(rootDir, 'tmp');

  const namespace = stencilConfig.namespace;
  const srcDir = sys.path.join(rootDir, stencilConfig.src ? stencilConfig.src : 'src');
  const destDir = sys.path.join(rootDir, stencilConfig.dest ? stencilConfig.dest : 'dist');
  const bundles = stencilConfig.bundles;
  const collections = stencilConfig.collections;
  const preamble = stencilConfig.preamble;

  const buildConfig: BuildConfig = {
    sys: sys,
    logger: opts.logger,
    isDevMode: opts.isDevMode,
    isWatch: opts.isWatch,
    process: opts.process,
    numWorkers: opts.numWorkers,
    preamble,
    rootDir: rootDir,
    compiledDir,
    namespace,
    srcDir,
    destDir,
    bundles,
    collections
  };

  switch (taskName) {
    case 'build':
      build(buildConfig);
      break;

    case 'collection':
      collection(buildConfig);
      break;

    case 'worker':
      setupWorkerProcess(buildConfig.sys, buildConfig.logger, buildConfig.process);
      break;

    default:
      buildConfig.logger.error(`Invalid stencil command: "${taskName}". Valid commands: build, collection`);
      break;
  }
}
