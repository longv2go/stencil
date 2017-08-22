import { injectAppIntoLoader } from '../app-loader';
import { getAppPublicPath } from '../app-core';
import { BuildConfig, LoadComponentRegistry } from '../../../util/interfaces';
import { mockStencilSystem } from '../../../test';


describe('build-project-files', () => {
  let mockStencilContent = `('__STENCIL__APP__')`;
  let config: BuildConfig;

  beforeEach(() => {
    config = {
      sys: mockStencilSystem()
    };
  });

  describe('inject project', () => {

    it('should set the loader arguments', () => {
      config.namespace = 'MyApp';
      config.publicPath = 'build/';
      const publicPath = getAppPublicPath(config);
      const appCoreFileName = 'myapp.core.js';
      const appCorePolyfilledFileName = 'myapp.core.pf.js';
      const componentRegistry: LoadComponentRegistry[] = [['my-app', 'MyApp.Module', {Mode1: 'something', Mode2: 'Something Else'}, [], [], 42, 73]];

      const projectLoader = injectAppIntoLoader(
        config,
        appCoreFileName,
        appCorePolyfilledFileName,
        publicPath,
        componentRegistry,
        mockStencilContent
      );

      expect(projectLoader).toBe(`("MyApp","build/myapp/myapp.core.js","build/myapp/myapp.core.pf.js",[["my-app","MyApp.Module",{"Mode1":"something","Mode2":"Something Else"},[],[],42,73]])`);
    });

  });

});
