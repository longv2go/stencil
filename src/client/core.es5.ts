import { createDomApi } from '../core/renderer/dom-api';
import { createDomControllerClient } from './dom-controller-client';
import { createPlatformClient } from './platform-client';
import { createQueueClient } from './queue-client';
import { getNowFunction } from './now';
import { AppGlobal } from '../util/interfaces';


const appGlobal: AppGlobal = (<any>window)[appNamespace] = (<any>window)[appNamespace] || {};

const now = getNowFunction(window);

appGlobal.dom = createDomControllerClient(window, now);

const plt = createPlatformClient(
  Core,
  appGlobal,
  window,
  createDomApi(document),
  createQueueClient(appGlobal.dom, now),
  publicPath
);

plt.registerComponents(appGlobal.components).forEach(cmpMeta => {
  function HostElement(self: any) {
    return HTMLElement.call(this, self);
  }

  HostElement.prototype = Object.create(
    HTMLElement.prototype,
    { constructor: { value: HostElement, configurable: true } }
  );

  plt.defineComponent(cmpMeta, HostElement);
});
