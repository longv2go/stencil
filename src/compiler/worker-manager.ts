import { Bundle, BundlerConfig, CompilerConfig, CompileResult, ComponentMeta, Logger,
  ModuleResults, Process, StencilSystem, StylesResults, WorkerBuildContext } from './interfaces';
import { compileFileWorker } from './compile';
import { generateDefineComponentsWorker } from './bundle-modules';
import { generateBundleCssWorker } from './bundle-styles';


export class WorkerManager {
  private workers: Process[] = [];
  private files: Map<string, File> = new Map();
  private tagWorkerIds: Map<string, number> = new Map();
  private roundRobin: number[] = [];
  private numWorkers: number;
  private taskId = 0;
  taskResolves: Map<number, Function> = new Map();
  private mainThreadWorker: Process;
  private mainThreadContext: WorkerBuildContext;


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
            mainReceivedMessageFromWorker(this, msg);
          });

          this.workers.push(worker);
          this.roundRobin.push(0);
        }
      } catch (e) {
        self.logger.error(`error creating worker, ${e}`);
      }

    } else {
      this.logger.debug(`WorkerManager, main process only`);

      this.mainThreadContext = {
        moduleFiles: new Map(),
        styleFiles: new Map()
      };

      this.mainThreadWorker = {
        connected: true,
        kill: () => {},
        on: (event, cb) => {
          event;
          cb();
        },
        pid: 0,
        send: (msg: WorkerMessage) => {
          mainReceivedMessageFromWorker(this, msg);
          return true;
        }
      };

    }

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

  compileFile(compilerConfig: CompilerConfig, filePath: string): Promise<CompileResult> {
    const f = this.getFile(filePath);

    return this.sendTaskToWorker(f.workerId, {
      taskName: 'compileFile',
      config: compilerConfig,
      filePath: f.filePath
    });
  }

  generateBundleCss(bundlerConfig: BundlerConfig, bundleComponentMeta: ComponentMeta[]): Promise<StylesResults> {
    if (!bundleComponentMeta.length) {
      return Promise.resolve({});
    }

    const workerId = this.getStyleBundleWorkerId(bundleComponentMeta);

    return this.sendTaskToWorker(workerId, {
      taskName: 'generateBundleCss',
      config: bundlerConfig,
      bundleComponentMeta: bundleComponentMeta
    });
  }

  generateDefineComponents(bundlerConfig: BundlerConfig, bundleComponentMeta: ComponentMeta[]): Promise<ModuleResults> {
    const workerId = this.getStyleBundleWorkerId(bundleComponentMeta);

    return this.sendTaskToWorker(workerId, {
      taskName: 'generateBundleCss',
      config: bundlerConfig,
      bundleComponentMeta: bundleComponentMeta
    });
  }

  private sendTaskToWorker(workerId: number, msg: WorkerMessage) {
    return new Promise(resolve => {
      msg.taskId = this.taskId++;
      this.taskResolves.set(msg.taskId, resolve);

      let worker = this.workers[workerId];
      if (worker) {
        if (!worker.connected) {
          this.logger.warn(`restarting worker id: ${workerId}`);
          worker.kill('SIGKILL');
          worker = this.workers[workerId] = this.sys.createWorker();
          worker.on('message', (msg: WorkerMessage) => {
            mainReceivedMessageFromWorker(this, msg);
          });
        }
        worker.send(msg);

      } else {
        // main thread
        workerReceivedMessageFromMain(this.sys, this.logger, this.mainThreadContext, this.mainThreadWorker, msg);
      }
    });
  }

  private getFile(filePath: string) {
    filePath = this.normalizeFilePath(filePath);

    let f = this.files.get(filePath);

    if (!f) {
      f = new File();
      f.filePath = filePath;
      f.workerId = this.nextWorkerId();
      this.files.set(filePath, f);
    }

    return f;
  }

  private getStyleBundleWorkerId(bundleComponentMeta: ComponentMeta[]) {
    const tagName = bundleComponentMeta[0].tagNameMeta;
    let workerId = this.tagWorkerIds.get(tagName);

    if (typeof workerId !== 'number') {
      workerId = this.nextWorkerId();
      this.tagWorkerIds.set(tagName, workerId);
    }

    return workerId;
  }

  nextWorkerId() {
    for (var i = 0; i < this.roundRobin.length; i++) {
      this.roundRobin[i] = 0;
    }

    this.files.forEach(f => {
      this.roundRobin[f.workerId]++;
    });

    let workerId = 0;
    let fewest = 999999999;
    for (i = 0; i < this.numWorkers; i++) {
      if (this.roundRobin[i] < fewest) {
        workerId = i;
        fewest = this.roundRobin[i];
      }
    }
    return workerId;
  }

  normalizeFilePath(filePath: string) {
    if (typeof filePath !== 'string') {
      this.logger.error(`StencilFileSystem, ${filePath} is not a string`);
    } else {
      filePath = filePath.trim();
      if (filePath === '') {
        this.logger.error(`StencilFileSystem, ${filePath} is an empty string`);

      } else if (!this.sys.path.isAbsolute(filePath)) {
        this.logger.error(`StencilFileSystem, ${filePath} must be an absolute path`);
      }
    }

    return filePath;
  }
}


function workerReceivedMessageFromMain(sys: StencilSystem, logger: Logger, ctx: WorkerBuildContext, worker: Process, msg: WorkerMessage) {
  try {
    switch (msg.taskName) {
      case 'compileFile':
        compileFileWorker(sys, logger, ctx, msg.config, msg.filePath)
          .then((resolveData: any) => {
            sendMessageFromWorkerToMain(worker, msg.taskId, resolveData);
          });
        break;

      case 'generateBundleCss':
        generateBundleCssWorker(sys, ctx, msg.config, msg.bundleComponentMeta, msg.userBundle)
          .then(resolveData => {
            sendMessageFromWorkerToMain(worker, msg.taskId, resolveData);
          });
        break;

      case 'generateDefineComponents':
        generateDefineComponentsWorker(sys, ctx, msg.config, msg.bundleComponentMeta, msg.userBundle)
          .then(resolveData => {
            sendMessageFromWorkerToMain(worker, msg.taskId, resolveData);
          });
        break;

      default:
        logger.error(`worker message, invalid task name: ${msg.taskName}`);
        break;
    }

  } catch (e) {
    logger.error(`worker message, ${e}`);
  }
}


function mainReceivedMessageFromWorker(workerManager: WorkerManager, msg: WorkerMessage) {
  const taskResolve = workerManager.taskResolves.get(msg.taskId);
  if (taskResolve) {
    taskResolve(msg.resolveData);
    workerManager.taskResolves.delete(msg.taskId);

  } else {
    workerManager.logger.error(`error resolving worker task id: ${msg.taskId}`);
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


export function setupWorkerProcess(sys: StencilSystem, logger: Logger, worker: Process) {
  const ctx: WorkerBuildContext = {
    moduleFiles: new Map(),
    styleFiles: new Map()
  };

  worker.on('message', (msg: WorkerMessage) => {
    workerReceivedMessageFromMain(sys, logger, ctx, worker, msg);
  });
}


class File {
  filePath: string;
  workerId: number;
}


interface WorkerMessage {
  taskId?: number;
  taskName?: 'compileFile'|'generateBundleCss'|'generateDefineComponents';
  config?: any;
  filePath?: string;
  bundleComponentMeta?: ComponentMeta[];
  userBundle?: Bundle;
  resolveData?: any;
  error?: any;
}
