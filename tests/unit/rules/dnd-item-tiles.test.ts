import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';

/**
 * An item tile never changes its item (docs/reference/drag-and-drop.md, "React API"). A tile whose item id
 * changed lost its draggable in dnd-kit and took no more drags (fixed in 176120b). So
 * lib/dnd/react.tsx makes the mistake impossible to write: the only export for item tiles is
 * DraggableTierItem, which renders the tile keyed by its item id, and the hook behind it is not
 * exported. The hook also throws a TypeError if its item id changes (assertSameTileItem, tested
 * in tests/unit/lib/dnd/ids.test.ts). These tests read the source with the TypeScript parser.
 */
const repoRoot = path.resolve(__dirname, '../../..');
const reactFile = path.join(repoRoot, 'lib/dnd/react.tsx');
const source = ts.createSourceFile(reactFile, fs.readFileSync(reactFile, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function isExported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

/** The names lib/dnd/react.tsx exports (functions, constants and types). */
function exportedNames(): string[] {
  const names: string[] = [];
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        names.push(...statement.exportClause.elements.map(element => element.name.text));
      }
    } else if (isExported(statement)) {
      if (ts.isVariableStatement(statement)) {
        names.push(...statement.declarationList.declarations.map(declaration => declaration.name.getText(source)));
      } else if ((ts.isFunctionDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) && statement.name) {
        names.push(statement.name.text);
      }
    }
  }
  return names;
}

function functionNamed(name: string): ts.FunctionDeclaration | undefined {
  return source.statements.find((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
}

/** Every node under `root` that passes `test`. */
function findAll<T extends ts.Node>(root: ts.Node, test: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => {
    if (test(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

/** The name of the function declaration a node sits in, or undefined at the top level. */
function enclosingFunction(node: ts.Node): string | undefined {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionDeclaration(parent)) return parent.name?.text;
  }
  return undefined;
}

function jsxElementsNamed(root: ts.Node, tag: string): ts.JsxSelfClosingElement[] {
  return findAll(root, ts.isJsxSelfClosingElement).filter(element => element.tagName.getText(source) === tag);
}

function keyOf(element: ts.JsxSelfClosingElement): string | undefined {
  const key = element.attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText(source) === 'key');
  return key?.initializer && ts.isJsxExpression(key.initializer) ? key.initializer.expression?.getText(source) : undefined;
}

describe('lib/dnd/react.tsx item tiles', () => {
  it('returns DraggableTierItem and no useTierItem or TierItemSortable when the exports of react.tsx are read', () => {
    const names = exportedNames();
    expect(names).toContain('DraggableTierItem');
    expect(names).not.toContain('useTierItem');
    expect(names).not.toContain('TierItemSortable');
  });

  it('returns one TierItemSortable keyed by itemId when DraggableTierItem is parsed', () => {
    const draggable = functionNamed('DraggableTierItem');
    expect(draggable, 'DraggableTierItem').toBeDefined();
    const tiles = jsxElementsNamed(draggable!, 'TierItemSortable');
    expect(tiles.map(keyOf)).toEqual(['itemId']);
    // The key is the item id it hands on, not another value.
    const itemIdAttribute = tiles[0].attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText(source) === 'itemId');
    expect(itemIdAttribute?.initializer?.getText(source)).toBe('{itemId}');
  });

  it('returns TierItemSortable only in DraggableTierItem and useTierItem only in TierItemSortable when react.tsx is parsed', () => {
    expect(jsxElementsNamed(source, 'TierItemSortable').map(enclosingFunction)).toEqual(['DraggableTierItem']);
    const hookCalls = findAll(source, ts.isCallExpression).filter(call => call.expression.getText(source) === 'useTierItem');
    expect(hookCalls.map(enclosingFunction)).toEqual(['TierItemSortable']);
  });

  it('returns one item sortable, in useTierItem, and an assertSameTileItem check before it when react.tsx is parsed', () => {
    const itemSortables = findAll(source, ts.isCallExpression)
      .filter(call => call.expression.getText(source) === 'useSortable' && call.arguments[0]?.getText(source).includes('itemDndId('));
    expect(itemSortables.map(enclosingFunction)).toEqual(['useTierItem']);
    const checks = findAll(functionNamed('useTierItem')!, ts.isCallExpression).filter(call => call.expression.getText(source) === 'assertSameTileItem');
    expect(checks.map(call => call.arguments.map(argument => argument.getText(source)))).toEqual([['firstItemId', 'itemId']]);
    expect(checks[0].getStart()).toBeLessThan(itemSortables[0].getStart());
  });
});
