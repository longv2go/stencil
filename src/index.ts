import {
  BuildConfig,
  ComponentDecorator,
  CssClassMap,
  HydrateOptions,
  ListenDecorator,
  MethodDecorator,
  ProjectGlobal,
  PropDecorator,
  PropChangeDecorator,
  StateDecorator,
  StencilSystem,
  VNodeData
} from './util/interfaces';


export declare const Component: ComponentDecorator;

export declare const Listen: ListenDecorator;

export declare const Method: MethodDecorator;

export declare const Prop: PropDecorator;

export declare const PropWillChange: PropChangeDecorator;

export declare const PropDidChange: PropChangeDecorator;

export declare const State: StateDecorator;

export { build } from './compiler/index';

export { createRenderer } from './server/index';

export interface HostElement extends HTMLElement {
  $instance: any;
}

export {
  BuildConfig,
  CssClassMap,
  HydrateOptions,
  ProjectGlobal,
  StencilSystem,
  VNodeData
};
