import { catchError } from '../../util';
import { Diagnostic, EventMeta, ModuleFile } from '../../../util/interfaces';
import * as ts from 'typescript';


export function getEventDecoratorMeta(moduleFile: ModuleFile, diagnostics: Diagnostic[], classNode: ts.ClassDeclaration) {
  moduleFile.cmpMeta.eventsMeta = [];

  const decoratedMembers = classNode.members.filter(n => n.decorators && n.decorators.length);

  decoratedMembers.forEach(memberNode => {
    let isEvent = false;
    let methodName: string = null;
    let eventName: string = null;
    let rawEventMeta: EventMeta = {};

    memberNode.forEachChild(n => {

      if (n.kind === ts.SyntaxKind.Decorator && n.getChildCount() > 1 && n.getChildAt(1).getFirstToken().getText() === 'Event') {
        isEvent = true;

        n.getChildAt(1).forEachChild(n => {

          if (n.kind === ts.SyntaxKind.ObjectLiteralExpression) {
            try {
              const fnStr = `return ${n.getText()};`;
              Object.assign(rawEventMeta, new Function(fnStr)());

            } catch (e) {
              const d = catchError(diagnostics, e);
              d.messageText = `parse event options: ${e}`;
              d.absFilePath = moduleFile.tsFilePath;
            }
          }
        });

      } else if (isEvent) {
        if (n.kind === ts.SyntaxKind.Identifier && !methodName) {
          methodName = n.getText().trim();
        }
      }

    });


    if (isEvent && eventName && methodName) {
      eventName.split(',').forEach(evName => {
        validateEvent(moduleFile, evName, rawEventMeta, methodName, memberNode);
      });
    }
  });

  moduleFile.cmpMeta.eventsMeta = moduleFile.cmpMeta.eventsMeta.sort((a, b) => {
    if (a.eventName.toLowerCase() < b.eventName.toLowerCase()) return -1;
    if (a.eventName.toLowerCase() > b.eventName.toLowerCase()) return 1;
    if (a.eventMethodName.toLowerCase() < b.eventMethodName.toLowerCase()) return -1;
    if (a.eventMethodName.toLowerCase() > b.eventMethodName.toLowerCase()) return 1;
    return 0;
  });
}


function validateEvent(fileMeta: ModuleFile, eventName: string, rawEventMeta: EventMeta, methodName: string, memberNode: ts.ClassElement) {
  eventName = eventName.trim();
  if (!eventName) return;

  const eventMeta: EventMeta = Object.assign({}, rawEventMeta);

  eventMeta.eventMethodName = methodName;
  eventMeta.eventName = eventName;

  if (typeof eventMeta.eventName !== 'string') {
    eventMeta.eventName = eventMeta.eventMethodName;
  }

  if (eventMeta.eventBubbles === undefined) {
    // default to always bubble if not provided
    eventMeta.eventBubbles = true;
  }

  if (eventMeta.eventCancelable === undefined) {
    // default to always cancelable if not provided
    eventMeta.eventCancelable = true;
  }

  if (eventMeta.eventComposed === undefined) {
    // default to always composed if not provided
    // https://developer.mozilla.org/en-US/docs/Web/API/Event/composed
    eventMeta.eventComposed = true;
  }

  fileMeta.cmpMeta.eventsMeta.push(eventMeta);

  // gathered valid meta data
  // remove decorator entirely
  memberNode.decorators = undefined;
}
