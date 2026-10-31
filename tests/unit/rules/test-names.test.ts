import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';

/**
 * The naming rules of tests/README.md ("Test names" and "Where a test goes"):
 * - every test name has the form `<verb> <result> when <condition>`, with the verb returns,
 *   throws, writes or renders;
 * - no name uses a banned word, and no name has over 120 characters;
 * - each end-to-end spec file has one top-level describe, named after the area of the file,
 *   and every test sits inside it.
 * The names are read with the TypeScript parser, so a name split over lines or written as a
 * template string is read like any other. A name must be a string or template literal. The
 * check reads placeholders (%s, ${…}) as they are written: the values a table or a loop puts
 * in them are code values. test.step titles describe steps inside a test and are not checked.
 */
const repoRoot = path.resolve(__dirname, '../../..');

const VERBS = new Set(['returns', 'throws', 'writes', 'renders']);
/**
 * Vague verbs, in every form, and vague adverbs. "given" stays allowed in conditions ("when
 * given a v3 link"), and "handle" as a noun is a UI name ("row handle").
 */
const BANNED = /\b(carry|carries|carried|carrying|keep|keeps|kept|keeping|hold|holds|held|holding|give|gives|gave|giving|bring|brings|brought|bringing|show|shows|showed|shown|showing|work|works|worked|working|handles|handled|handling|correctly|properly|should|always)\b/i;
/** Code in a name, such as kind: 'hold' or {moved: [], kept: 0}: the banned words do not apply to it. */
const CODE = /'[\w.-]+'|\{[^{}]*\}/g;

type Found = {line: number; kind: 'test' | 'describe'; name: string | undefined; topLevel: boolean};

/** The text of a string or template literal, with each placeholder as ${…}. Undefined for other expressions. */
function literalText(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((span) => '${…}' + span.literal.text).join('');
  return undefined;
}

/** Words between the test function and its call that change how it runs: test.describe.serial.only, it.skipIf(x). */
const MODIFIERS = new Set(['only', 'skip', 'fixme', 'fail', 'fails', 'concurrent', 'sequential', 'todo', 'skipIf', 'runIf', 'each', 'for', 'serial', 'parallel', 'describe']);
/** Modifiers that, called with a condition in place of a name, mark the current test or group (test.skip(condition, reason)). */
const CONDITION_MODIFIERS = new Set(['skip', 'fixme', 'fail', 'slow']);

/** The callee as a list of names: `it.each(table)` is ['it', 'each'], `test.describe.skip` is ['test', 'describe', 'skip']. */
function calleePath(expression: ts.Expression): string[] | undefined {
  if (ts.isIdentifier(expression)) return [expression.text];
  if (ts.isPropertyAccessExpression(expression)) {
    const left = calleePath(expression.expression);
    return left && [...left, expression.name.text];
  }
  if (ts.isCallExpression(expression)) return calleePath(expression.expression);
  return undefined;
}

/**
 * Every test and describe in a file. A call counts when its callee is it, test or describe,
 * followed only by MODIFIERS, and it has at least two arguments. `test.skip(condition, reason)`
 * and the like mark a test, so they count only with a literal name.
 */
function findNames(fileName: string, source: string): Found[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const found: Found[] = [];
  const visit = (node: ts.Node, depth: number) => {
    let inner = depth;
    if (ts.isCallExpression(node)) {
      const path = calleePath(node.expression);
      const [root, ...rest] = path ?? [];
      const isTestFunction = (root === 'it' || root === 'test' || root === 'describe') && rest.every((word) => MODIFIERS.has(word));
      const name = node.arguments[0] && literalText(node.arguments[0]);
      const marksATest = rest.length === 1 && CONDITION_MODIFIERS.has(rest[0]) && name === undefined;
      if (isTestFunction && node.arguments.length >= 2 && !marksATest) {
        const kind = root === 'describe' || rest.includes('describe') ? 'describe' : 'test';
        found.push({line: file.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind, name, topLevel: depth === 0});
        inner = depth + 1;
      }
    }
    ts.forEachChild(node, (child) => visit(child, inner));
  };
  visit(file, 0);
  return found;
}

/** The area of an end-to-end file: drag-and-drop.spec.ts is "drag and drop", link-previews.api.spec.ts is "link previews". */
function areaOf(fileName: string): string {
  return path.posix.basename(fileName).replace(/(\.api)?\.spec\.ts$/, '').replaceAll('-', ' ');
}

