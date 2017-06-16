import { BuildContext, FileMeta } from '../interfaces';
import { HAS_SLOTS, HAS_NAMED_SLOTS } from '../../util/constants';
import * as ts from 'typescript';
import * as util from './util';

import { VDomCacheLevel } from '../../util/interfaces';


export function jsxToVNode(ctx: BuildContext): ts.TransformerFactory<ts.SourceFile> {

  return (transformContext: ts.TransformationContext) => {

    function visit(fileMeta: FileMeta, node: ts.Node): ts.VisitResult<ts.Node> {

      if (isHyperScriptCall(node as ts.Expression)) {
        let callNode = node as ts.CallExpression;
        const convertedArgs = convertJsxToVNode(fileMeta, callNode.arguments);
        node = ts.updateCall(callNode, callNode.expression, null, convertedArgs);

        invalidateAncestorChildrenCache(node as ts.CallExpression);
      }

      return ts.visitEachChild(node, (node) => {
        return visit(fileMeta, node);
      }, transformContext);
    }

    return (tsSourceFile) => {
      const fileMeta = ctx.files.get(tsSourceFile.fileName);
      return visit(fileMeta, tsSourceFile) as ts.SourceFile;
    };
  };
}

/**
 *
 * @param node
 */
function isHyperScriptCall(node: ts.Expression) {
  if (node.kind !== ts.SyntaxKind.CallExpression) {
    return false;
  }
  const callNode = node as ts.CallExpression;
  return ((<ts.Identifier>callNode.expression).text === 'h');
}

function invalidateAncestorChildrenCache(node: ts.Node) {
  let tempNode = node;

  while (tempNode.parent) {
    tempNode = tempNode.parent;
    if (!isHyperScriptCall(node as ts.Expression)) {
      continue;
    }
    const nodeCacheLevel = getVDomCacheLevel(tempNode as ts.CallExpression);
    let newCacheLevel;
    if (nodeCacheLevel < VDomCacheLevel.Children) {
      return;
    }
    if (nodeCacheLevel === VDomCacheLevel.DataAndChildren) {
      newCacheLevel = VDomCacheLevel.Data;
    }
    if (nodeCacheLevel === VDomCacheLevel.Children) {
      newCacheLevel = VDomCacheLevel.None;
    }
    node = updateVDomCache(tempNode as ts.CallExpression, newCacheLevel);
  }
}

/**
 *
 * @param node
 * @param vDomCache
 */
function updateVDomCache(node: ts.CallExpression, vDomCache: VDomCacheLevel) {
  const [tag, props, ...children] = node.arguments as ts.NodeArray<ts.Expression>;

  const newProps = ts.updateObjectLiteral(props as ts.ObjectLiteralExpression, [
    ts.createPropertyAssignment('x', ts.createLiteral(vDomCache))
  ]);

  const args = [].concat(tag, newProps, children);
  return ts.updateCall(node, node.expression, null, args);
}

/**
 *
 * @param node
 */
function getVDomCacheLevel(node: ts.CallExpression): VDomCacheLevel {
  const [, props] = node.arguments as ts.NodeArray<ts.Expression>;

  const attrs: ts.ObjectLiteralElementLike[] = (<ts.ObjectLiteralExpression>props).properties;
  const cacheAttrNode = attrs.find((attr: ts.PropertyAssignment) => util.getTextOfPropertyName(attr.name) === 'x');
  const val = (<ts.PropertyAssignment>cacheAttrNode).initializer;

  return parseInt((<ts.NumericLiteral>val).text, 10);
}

/**
 *
 * @param fileMeta
 * @param args
 */
function convertJsxToVNode(fileMeta: FileMeta, args: ts.NodeArray<ts.Expression>): ts.Expression[] {
  const [tag, props, ...children] = args;
  const tagName = (<ts.StringLiteral>tag).text.toLowerCase();
  const namespace = getNamespace(tagName);
  let newProps: util.ObjectMap = {};
  let newArgs: ts.Expression[] = [tag];
  let vDomCache = VDomCacheLevel.None;

  updateFileMetaWithSlots(fileMeta, tagName, props);

  // If call has props and it is an object -> h('div', {})
  if (props && props.kind === ts.SyntaxKind.ObjectLiteralExpression) {
    const jsxAttrs = util.objectLiteralToObjectMap(props as ts.ObjectLiteralExpression);
    newProps = parseJsxAttrs(jsxAttrs);
  }

  // If there is a namespace
  if (namespace !== undefined) {
    newProps.n = ts.createLiteral(namespace);
  }

  if (isDataStatic(util.objectMapToObjectLiteral(newProps))) {
    vDomCache = VDomCacheLevel.Data;
  }
  newProps.x = ts.createLiteral(vDomCache);

  // If there are no props then set the value as a zero
  newArgs.push(
    util.objectMapToObjectLiteral(newProps)
  );

  // If there are children then add them to the end of the arg list.
  if (children && children.length > 0) {
    newArgs = newArgs.concat(
      updateVNodeChildren(children)
    );
  }

  return newArgs;
}

