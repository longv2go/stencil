import { BuildConfig, Bundle, BundlerConfig, CompilerConfig, CompileResults, ComponentMeta,
  Logger, ModuleFiles, ModuleResults, Process, StencilSystem, StylesResults } from './interfaces';
import { compileFileWorker } from './compile';
import { generateDefineComponentsWorker } from './bundle-modules';
import { generateBundleCssWorker } from './bundle-styles';
import { normalizeBuildConfig } from './build';


export class WorkerManager {
  private workers: Process[] = [];
  private roundRobin: number = 0;
  private numWorkers: number;
  private taskId = 0;
  private taskResolves: Map<number, Function> = new Map();
  private mainThreadWorker: Process;
  private mainThreadModuleFilesCache: ModuleFiles = {};

  constructor(private sys: StencilSystem, public logger: Logger) {}

  connect(numWorkers: number) {
    const self = this;
    this.numWorkers = numWorkers;

    if (numWorkers > 0) {
      this.logger.debug(`WorkerManager, connecting ${this.numWorkers} worker(s)...`);

      try {
        for (var i = 0; i < this.numWorkers; i++) {
          var worker = this.sys.createWorker();
          worker.on('message', (msg: WorkerMessage) => {
            mainReceivedMessageFromWorker(this.logger, this.taskResolves, msg);
          });

          this.workers.push(worker);
        }
      } catch (e) {
        self.logger.error(`error creating worker, ${e}`);
      }

    } else {
      this.logger.debug(`WorkerManager, main process only`);
    }

    // used mainly as a backup
    this.mainThreadWorker = {
      connected: true,
      kill: () => {},
      on: (event, cb) => {
        event;
        cb();
      },
      pid: 0,
      send: (msg: WorkerMessage) => {
        mainReceivedMessageFromWorker(this.logger, this.taskResolves, msg);
        return true;
      }
    };
  }

  disconnect() {
    if (this.workers.length) {
      this.logger.debug(`WorkerManager, disconnecting ${this.workers.length} workers...`);

      let worker: Process;
      while (worker = this.workers.pop()) {
        worker.kill('SIGKILL');
      }
    }
  }

  compileFile(compilerConfig: CompilerConfig, filePath: string): Promise<CompileResults> {
    return this.sendTaskToWorker(this.nextWorkerId(), {
      taskName: 'compileFile',
      compilerConfig: compilerConfig,
      filePath: filePath

    }).then((compileResults: CompileResults) => {

      return this.updateWorkerModuleFiles(compileResults.workerId, compileResults.moduleFiles).then(() => {
        return compileResults;
      });

    });
  }

  updateWorkerModuleFiles(fromWorkerId: number, moduleFiles: ModuleFiles) {
    const promises: Promise<any>[] = [];

    for (var workerId = 0; workerId < this.workers.length; workerId++) {
      if (workerId !== fromWorkerId) {
        promises.push(
          this.sendTaskToWorker(workerId, {
            taskName: 'updateModuleFiles',
            moduleFiles: moduleFiles
          })
        );
      }
    }

    return Promise.all(promises);
  }

  generateBundleCss(bundlerConfig: BundlerConfig, bundleComponentMeta: ComponentMeta[], userBundle: Bundle): Promise<StylesResults> {
    return this.sendTaskToWorker(this.nextWorkerId(), {
      taskName: 'generateBundleCss',
      bundlerConfig: bundlerConfig,
      bundleComponentMeta: bundleComponentMeta,
      userBundle: userBundle
    });
  }

  generateDefineComponents(bundlerConfig: BundlerConfig, bundleComponentMeta: ComponentMeta[]): Promise<ModuleResults> {
    return this.sendTaskToWorker(this.nextWorkerId(), {
      taskName: 'generateDefineComponents',
      bundlerConfig: bundlerConfig,
      bundleComponentMeta: bundleComponentMeta
    });
  }

