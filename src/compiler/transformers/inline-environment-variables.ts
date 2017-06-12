import * as ts from 'typescript';


export function inlineEnvironmentVariables(): ts.TransformerFactory<ts.SourceFile> {

  return (transformContext: ts.TransformationContext) => {

    let sourceFile: ts.SourceFile;

    function visit(node: ts.Node): ts.VisitResult<ts.Node> {
      switch (node.kind) {
        case ts.SyntaxKind.PropertyAccessExpression:
          const propertyPath = (<ts.PropertyAccessExpression>node).getText();
          if (propertyPath.indexOf('process.env.') === 0) {
            const envKey = propertyPath.replace('process.env.', '');
            return ts.createLiteral(process.env[envKey] || '');
          }
        default:
          return ts.visitEachChild(node, visit, transformContext);
      }
    }

    return (tsSourceFile) => {
      sourceFile = tsSourceFile;
      return visit(tsSourceFile) as ts.SourceFile;
    };
  };
}