/**
 *
 * @param tagName
 */
function getNamespace(tagName: string): ts.StringLiteral | undefined {
  if (tagName === 'svg') {
    ts.createLiteral('http://www.w3.org/2000/svg');
  }

  return undefined;
}

/**
 *
 * @param fileMeta
 * @param tagName
 * @param props
 */
function updateFileMetaWithSlots(fileMeta: FileMeta, tagName: string, props: ts.Expression) {
  // checking if there is a default slot and/or named slots in the compiler
  // so that during runtime there is less work to do

  if (!fileMeta || !fileMeta.hasCmpClass) {
    return;
  }

  if (tagName !== 'slot') {
    return;
  }

  if (fileMeta.cmpMeta.slotMeta === undefined) {
    fileMeta.cmpMeta.slotMeta = HAS_SLOTS;
  }

  if (props && props.kind === ts.SyntaxKind.ObjectLiteralExpression) {
    const jsxAttrs = util.objectLiteralToObjectMap(props as ts.ObjectLiteralExpression);

    for (var attrName in jsxAttrs) {
      if (attrName.toLowerCase().trim() === 'name') {
        var attrValue: string = (<any>jsxAttrs[attrName]).text.trim();

        if (attrValue.length > 0) {
          fileMeta.cmpMeta.slotMeta = HAS_NAMED_SLOTS;
          break;
        }
      }
    }
  }
}

/**
 *
 * @param jsxAttrs
 */
