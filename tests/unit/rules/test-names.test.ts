import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';

/**
 * The naming rules of tests/README.md ("Test names" and "Where a test goes"):
 * - every test name has the form `<verb> <result> when <condition>`, with the verb returns,
 *   throws, writes or renders;
 * - no name uses a banned word;
 * - each end-to-end spec file has one top-level describe, and every test sits inside it.
 * The names are read with the TypeScript parser, so a name split over lines or written as a
 * template string is read like any other.
 */
const repoRoot = path.resolve(__dirname, '../../..');

const VERBS = new Set(['returns', 'throws', 'writes', 'renders']);
const BANNED = /\b(carry|carries|keep|keeps|hold|holds|give|gives|bring|brings|show|shows|works|handles|correctly|properly|should|always)\b/i;
/** Code values in quotes, such as kind: 'hold', are code names: the banned words do not apply to them. */
const QUOTED_CODE = /'[^']*'/g;

type Found = {line: number; kind: 'test' | 'describe'; name: string; topLevel: boolean};

/** The text of a string or template literal, with each placeholder as ${…}. */
function literalText(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((span) => '${…}' + span.literal.text).join('');
  return undefined;
}

const TEST_CALLEES = new Set(['it', 'test', 'it.only', 'it.skip', 'it.fails', 'it.concurrent', 'test.only', 'test.skip', 'test.fixme', 'test.fail']);
const DESCRIBE_CALLEES = new Set(['describe', 'test.describe', 'describe.skip', 'describe.only', 'test.describe.serial', 'test.describe.parallel']);

/** `it`, `test.describe`, and the call in `it.each(table)` as `it.each`. */
function calleeName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    const left = calleeName(expression.expression);
    return left === undefined ? undefined : `${left}.${expression.name.text}`;
  }
  if (ts.isCallExpression(expression)) return calleeName(expression.expression);
  return undefined;
}

/** Every test and describe in a file: a call to a test function with a name and a callback. */
function findNames(fileName: string, source: string): Found[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const found: Found[] = [];
  const visit = (node: ts.Node, depth: number) => {
    let inner = depth;
    if (ts.isCallExpression(node)) {
      const callee = calleeName(node.expression)?.replace(/\.each$/, '');
      const name = node.arguments[0] && literalText(node.arguments[0]);
      const hasCallback = node.arguments.slice(1).some((argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument));
      if (callee && name !== undefined && hasCallback && (TEST_CALLEES.has(callee) || DESCRIBE_CALLEES.has(callee))) {
        const kind = DESCRIBE_CALLEES.has(callee) ? 'describe' : 'test';
        found.push({line: file.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind, name, topLevel: depth === 0});
        inner = depth + 1;
      }
    }
    ts.forEachChild(node, (child) => visit(child, inner));
  };
  visit(file, 0);
  return found;
}

/** The rule breaks in one file, one line each. */
function ruleBreaks(fileName: string, source: string): string[] {
  const names = findNames(fileName, source);
  const breaks: string[] = [];
  for (const {line, kind, name} of names) {
    const where = `${fileName}:${line}`;
    if (kind === 'test') {
      const verb = name.split(' ')[0];
      if (!VERBS.has(verb)) breaks.push(`${where} starts with "${verb}", an unapproved verb: ${name}`);
      if (!name.includes(' when ')) breaks.push(`${where} has no "when" condition: ${name}`);
    }
    const banned = name.replace(QUOTED_CODE, '').match(BANNED);
    if (banned) breaks.push(`${where} uses the banned word "${banned[0]}": ${name}`);
  }
  if (fileName.startsWith('tests/e2e/')) {
    const top = names.filter((found) => found.topLevel);
    if (top.length !== 1 || top[0].kind !== 'describe') {
      breaks.push(`${fileName} has ${top.length} top-level blocks (${top.map((found) => `${found.kind} at line ${found.line}`).join(', ')}); it needs one top-level describe`);
    }
  }
  return breaks;
}

function testFiles(folder: string): string[] {
  return fs.readdirSync(path.join(repoRoot, folder), {recursive: true, encoding: 'utf8'})
    .filter((file) => /\.(test|spec)\.ts$/.test(file))
    .map((file) => path.posix.join(folder, file.split(path.sep).join('/')))
    .sort();
}

const PROBE = [
  "describe('probe', () => {",
  "  it('returns 1 when the input is 1', () => {});",
  "  it('keeps the value when the input is 1', () => {});",
  "  it('returns the value', () => {});",
  "  it.each([1])('renders %s when the list holds it', () => {});",
  "  it(`throws for ${'x'} when called`, () => {});",
  "  it('returns {kind: \\'hold\\'} when the pointer is touch', () => {});",
  '});',
].join('\n');

describe('test names', () => {
  it('returns a break for each unapproved verb, missing condition and banned word when given a probe file', () => {
    expect(ruleBreaks('tests/unit/probe.test.ts', PROBE)).toEqual([
      'tests/unit/probe.test.ts:3 starts with "keeps", an unapproved verb: keeps the value when the input is 1',
      'tests/unit/probe.test.ts:3 uses the banned word "keeps": keeps the value when the input is 1',
      'tests/unit/probe.test.ts:4 has no "when" condition: returns the value',
      'tests/unit/probe.test.ts:5 uses the banned word "holds": renders %s when the list holds it',
    ]);
  });

  it('returns a break when an end-to-end file has two top-level describes or a test outside a describe', () => {
    const twoDescribes = "test.describe('a', () => {});\ntest.describe('b', () => {});";
    const looseTest = "test.describe('a', () => {});\ntest('renders 1 when the page opens', async () => {});";
    expect(ruleBreaks('tests/e2e/probe.spec.ts', twoDescribes)).toEqual([
      'tests/e2e/probe.spec.ts has 2 top-level blocks (describe at line 1, describe at line 2); it needs one top-level describe',
    ]);
    expect(ruleBreaks('tests/e2e/probe.spec.ts', looseTest)).toEqual([
      'tests/e2e/probe.spec.ts has 2 top-level blocks (describe at line 1, test at line 2); it needs one top-level describe',
    ]);
  });

  it('returns a describe inside a for loop as top level when the loop is at the top of the file', () => {
    const source = "for (const mode of ['a']) {\n  test.describe(`mode ${mode}`, () => {\n    test('renders 1 when the page opens', async () => {});\n  });\n}";
    expect(findNames('tests/e2e/probe.spec.ts', source).map(({kind, topLevel}) => ({kind, topLevel}))).toEqual([
      {kind: 'describe', topLevel: true},
      {kind: 'test', topLevel: false},
    ]);
  });

  it('returns no rule break when given every test file of the repository', () => {
    const files = [...testFiles('tests/unit'), ...testFiles('tests/e2e')];
    expect(files.length).toBeGreaterThan(90);
    const breaks = files.flatMap((file) => ruleBreaks(file, fs.readFileSync(path.join(repoRoot, file), 'utf8')));
    expect(breaks).toEqual([]);
  });
});
