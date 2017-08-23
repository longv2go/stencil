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
      const projectLoader = callInjectAppIntoLoader({ componentRegistry: [['my-app', 'MyApp.Module', { Mode1: 'something', Mode2: 'Something Else' }, [], [], 42, 73]] });
      expect(projectLoader).toBe(`("MyApp","build/myapp/myapp.core.js","build/myapp/myapp.core.pf.js",[["my-app","MyApp.Module",{"Mode1":"something","Mode2":"Something Else"},[],[],42,73]])`);
    });

    it('only replaces the magic string', () => {
      mockStencilContent = `(This is bogus text'__STENCIL__APP__'yeah, me too)`;
      const projectLoader = callInjectAppIntoLoader({});
      expect(projectLoader).toBe(`(This is bogus text"MyApp","build/myapp/myapp.core.js","build/myapp/myapp.core.pf.js",[]yeah, me too)`);
    });

  });

  function callInjectAppIntoLoader(params: {
    namespace?: string,
    publicPath?: string,
    coreFileName?: string,
    corePolyfillFileName?: string,
    componentRegistry?: Array<LoadComponentRegistry>
  }) {
    config.namespace = params.namespace || 'MyApp';
    config.publicPath = params.publicPath || 'build/';
    return injectAppIntoLoader(
      config,
      params.coreFileName || 'myapp.core.js',
      params.corePolyfillFileName || 'myapp.core.pf.js',
      getAppPublicPath(config),
      params.componentRegistry || [],
      mockStencilContent
    );
  }

});
