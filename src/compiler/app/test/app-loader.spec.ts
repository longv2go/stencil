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
    let mockMinify: jest.Mock<any>;
    beforeEach(() => {
      mockMinify = jest.fn();
      mockMinify.mockReturnValue({ diagnostics: [] });  // NOTE: bad idea - typedef has this as optional, but not optional in the code under test...
      config.sys.minifyJs = mockMinify;
    });

    it('should set the loader arguments', () => {
      const projectLoader = callInjectAppIntoLoader({ componentRegistry: [['my-app', 'MyApp.Module', { Mode1: 'something', Mode2: 'Something Else' }, [], [], 42, 73]] });
      expect(projectLoader).toBe(`("MyApp","build/myapp/myapp.core.js","build/myapp/myapp.core.pf.js",[["my-app","MyApp.Module",{"Mode1":"something","Mode2":"Something Else"},[],[],42,73]])`);
    });

    it('only replaces the magic string', () => {
      mockStencilContent = `(This is bogus text'__STENCIL__APP__'yeah, me too)`;
      const projectLoader = callInjectAppIntoLoader();
      expect(projectLoader).toBe(`(This is bogus text"MyApp","build/myapp/myapp.core.js","build/myapp/myapp.core.pf.js",[]yeah, me too)`);
    });

    describe('with minifyJs true', () => {
      it('calls the minify routine', () => {
        config.minifyJs = true;
        callInjectAppIntoLoader();
        expect(mockMinify.mock.calls.length).toEqual(1);
      });

      it('returns minified output', () => {

      });

      describe('with diagnostic messages', () => {
        it('logs the messages', () => {

        });

        it('returns the non-minified data', () => {

        });
      });
    });

    describe('with minifyJs falsey', () => {
      it('does not minify', () => {
        callInjectAppIntoLoader();
        config.minifyJs = false;
        callInjectAppIntoLoader();
        expect(mockMinify.mock.calls.length).toEqual(0);
      });
    });

  });

  function callInjectAppIntoLoader(params?: {
    namespace?: string,
    publicPath?: string,
    coreFileName?: string,
    corePolyfillFileName?: string,
    componentRegistry?: Array<LoadComponentRegistry>
  }) {
    let p = params || {};
    config.namespace = p.namespace || 'MyApp';
    config.publicPath = p.publicPath || 'build/';
    return injectAppIntoLoader(
      config,
      p.coreFileName || 'myapp.core.js',
      p.corePolyfillFileName || 'myapp.core.pf.js',
      getAppPublicPath(config),
      p.componentRegistry || [],
      mockStencilContent
    );
  }

});
