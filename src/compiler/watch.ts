import { BuildConfig } from '../util/interfaces';
import { BuildContext } from './interfaces';
import { build } from './build';
import { isCssSourceFile, isDevFile, isSassSourceFile, isTsSourceFile } from './util';


export function setupWatcher(buildConfig: BuildConfig, ctx: BuildContext) {
  // only create the watcher if this is a watch build
  // and we haven't created a watcher yet
  if (!buildConfig.watch || ctx.watcher) return;

  const logger = buildConfig.logger;
  let queueChange = false;
  let queueRebuild = false;

  ctx.watcher = buildConfig.sys.watch(buildConfig.src, {
    ignored: /(^|[\/\\])\../,
    ignoreInitial: true
  });

  ctx.watcher
    .on('change', (path: string) => {
      logger.debug(`watcher, change: ${path}, ${Date.now()}`);

      if (isDevFile(path)) {
        queueChange = true;
        queue(path);
      }
    })
    .on('add', (path: string) => {
      logger.debug(`watcher, add: ${path}, ${Date.now()}`);

      if (isDevFile(path)) {
        queueRebuild = true;
        queue(path);
      }
    })
    .on('unlink', (path: string) => {
      logger.debug(`watcher, unlink: ${path}, ${Date.now()}`);

      if (isDevFile(path)) {
        queueChange = true;
        queue(path);
      }
    })
    .on('addDir', (path: string) => {
      logger.debug(`watcher, addDir: ${path}, ${Date.now()}`);

      queueRebuild = true;
      queue(null);
    })
    .on('unlinkDir', (path: string) => {
      logger.debug(`watcher, unlinkDir: ${path}, ${Date.now()}`);

      queueRebuild = true;
      queue(null);
    })
    .on('error', (err: any) => {
      logger.error(err);
    });


  let timer: any;
  const changedFiles: string[] = [];

  function queue(path: string) {
    // debounce builds
    clearTimeout(timer);

    if (path !== null && changedFiles.indexOf(path) === -1) {
      changedFiles.push(path);
    }

    timer = setTimeout(() => {
      try {
        const changedFileCopies = changedFiles.slice();
        changedFiles.length = 0;

        if (queueRebuild) {
          watchBuild(buildConfig, ctx, true, changedFileCopies);

        } else if (queueChange) {
          watchBuild(buildConfig, ctx, false, changedFileCopies);
        }

        // reset
        queueRebuild = queueChange = false;

      } catch (e) {
        logger.error(e.toString());
      }

    }, 50);
  }
}


function watchBuild(buildConfig: BuildConfig, ctx: BuildContext, clearAllCache: boolean, changedFiles: string[]) {
  // always reset
  ctx.skipModuleBundles = false;
  ctx.skipStyleBundles = false;

  if (clearAllCache) {
    // empty out the cache entirely
    ctx.moduleFiles = {};

  } else if (changedFiles.length) {
    // empty out specific files

    ctx.skipModuleBundles = !changedFiles.some(isTsSourceFile);
    ctx.skipStyleBundles = !changedFiles.some(f => {
      return isSassSourceFile(f) || isCssSourceFile(f);
    });

    const moduleFileNames = Object.keys(ctx.moduleFiles);

    changedFiles.forEach(changedFile => {
      moduleFileNames.forEach(moduleFileName => {
        const moduleFile = ctx.moduleFiles[moduleFileName];

        if (changedFile === moduleFileName) {
          buildConfig.logger.debug(`removing moduleFileName cache: ${moduleFileName}`);
          delete ctx.moduleFiles[moduleFileName];

        } else if (moduleFile.relatedModuleFiles) {
          moduleFile.relatedModuleFiles.forEach(moduleSourceFile => {
            if (changedFile === moduleSourceFile) {
              buildConfig.logger.debug(`removing moduleSourceFile cache: ${moduleFileName}`);
              delete ctx.moduleFiles[moduleFileName];
            }
          });
        }
      });
    });
  }

  build(buildConfig, ctx);
}

