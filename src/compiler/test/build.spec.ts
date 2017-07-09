import { BuildConfig, ComponentRegistry } from '../../util/interfaces';
import { parseComponentRegistry } from '../../util/data-parse';
import { build } from '../build';
import { BuildContext, BuildResults } from '../interfaces';
import { CmdLogger } from '../logger';
import { mockFs, mockLogger, mockStencilSystem } from '../../test';


describe('build', () => {

  it('should rebuild both cmp-a and cmp-b when non-component module has changed', () => {
    ctx = {};
    buildConfig.bundles = [
      { components: ['cmp-a'] },
      { components: ['cmp-b'] }
    ];
    buildConfig.watch = true;
    writeFileSync('/src/cmp-a.tsx', `import { MyService } from './service'; @Component({ tag: 'cmp-a' }) export class CmpA {}`);
    writeFileSync('/src/cmp-b.tsx', `import { MyService } from './service'; @Component({ tag: 'cmp-b' }) export class CmpB {}`);
    writeFileSync('/src/service.tsx', `export class MyService {}`);

    return build(buildConfig, ctx).then(r => {
      expect(r.diagnostics.length).toBe(0);
      expect(ctx.transpileBuildCount).toBe(3);
      expect(ctx.moduleBundleCount).toBe(2);

      expect(wroteFile(r, 'cmp-a.js')).toBe(true);
      expect(wroteFile(r, 'cmp-b.js')).toBe(true);

      return new Promise(resolve => {
        ctx.onFinish = resolve;
        ctx.watcher.$triggerEvent('change', '/src/service.tsx');

      }).then((r: BuildResults) => {
        expect(ctx.transpileBuildCount).toBe(1);
        expect(ctx.moduleBundleCount).toBe(2);

        expect(wroteFile(r, 'cmp-a.js')).toBe(true);
        expect(wroteFile(r, 'cmp-b.js')).toBe(true);
        expect(wroteFile(r, 'service.js')).toBe(false);
      });
    });
  });

  it('should not rebuild cmp-a when only cmp-b changed and no non-components have changed', () => {
    ctx = {};
    buildConfig.bundles = [
      { components: ['cmp-a'] },
      { components: ['cmp-b'] }
    ];
    buildConfig.watch = true;
    writeFileSync('/src/cmp-a.tsx', `import { MyService } from './service'; @Component({ tag: 'cmp-a' }) export class CmpA {}`);
    writeFileSync('/src/cmp-b.tsx', `import { MyService } from './service'; @Component({ tag: 'cmp-b' }) export class CmpB {}`);
    writeFileSync('/src/service.tsx', `export class MyService {}`);

    return build(buildConfig, ctx).then(r => {
      expect(r.diagnostics.length).toBe(0);
      expect(ctx.transpileBuildCount).toBe(3);
      expect(ctx.moduleBundleCount).toBe(2);

      expect(wroteFile(r, 'cmp-a.js')).toBe(true);
      expect(wroteFile(r, 'cmp-b.js')).toBe(true);
      expect(wroteFile(r, 'service.js')).toBe(false);

      return new Promise(resolve => {
        ctx.onFinish = resolve;
        writeFileSync('/src/cmp-b.tsx', `import { MyService } from './service'; @Component({ tag: 'cmp-b' }) export class CmpB {} console.log('change');`);
        ctx.watcher.$triggerEvent('change', '/src/cmp-b.tsx');

      }).then((r: BuildResults) => {
        expect(ctx.transpileBuildCount).toBe(2);
        expect(ctx.moduleBundleCount).toBe(1);

        expect(wroteFile(r, 'cmp-a.js')).toBe(false);
        expect(wroteFile(r, 'cmp-b.js')).toBe(true);
        expect(wroteFile(r, 'service.js')).toBe(false);
      });
    });
  });

  it('should not re-transpile, re-bundle modules or re-bundle styles for cmp-b if only cmp-a module changed', () => {
    ctx = {};
    buildConfig.bundles = [
      { components: ['cmp-a'] },
      { components: ['cmp-b'] }
    ];
    buildConfig.watch = true;
    writeFileSync('/src/cmp-a.tsx', `@Component({ tag: 'cmp-a', styleUrl: 'cmp-a.scss' }) export class CmpA {}`);
    writeFileSync('/src/cmp-a.scss', `body { color: red; }`);
    writeFileSync('/src/cmp-b.tsx', `@Component({ tag: 'cmp-b', styleUrl: 'cmp-b.scss' }) export class CmpB {}`);
    writeFileSync('/src/cmp-b.scss', `body { color: blue; }`);

    return build(buildConfig, ctx).then(r => {
      expect(r.diagnostics.length).toBe(0);
      expect(ctx.transpileBuildCount).toBe(2);
      expect(ctx.moduleBundleCount).toBe(2);
      expect(ctx.sassBuildCount).toBe(2);
      expect(ctx.styleBundleCount).toBe(2);

      expect(wroteFile(r, 'cmp-a.js')).toBe(true);
      expect(wroteFile(r, 'cmp-a.css')).toBe(true);
      expect(wroteFile(r, 'cmp-b.js')).toBe(true);
      expect(wroteFile(r, 'cmp-b.css')).toBe(true);

      return new Promise(resolve => {
        ctx.onFinish = resolve;
        writeFileSync('/src/cmp-a.tsx', `@Component({ tag: 'cmp-a', styleUrl: 'cmp-a.scss' }) export class CmpA { constructor() { console.log('file change'); } }`);
        ctx.watcher.$triggerEvent('change', '/src/cmp-a.tsx');

      }).then((r: BuildResults) => {
        expect(r.diagnostics.length).toBe(0);
        expect(ctx.transpileBuildCount).toBe(1);
        expect(ctx.moduleBundleCount).toBe(1);
        expect(ctx.sassBuildCount).toBe(1);
        expect(ctx.styleBundleCount).toBe(1);

        expect(wroteFile(r, 'cmp-a.js')).toBe(true);
        expect(wroteFile(r, 'cmp-a.css')).toBe(true);

        expect(wroteFile(r, 'cmp-b.js')).toBe(false);
        expect(wroteFile(r, 'cmp-b.css')).toBe(false);
      });
    });
  });

  it('should do a re-transpile, re-bundle module and re-bundle styles if component file change', () => {
    ctx = {};
    buildConfig.bundles = [ { components: ['cmp-a'] } ];
    buildConfig.watch = true;
    writeFileSync('/src/cmp-a.tsx', `@Component({ tag: 'cmp-a', styleUrl: 'sass-a.scss' }) export class CmpA {}`);
    writeFileSync('/src/sass-a.scss', `body { color: red; }`);

    return build(buildConfig, ctx).then(r => {
      expect(r.diagnostics.length).toBe(0);
      expect(ctx.transpileBuildCount).toBe(1);
      expect(ctx.moduleBundleCount).toBe(1);

      expect(wroteFile(r, 'cmp-a.js')).toBe(true);
      expect(wroteFile(r, 'cmp-a.css')).toBe(true);

      return new Promise(resolve => {
        ctx.onFinish = resolve;
        writeFileSync('/src/cmp-a.tsx', `@Component({ tag: 'cmp-a', styleUrl: 'sass-a.scss' }) export class CmpA { constructor() { console.log('file change'); } }`);
        ctx.watcher.$triggerEvent('change', '/src/cmp-a.tsx');

      }).then((r: BuildResults) => {
        expect(r.diagnostics.length).toBe(0);
        expect(ctx.transpileBuildCount).toBe(1);
        expect(ctx.moduleBundleCount).toBe(1);
        expect(wroteFile(r, 'cmp-a.js')).toBe(true);
        expect(wroteFile(r, 'cmp-a.css')).toBe(true);
      });
    });
  });

  it('should not re-transpile or re-bundle module when only a sass change', () => {
    ctx = {};
    buildConfig.bundles = [ { components: ['cmp-a'] } ];
    buildConfig.watch = true;
    writeFileSync('/src/cmp-a.tsx', `@Component({ tag: 'cmp-a', styleUrl: 'cmp-a.scss' }) export class CmpA {}`);
    writeFileSync('/src/cmp-a.scss', `body { color: red; }`);

    return build(buildConfig, ctx).then(() => {

      return new Promise(resolve => {
        ctx.onFinish = resolve;
        ctx.watcher.$triggerEvent('change', '/src/cmp-a.scss');

      }).then((r: BuildResults) => {
        expect(ctx.transpileBuildCount).toBe(0);
        expect(ctx.moduleBundleCount).toBe(0);
        expect(ctx.sassBuildCount).toBe(1);
        expect(ctx.styleBundleCount).toBe(1);

        expect(wroteFile(r, 'cmp-a.js')).toBe(false);
        expect(wroteFile(r, 'cmp-a.css')).toBe(true);
      });
    });
  });

  it('should build one component w/ styleUrl', () => {
    ctx = {};
    buildConfig.bundles = [ { components: ['cmp-a'] } ];
    writeFileSync('/src/cmp-a.tsx', `@Component({ tag: 'cmp-a', styleUrl: 'cmp-a.scss' }) export class CmpA {}`);
    writeFileSync('/src/cmp-a.scss', `body { color: red; }`);

    return build(buildConfig, ctx).then(r => {
      expect(r.diagnostics.length).toBe(0);
      expect(r.componentRegistry.length).toBe(1);
      expect(ctx.transpileBuildCount).toBe(1);
      expect(ctx.sassBuildCount).toBe(1);
      expect(ctx.moduleBundleCount).toBe(1);
      expect(ctx.styleBundleCount).toBe(1);

      expect(wroteFile(r, 'cmp-a.js')).toBe(true);
      expect(wroteFile(r, 'cmp-a.css')).toBe(true);

      const cmpMeta = parseComponentRegistry(r.componentRegistry[0], registry);
      expect(cmpMeta.tagNameMeta).toBe('CMP-A');
      expect(cmpMeta.styleIds).toEqual({'$': 'cmp-a'});
    });
  });

  it('should build one component w/ no styles', () => {
    ctx = {};
    buildConfig.bundles = [ { components: ['my-app'] } ];
    writeFileSync('/src/my-app.tsx', `@Component({ tag: 'my-app' }) export class MyApp {}`);

    return build(buildConfig, ctx).then(r => {
      expect(r.diagnostics.length).toBe(0);
      expect(r.componentRegistry.length).toBe(1);
      expect(ctx.transpileBuildCount).toBe(1);
      expect(ctx.sassBuildCount).toBe(0);
      expect(ctx.moduleBundleCount).toBe(1);
      expect(ctx.styleBundleCount).toBe(0);

      const cmpMeta = parseComponentRegistry(r.componentRegistry[0], registry);
      expect(cmpMeta.tagNameMeta).toBe('MY-APP');
    });
  });

  it('should build no components', () => {
    ctx = {};
    return build(buildConfig, ctx).then(r => {
      expect(r.diagnostics.length).toBe(0);
      expect(r.componentRegistry.length).toBe(0);
      expect(ctx.transpileBuildCount).toBe(0);
      expect(ctx.sassBuildCount).toBe(0);
      expect(ctx.moduleBundleCount).toBe(0);
      expect(ctx.styleBundleCount).toBe(0);
    });
  });


  var logger = mockLogger();
  var chalk = require('chalk');
  logger = new CmdLogger({
    level: 'debug',
    stream: process.stdout,
    columns: (<any>process.stdout).columns,
    chalk: chalk
  });
  var registry: ComponentRegistry = {};
  var ctx: BuildContext = {};
  var sys = mockStencilSystem();
  sys.getClientCoreFile = getClientCoreFile;
  sys.generateContentHash = generateContentHash;
  sys.minifyCss = mockMinify;
  sys.minifyJs = mockMinify;
  sys.watch = watch;

  var buildConfig: BuildConfig = {};


  function getClientCoreFile(opts: {staticName: string}) {
    return Promise.resolve(opts.staticName + '-content');
  }

  function generateContentHash(content: string, length: number) {
    var crypto = require('crypto');
    return crypto.createHash('sha1')
                .update(content)
                .digest('base64')
                .replace(/\W/g, '')
                .substr(0, length)
                .toLowerCase();
  }

  function mockMinify(input: string) {
    return <any>{
      output: `/** mock minify **/\n${input}`,
      diagnostics: []
    };
  }

  function watch(paths: string): any {
    paths;
    const events: {[eventName: string]: Function} = {};

    const watcher = {
      on: function(eventName: string, listener: Function) {
        events[eventName] = listener;
        return watcher;
      },
      $triggerEvent: function(eventName: string, path: string) {
        events[eventName](path);
      }
    };

    return watcher;
  }

  beforeEach(() => {
    ctx = null;
    registry = {};

    buildConfig = {
      sys: sys,
      logger: logger,
      rootDir: '/'
    };
    sys.fs = mockFs();

    mkdirSync('/');
    mkdirSync('/src');
  });


  function mkdirSync(path: string) {
    (<any>sys.fs).mkdirSync(path);
  }

  // function readFileSync(filePath: string) {
  //   return sys.fs.readFileSync(filePath, 'utf-8');
  // }

  function writeFileSync(filePath: string, data: any) {
    (<any>sys.fs).writeFileSync(filePath, data);
  }

  function wroteFile(r: BuildResults, path: string) {
    return r.files.some(f => {
      return f.indexOf(path) > -1;
    });
  }

});
