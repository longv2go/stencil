import { catchError } from '../../util';
import { ModuleFile, Diagnostic, PropMeta, PropsMeta, PropOptions } from '../../../util/interfaces';
import { TYPE_NUMBER, TYPE_BOOLEAN } from '../../../util/constants';
import * as ts from 'typescript';


export function getPropDecoratorMeta(moduleFile: ModuleFile, diagnostics: Diagnostic[], classNode: ts.ClassDeclaration) {
  const propsMeta: PropsMeta = {};

  const decoratedMembers = classNode.members.filter(n => n.decorators && n.decorators.length);

  decoratedMembers.forEach(memberNode => {
    let isProp = false;
    let propName: string = null;
    let propType: number = null;
    let ctrlTag: string = null;
    let userPropOptions: PropOptions = null;
    let shouldObserveAttribute = false;

    memberNode.forEachChild(n => {
      if (n.kind === ts.SyntaxKind.Decorator && n.getChildCount() > 1) {
        const child = n.getChildAt(1);
        const firstToken = child.getFirstToken();

        // If the first token is @State()
        if (firstToken && firstToken.getText() === 'Prop') {
          isProp = true;

        } else if (!firstToken && child.getText() === 'Prop') {
          // If the first token is @State
          isProp = true;
        }

        if (!isProp) return;

        n.getChildAt(1).forEachChild(n => {
          if (n.kind === ts.SyntaxKind.StringLiteral) {
            // @Prop('ion-animation-ctrl') animationCtrl: Animation;
            ctrlTag = n.getText();
            shouldObserveAttribute = false;

          } else if (n.kind === ts.SyntaxKind.ObjectLiteralExpression) {
            try {
              const fnStr = `return ${n.getText()};`;
              userPropOptions = Object.assign(userPropOptions || {}, new Function(fnStr)());

            } catch (e) {
              const d = catchError(diagnostics, e);
              d.messageText = `parse prop options: ${e}`;
              d.absFilePath = moduleFile.tsFilePath;
            }
          }
        });

      } else if (isProp) {
        if (n.kind === ts.SyntaxKind.Identifier && !propName) {
          propName = n.getText();

        } else if (!propType) {
          if (n.kind === ts.SyntaxKind.BooleanKeyword) {
            // @Prop() myBoolean: boolean;
            propType = TYPE_BOOLEAN;
            shouldObserveAttribute = true;

          } else if (n.kind === ts.SyntaxKind.NumberKeyword) {
            // @Prop() myNumber: number;
            propType = TYPE_NUMBER;
            shouldObserveAttribute = true;

          } else if (n.kind === ts.SyntaxKind.StringKeyword) {
            // @Prop() myString: string;
            shouldObserveAttribute = true;

          } else if (n.kind === ts.SyntaxKind.AnyKeyword) {
            // @Prop() myAny: any;
            shouldObserveAttribute = true;
          }
        }

      }

    });

    if (isProp && propName) {
      const propMeta: PropMeta = moduleFile.cmpMeta.propsMeta[propName] = {};

      if (propType) {
        propMeta.propType = propType;
      }

      if (userPropOptions) {
        if (typeof userPropOptions.type === 'string') {
          userPropOptions.type = userPropOptions.type.toLowerCase().trim();

          if (userPropOptions.type === 'boolean') {
            propMeta.propType = TYPE_BOOLEAN;

          } else if (userPropOptions.type === 'number') {
            propMeta.propType = TYPE_NUMBER;
          }
        }

        if (typeof userPropOptions.state === 'boolean') {
          propMeta.isStateful = !!userPropOptions.state;
        }

        if (shouldObserveAttribute) {
          propMeta.attribName = propName;
        }

      } else if (ctrlTag) {
        propMeta.ctrlTag = ctrlTag;
      }

      memberNode.decorators = undefined;
    }
  });

  moduleFile.cmpMeta.propsMeta = {};

  const propNames = Object.keys(propsMeta).sort((a, b) => {
    if (a.toLowerCase() < b.toLowerCase()) return -1;
    if (a.toLowerCase() > b.toLowerCase()) return 1;
    return 0;
  });

  propNames.forEach(propName => {
    moduleFile.cmpMeta.propsMeta[propName] = propsMeta[propName];
  });
}
