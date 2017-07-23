import { createDomApi } from '../core/renderer/dom-api';
import { createDomControllerClient } from './dom-controller-client';
import { createPlatformClient } from './platform-client';
import { createQueueClient } from './queue-client';
import { ProjectGlobal } from '../util/interfaces';


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
  plt.defineComponent(cmpMeta, class HostElement extends HTMLElement {});
});
