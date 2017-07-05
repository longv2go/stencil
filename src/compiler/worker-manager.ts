import { Bundle, BundlerConfig, CompilerConfig, CompileResults, ComponentMeta,
  Logger, ModuleResults, Process, StencilSystem, StylesResults } from './interfaces';
import { compileFileWorker } from './compile';
import { generateDefineComponentsWorker } from './bundle-modules';
import { generateBundleCssWorker } from './bundle-styles';


export class WorkerManager {
  private workers: Process[] = [];
  private roundRobin: number = 0;
  private numWorkers: number;
  private taskId = 0;
  private taskResolves: Map<number, Function> = new Map();
  private mainThreadWorker: Process;

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
    return this.sendTaskToWorker({
      taskName: 'compileFile',
      config: compilerConfig,
      filePath: filePath
    });
  }

  generateBundleCss(bundlerConfig: BundlerConfig, bundleComponentMeta: ComponentMeta[], userBundle: Bundle): Promise<StylesResults> {
    return this.sendTaskToWorker({
      taskName: 'generateBundleCss',
      config: bundlerConfig,
      bundleComponentMeta: bundleComponentMeta,
      userBundle: userBundle
    });
  }

  generateDefineComponents(bundlerConfig: BundlerConfig, bundleComponentMeta: ComponentMeta[]): Promise<ModuleResults> {
    return this.sendTaskToWorker({
      taskName: 'generateDefineComponents',
      config: bundlerConfig,
      bundleComponentMeta: bundleComponentMeta
    });
  }

  private sendTaskToWorker(msg: WorkerMessage): Promise<any> {
    return new Promise(resolve => {
      msg.taskId = this.taskId++;
      this.taskResolves.set(msg.taskId, resolve);

      let workerId = this.nextWorkerId();
      let worker = this.workers[workerId];
      if (worker) {
        if (!worker.connected) {
          this.logger.warn(`restarting worker id: ${workerId}`);
          worker.kill('SIGKILL');
          worker = this.workers[workerId] = this.sys.createWorker();
          worker.on('message', (msg: WorkerMessage) => {
            mainReceivedMessageFromWorker(this.logger, this.taskResolves, msg);
          });
        }
        if (worker.send(msg)) {
          // all good, message sent to worker
          return;
        }
      }

      // main thread fallback
      workerReceivedMessageFromMain(this.sys, this.logger, this.mainThreadWorker, msg);
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


function workerReceivedMessageFromMain(sys: StencilSystem, logger: Logger, worker: Process, msg: WorkerMessage) {
  try {
    switch (msg.taskName) {
      case 'compileFile':
        compileFileWorker(sys, logger, msg.config, msg.filePath)
          .then((resolveData: any) => {
            sendMessageFromWorkerToMain(worker, msg.taskId, resolveData);
          });
        break;

      case 'generateBundleCss':
        generateBundleCssWorker(sys, msg.config, msg.bundleComponentMeta, msg.userBundle)
          .then(resolveData => {
            sendMessageFromWorkerToMain(worker, msg.taskId, resolveData);
          });
        break;

      case 'generateDefineComponents':
        generateDefineComponentsWorker(sys, msg.config, msg.bundleComponentMeta, msg.userBundle)
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


export function setupWorkerProcess(sys: StencilSystem, logger: Logger, worker: Process) {
  worker.on('message', (msg: WorkerMessage) => {
    workerReceivedMessageFromMain(sys, logger, worker, msg);
  });
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
