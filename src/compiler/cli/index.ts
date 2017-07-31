import { BuildConfig, StencilSystem } from '../../util/interfaces';
import { Chalk } from 'chalk';
import { CommandLineLogger } from './cli-logger';
import { help } from './help';
import * as fs from 'fs';
import * as path from 'path';


export function run(process: Process, sys: StencilSystem, chalk: Chalk, stencil: { build: (config: BuildConfig) => void }) {
  const cmdArgs = loadCommandLineArgs(process);
  const config = loadConfig(process, chalk, cmdArgs);
  config.sys = sys;

  loadOptions(cmdArgs, config);

  switch (cmdArgs[2]) {
    case 'build':
      stencil.build(config);

      if (config.watch) {
        process.once('SIGINT', () => {
          process.exit(0);
        });
      }
      break;

    default:
      help();
      process.exit(1);
  }
}


export function loadCommandLineArgs(process: Process) {
  let cmdArgs = process.argv;

  try {
    var npmRunArgs = process.env.npm_config_argv;
    if (npmRunArgs) {
      cmdArgs = cmdArgs.concat(JSON.parse(npmRunArgs).original);
    }
  } catch (e) {}

  return cmdArgs;
}


export function loadConfig(process: Process, chalk: Chalk, cmdArgs: string[]) {
  const config: BuildConfig = {};
  let configFileName = DEFAULT_CONFIG_FILE_NAME;

  let appConfigFileNameCmdIndex = cmdArgs.indexOf('--config');
  if (appConfigFileNameCmdIndex > -1) {
    configFileName = cmdArgs[appConfigFileNameCmdIndex + 1];
  }

  let configFilePath = configFileName;
  if (!path.isAbsolute(configFilePath)) {
    configFilePath = path.join(process.cwd(), configFilePath);
  }

  try {
    const configFile = require(configFilePath);

    if (!configFile.config) {
      console.error(chalk.red(`Invalid Stencil "${chalk.bold(configFilePath)}" configuration file. Missing "config" property.`));
      process.exit(1);
    }

    Object.assign(config, configFile.config);

  } catch (e) {
    console.error(chalk.red(`Error reading Stencil "${chalk.bold(configFilePath)}" configuration file.`));
    process.exit(1);
  }


  if (!config.rootDir) {
    config.rootDir = path.dirname(configFilePath);
  }

  if (!config.logger) {
    config.logger = new CommandLineLogger({
      level: config.logLevel,
      process: process,
      chalk: chalk
    });
  }

  return config;
}


export function loadOptions(cmdArgs: string[], config: BuildConfig) {
  if (cmdArgs.indexOf('--help') > -1 || cmdArgs.indexOf('-h') > -1) {
    help();
    process.exit(0);
  }

  if (cmdArgs.indexOf('--version') > -1 || cmdArgs.indexOf('-v') > -1) {
    try {
      const packageJson = fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8');
      const packageData = JSON.parse(packageJson);
      console.log(packageData.version);

    } catch (e) {
      console.error(e);
    }
    process.exit(0);
  }

  if (cmdArgs.indexOf('--dev') > -1) {
    config.devMode = true;
  }

  if (cmdArgs.indexOf('--watch') > -1) {
    config.watch = true;
  }

  if (cmdArgs.indexOf('--debug') > -1) {
    config.logLevel = 'debug';

  } else {
    var logLevelCmdIndex = cmdArgs.indexOf('--log-level');
    if (logLevelCmdIndex > -1) {
      config.logLevel = cmdArgs[logLevelCmdIndex + 1];
    }
  }
}


interface Process {
  argv: string[];
  env: any;
  cwd: () => string;
  once: (code: string, cb: Function) => void;
  exit: (code: number) => void;
}


const DEFAULT_CONFIG_FILE_NAME = 'stencil.config.js';