  private sendTaskToWorker(workerId: number, msg: WorkerMessage): Promise<any> {
    return new Promise(resolve => {
      msg.taskId = this.taskId++;
      this.taskResolves.set(msg.taskId, resolve);

      msg.workerId = workerId;
      let worker = this.workers[msg.workerId];
      if (worker && worker.connected && worker.send(msg)) {
        // all good, message sent to worker
        return;
      }

      // main thread fallback
      workerReceivedMessageFromMain(this.sys, this.logger, this.mainThreadWorker, this.mainThreadModuleFilesCache, msg);
    });
  }

  nextWorkerId() {
    let nextId = ++this.roundRobin;
    if (nextId >= this.workers.length) {
      nextId = 0;
    }
    return nextId;
  }

}


function workerReceivedMessageFromMain(sys: StencilSystem, logger: Logger, worker: Process, moduleFileCache: ModuleFiles, msg: WorkerMessage) {
  try {

    switch (msg.taskName) {

      case 'compileFile':
        compileFileWorker(msg.workerId, sys, moduleFileCache, msg.compilerConfig, msg.filePath)
          .then((resolveData: any) => {
            sendMessageFromWorkerToMain(worker, msg.taskId, resolveData);
          });
        break;

      case 'generateBundleCss':
        generateBundleCssWorker(sys, msg.bundlerConfig, msg.bundleComponentMeta, msg.userBundle)
          .then(resolveData => {
            sendMessageFromWorkerToMain(worker, msg.taskId, resolveData);
          });
        break;

      case 'generateDefineComponents':
        generateDefineComponentsWorker(sys, msg.bundlerConfig, moduleFileCache, msg.bundleComponentMeta, msg.userBundle)
          .then(resolveData => {
            sendMessageFromWorkerToMain(worker, msg.taskId, resolveData);
          });
        break;

      case 'updateModuleFiles':
        const cachedFiles = updateModuleFiles(msg.moduleFiles, moduleFileCache);
        sendMessageFromWorkerToMain(worker, msg.taskId, cachedFiles);
        break;

      default:
        logger.error(`worker message, invalid task name: ${msg.taskName}`);
        break;
    }

  } catch (e) {
    logger.error(`workerReceivedMessageFromMain, ${e}`);
  }
}


function updateModuleFiles(updatedModuleFiles: ModuleFiles, moduleFileCache: ModuleFiles) {
  Object.assign(moduleFileCache, updatedModuleFiles);

  Object.keys(moduleFileCache).forEach(fileName => {
    if (!moduleFileCache[fileName]) {
      delete moduleFileCache[fileName];
    }
  });

  return Object.keys(moduleFileCache).length;
}


function mainReceivedMessageFromWorker(logger: Logger, taskResolves: Map<number, Function>, msg: WorkerMessage) {
  const taskResolve = taskResolves.get(msg.taskId);
  if (taskResolve) {
    taskResolve(msg.resolveData);
    taskResolves.delete(msg.taskId);

  } else {
    logger.error(`error resolving worker task id: ${msg.taskId}`);
  }
}


function sendMessageFromWorkerToMain(worker: Process, taskId: number, resolveData: any) {
  const msg: WorkerMessage = {
    taskId: taskId,
    resolveData: resolveData
  };

  // send message from worker to the main thread
  // ends up calling "mainReceivedMessageFromWorker()"
  worker.send(msg);
}


export function setupWorkerProcess(buildConfig: BuildConfig) {
  normalizeBuildConfig(buildConfig);

  const moduleFileCache: ModuleFiles = {};
  const sys = buildConfig.sys;
  const logger = buildConfig.logger;
  const worker = buildConfig.process;

  worker.on('message', (msg: WorkerMessage) => {
    workerReceivedMessageFromMain(sys, logger, worker, moduleFileCache, msg);
  });
}


interface WorkerMessage {
  taskId?: number;
  workerId?: number;
  taskName?: 'compileFile'|'generateBundleCss'|'generateDefineComponents'|'updateModuleFiles';
  moduleFiles?: ModuleFiles;
  bundlerConfig?: BundlerConfig;
  compilerConfig?: CompilerConfig;
  filePath?: string;
  bundleComponentMeta?: ComponentMeta[];
  userBundle?: Bundle;
  resolveData?: any;
  error?: any;
}
