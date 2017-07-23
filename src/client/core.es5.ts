import { createDomApi } from '../core/renderer/dom-api';
import { createDomControllerClient } from './dom-controller-client';
import { createPlatformClient } from './platform-client';
import { createQueueClient } from './queue-client';
import { CoreGlobal, ProjectGlobal } from '../util/interfaces';


declare const coreGlobal: CoreGlobal;
declare const projectNamespace: string;
declare const publicPath: string;

const projectGlobal: ProjectGlobal = (<any>window)[projectNamespace] = (<any>window)[projectNamespace] || {};

const domCtrl = createDomControllerClient(window);

const plt = createPlatformClient(
  coreGlobal,
  projectGlobal,
  window,
  createDomApi(document),
  createQueueClient(domCtrl),
  publicPath
);

plt.registerComponents(projectGlobal.components).forEach(cmpMeta => {
  function HostElement(self: any) {
    return HTMLElement.call(this, self);
  }

  HostElement.prototype = Object.create(
    HTMLElement.prototype,
    { constructor: { value: HostElement, configurable: true } }
  );

  plt.defineComponent(cmpMeta, HostElement);
});
