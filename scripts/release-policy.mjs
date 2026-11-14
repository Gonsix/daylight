import ts from 'typescript';

/** Check executable syntax rather than disguising or rewriting vendor code. */
export function reviewReleasePolicy(javascript, css) {
  const failures = [];
  const source = ts.createSourceFile('main.js', javascript, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const literal = node => node && ts.isStringLiteralLike(node) ? node.text : null;
  const method = node => ts.isPropertyAccessExpression(node) ? node.name.text
    : ts.isElementAccessExpression(node) ? literal(node.argumentExpression) : null;
  const visit = node => {
    if (ts.isCallExpression(node)) {
      const name = method(node.expression);
      if ((name === 'createElement' && literal(node.arguments[0])?.toLowerCase() === 'script') ||
          (name === 'createElementNS' && literal(node.arguments[1])?.toLowerCase() === 'script')) {
        failures.push('Runtime script element creation is not permitted');
      }
      if (ts.isIdentifier(node.expression) && node.expression.text === 'eval') failures.push('Runtime eval is not permitted');
      if (['insertAdjacentHTML', 'write', 'writeln'].includes(name) && node.arguments.some(arg => /<script\b/i.test(literal(arg) ?? ''))) {
        failures.push('Runtime script markup injection is not permitted');
      }
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Function') {
      failures.push('Runtime Function construction is not permitted');
    }
    if (ts.isBinaryExpression(node) && method(node.left) === 'innerHTML' && /<script\b/i.test(literal(node.right) ?? '')) {
      failures.push('Runtime script markup injection is not permitted');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/!\s*important\b/i.test(declarations)) failures.push('CSS must use scoped specificity instead of !important');
  if (/(?:^|[;{])\s*(?:-webkit-)?clip-path\s*:/i.test(declarations)) failures.push('CSS must not rely on partially supported clip-path');
  return [...new Set(failures)];
}