/** The rule breaks in one file, one line each. */
function ruleBreaks(fileName: string, source: string): string[] {
  const names = findNames(fileName, source);
  const breaks: string[] = [];
  for (const {line, kind, name} of names) {
    const where = `${fileName}:${line}`;
    if (name === undefined) {
      breaks.push(`${where} has a ${kind} name that is not a string or template literal`);
      continue;
    }
    if (kind === 'test') {
      const verb = name.split(' ')[0];
      if (!VERBS.has(verb)) breaks.push(`${where} starts with "${verb}", an unapproved verb: ${name}`);
      const when = name.indexOf(' when ');
      if (when === -1) breaks.push(`${where} has no "when" condition: ${name}`);
      else if (when <= verb.length) breaks.push(`${where} has no result between "${verb}" and "when": ${name}`);
    }
    if (name.length > 120) breaks.push(`${where} has ${name.length} characters, over 120: ${name}`);
    const banned = name.replace(CODE, '').match(BANNED);
    if (banned) breaks.push(`${where} uses the banned word "${banned[0]}": ${name}`);
  }
  if (fileName.startsWith('tests/e2e/')) {
    const top = names.filter((found) => found.topLevel);
    if (top.length !== 1 || top[0].kind !== 'describe') {
      breaks.push(`${fileName} has ${top.length} top-level blocks (${top.map((found) => `${found.kind} at line ${found.line}`).join(', ')}); it needs one top-level describe`);
    } else if (top[0].name !== areaOf(fileName)) {
      breaks.push(`${fileName}:${top[0].line} names its top-level describe "${top[0].name}"; the area of the file is "${areaOf(fileName)}"`);
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
  "  it('throws when the input is empty', () => {});",
  "  it('returns the user\\'s list when it was shown', () => {});",
  "  it(name, () => {});",
  "  it('returns 1 when the input is 1', check);",
  "  it.skipIf(true)('returns the value kept when the input is 1', () => {});",
  "  test.skip(isMobile, 'Touch only');",
  '});',
].join('\n');

describe('test names', () => {
  it('returns a break for each unapproved verb, missing condition and banned word when given a probe file', () => {
    expect(ruleBreaks('tests/unit/probe.test.ts', PROBE)).toEqual([
      'tests/unit/probe.test.ts:3 starts with "keeps", an unapproved verb: keeps the value when the input is 1',
      'tests/unit/probe.test.ts:3 uses the banned word "keeps": keeps the value when the input is 1',
      'tests/unit/probe.test.ts:4 has no "when" condition: returns the value',
      'tests/unit/probe.test.ts:5 uses the banned word "holds": renders %s when the list holds it',
      'tests/unit/probe.test.ts:8 has no result between "throws" and "when": throws when the input is empty',
      'tests/unit/probe.test.ts:9 uses the banned word "shown": returns the user\'s list when it was shown',
      'tests/unit/probe.test.ts:10 has a test name that is not a string or template literal',
      'tests/unit/probe.test.ts:12 uses the banned word "kept": returns the value kept when the input is 1',
    ]);
  });

  it('returns a break when an end-to-end file has two top-level describes or a test outside a describe', () => {
    const twoDescribes = "test.describe('probe', () => {});\ntest.describe('b', () => {});";
    const looseTest = "test.describe('probe', () => {});\ntest('renders 1 when the page opens', async () => {});";
    expect(ruleBreaks('tests/e2e/probe.spec.ts', twoDescribes)).toEqual([
      'tests/e2e/probe.spec.ts has 2 top-level blocks (describe at line 1, describe at line 2); it needs one top-level describe',
    ]);
    expect(ruleBreaks('tests/e2e/probe.spec.ts', looseTest)).toEqual([
      'tests/e2e/probe.spec.ts has 2 top-level blocks (describe at line 1, test at line 2); it needs one top-level describe',
    ]);
  });

  it('returns a break when the top-level describe of an end-to-end file differs from the area of the file', () => {
    expect(ruleBreaks('tests/e2e/drag-and-drop.spec.ts', "test.describe('Ranking items', () => {});")).toEqual([
      'tests/e2e/drag-and-drop.spec.ts:1 names its top-level describe "Ranking items"; the area of the file is "drag and drop"',
    ]);
    expect(ruleBreaks('tests/e2e/link-previews.api.spec.ts', "test.describe('link previews', () => {});")).toEqual([]);
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