function parseJsxAttrs(jsxAttrs: util.ObjectMap): util.ObjectMap {
  let vnodeInfo: util.ObjectMap = {};
  let classNameStr = '';
  let eventListeners: any = null;
  let attrs: any = null;
  let props: any = null;

  for (var attrName in jsxAttrs) {

    var exp: ts.Expression = <any>jsxAttrs[attrName];

    var attrNameSplit = attrName.split('-');
    attrName = attrName.toLowerCase();

    if (attrName === 'class' || attrName === 'classname') {
      // class
      if (exp.kind === ts.SyntaxKind.StringLiteral) {
        classNameStr += ' ' + exp.getText().trim();
      }
      vnodeInfo.c = exp;
      continue;
    }

    if (attrName === 'style') {
      vnodeInfo.style = exp;
      continue;
    }

    if (attrName === 'key') {
      // key
      vnodeInfo.k = exp;
      continue;
    }

    if (isHyphenedEventListener(attrNameSplit, exp)) {
      // on-click
      eventListeners = eventListeners || {};
      eventListeners[attrNameSplit.slice(1).join('-')] = exp;
      continue;
    }

    if (isStandardizedEventListener(attrName, exp)) {
      // onClick
      eventListeners = eventListeners || {};
      eventListeners[attrName.toLowerCase().substring(2)] = exp;
      continue;
    }

    if (isAttr(attrName, exp)) {
      // attrs
      attrs = attrs || {};
      attrs[attrName] = exp;
      continue;
    }

    props = props || {};
    props[attrName] = exp;
  }

  classNameStr = classNameStr.replace(/['"]+/g, '').trim();
  if (classNameStr.length) {
    vnodeInfo.c = classStringToClassObj(classNameStr);
  }

  if (eventListeners) {
    vnodeInfo.o = eventListeners;
  }

  if (attrs) {
    vnodeInfo.a = attrs;
  }

  if (props) {
    vnodeInfo.p = props;
  }
  return vnodeInfo;
}

/**
 *
 * @param items
 */
function updateVNodeChildren(items: ts.Expression[]): ts.Expression[] {
  return items.map(node => {
    switch (node.kind) {
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
    case ts.SyntaxKind.NullKeyword:
      return ts.createCall(ts.createIdentifier('t'), null, [ts.createLiteral('')]);
    case ts.SyntaxKind.NumericLiteral:
      return ts.createCall(ts.createIdentifier('t'), null, [ts.createLiteral((<ts.NumericLiteral>node).text)]);
    case ts.SyntaxKind.StringLiteral:
      return ts.createCall(ts.createIdentifier('t'), null, [node]);
    }

    return node;
  });
}

/**
 *
 * @param objectLiteral
 */
function isDataStatic(objectLiteral: ts.ObjectLiteralExpression): boolean {
  const attrs: ts.ObjectLiteralElementLike[] = objectLiteral.properties;

  return attrs.every((attr: ts.PropertyAssignment) => {
    switch (attr.initializer.kind) {
      case ts.SyntaxKind.ObjectLiteralExpression:
        return isDataStatic(attr.initializer as ts.ObjectLiteralExpression);
      case ts.SyntaxKind.Identifier:
      case ts.SyntaxKind.PropertyAccessExpression:
      case ts.SyntaxKind.CallExpression:
        return false;
      default:
        return true;
    }
  });
}

/**
 *
 * @param attrNameSplit
 * @param exp
 */
function isHyphenedEventListener(attrNameSplit: string[], exp: ts.Expression) {
  if (exp.kind !== ts.SyntaxKind.FunctionExpression && exp.kind !== ts.SyntaxKind.CallExpression) {
    return false;
  }

  return (attrNameSplit.length > 1 && attrNameSplit[0].toLowerCase() === 'on');
}


function isStandardizedEventListener(attrName: string, exp: ts.Expression) {
  if (exp.kind !== ts.SyntaxKind.FunctionExpression && exp.kind !== ts.SyntaxKind.CallExpression) {
    return false;
  }

  attrName = attrName.toLowerCase();

  if (attrName.substr(0, 2) !== 'on') {
    return false;
  }

  return (KNOWN_EVENT_LISTENERS.indexOf(attrName) > -1);
}


function isAttr(attrName: string, exp: ts.Expression) {
  if (exp.kind === ts.SyntaxKind.ObjectLiteralExpression) {
    return false;
  }
  if (exp.kind === ts.SyntaxKind.CallExpression) {
    return false;
  }
  if (exp.kind === ts.SyntaxKind.ArrayLiteralExpression) {
    return false;
  }
  if (exp.kind === ts.SyntaxKind.FunctionExpression) {
    return false;
  }
  if (attrName.indexOf('-') > -1) {
    return true;
  }
  if (KNOWN_ATTR_NAMES.indexOf(attrName) > -1) {
    return true;
  }
  if (/[A-Z]/.test(attrName)) {
    return false;
  }
  if (exp.kind === ts.SyntaxKind.StringLiteral) {
    return true;
  }
  return false;
}

function classStringToClassObj(className: string) {
  const obj = className
    .split(' ')
    .reduce((obj: {[key: string]: ts.BooleanLiteral}, className: string): {[key: string]: ts.BooleanLiteral} => {
      const o = Object.assign({}, obj);
      o[className] = ts.createTrue();
      return o;
    }, <{[key: string]: ts.BooleanLiteral}>{});

  return util.objectMapToObjectLiteral(obj);
}

const KNOWN_EVENT_LISTENERS = ['onabort', 'onanimationend', 'onanimationiteration', 'onanimationstart', 'onauxclick', 'onbeforecopy', 'onbeforecut', 'onbeforepaste', 'onbeforeunload', 'onblur', 'oncancel', 'oncanplay', 'oncanplaythrough', 'onchange', 'onclick', 'onclose', 'oncontextmenu', 'oncopy', 'oncuechange', 'oncut', 'ondblclick', 'ondevicemotion', 'ondeviceorientation', 'ondeviceorientationabsolute', 'ondrag', 'ondragend', 'ondragenter', 'ondragleave', 'ondragover', 'ondragstart', 'ondrop', 'ondurationchange', 'onemptied', 'onended', 'onerror', 'onfocus', 'ongotpointercapture', 'onhashchange', 'oninput', 'oninvalid', 'onkeydown', 'onkeypress', 'onkeyup', 'onlanguagechange', 'onload', 'onloadeddata', 'onloadedmetadata', 'onloadstart', 'onlostpointercapture', 'onmessage', 'onmousedown', 'onmouseenter', 'onmouseleave', 'onmousemove', 'onmouseout', 'onmouseover', 'onmouseup', 'onmousewheel', 'onoffline', 'ononline', 'onpagehide', 'onpageshow', 'onpaste', 'onpause', 'onplay', 'onplaying', 'onpointercancel', 'onpointerdown', 'onpointerenter', 'onpointerleave', 'onpointermove', 'onpointerout', 'onpointerover', 'onpointerup', 'onpopstate', 'onprogress', 'onratechange', 'onrejectionhandled', 'onreset', 'onresize', 'onscroll', 'onsearch', 'onseeked', 'onseeking', 'onselect', 'onselectstart', 'onshow', 'onstalled', 'onstorage', 'onsubmit', 'onsuspend', 'ontimeupdate', 'ontoggle', 'ontransitionend', 'onunhandledrejection', 'onunload', 'onvolumechange', 'onwaiting', 'onwebkitanimationend', 'onwebkitanimationiteration', 'onwebkitanimationstart', 'onwebkitfullscreenchange', 'onwebkitfullscreenerror', 'onwebkittransitionend', 'onwheel'];
const KNOWN_ATTR_NAMES = ['slot', 'hidden', 'disabled'];
