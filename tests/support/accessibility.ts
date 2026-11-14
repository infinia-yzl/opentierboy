import AxeBuilder from '@axe-core/playwright';
import type {Page} from '@playwright/test';
import {expectSettled} from './settled';

/** The rules of WCAG 2.1, levels A and AA, as axe-core tags them. */
export const WCAG_21_AA_TAGS: readonly string[] = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** One rule that some elements break, as a failing test prints it. */
export interface AxeViolation {
  /** The axe-core rule id, such as 'color-contrast'. Its page: https://dequeuniversity.com/rules/axe/ */
  readonly rule: string;
  readonly impact: string | null;
  /** What the rule asks for, in one line. */
  readonly help: string;
  /** Each element that breaks it: the CSS path axe-core makes, then its opening tag (long values cut). */
  readonly elements: readonly string[];
}

/** An open violation, by its rule and the elements it names (matched against AxeViolation.elements). */
export interface KnownViolation {
  readonly rule: string;
  readonly element: RegExp;
}

/**
 * Waits until the page is still, then scans it with axe-core for the WCAG 2.1 A and AA rules.
 * Still means: the page is not busy (`aria-busy` on <main>), its fonts have loaded, and every
 * animation that ends has ended (motion is reduced in the tests, so most take no time). An
 * open dialog or menu is scanned as the page shows it, with the page behind it hidden.
 */
export async function scanForViolations(page: Page): Promise<AxeViolation[]> {
  await expectSettled(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
    const ending = document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
    await Promise.all(ending.map((animation) => animation.finished.catch(() => undefined)));
  });
  const results = await new AxeBuilder({page}).withTags([...WCAG_21_AA_TAGS]).analyze();
  return results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact ?? null,
    help: violation.help,
    elements: violation.nodes.map((node) => `${node.target.map(String).join(' ')}: ${node.html}`),
  }));
}

/** True when a known violation names this element of a violation of `rule`. */
const isKnown = (known: readonly KnownViolation[], rule: string, element: string) =>
  known.some((entry) => entry.rule === rule && entry.element.test(element));

/** The violations of one known violation's rule, each with only the elements it names. */
export function violationsOf(violations: readonly AxeViolation[], known: KnownViolation): AxeViolation[] {
  return violations
    .map((violation) => ({...violation, elements: violation.elements.filter((element) => isKnown([known], violation.rule, element))}))
    .filter((violation) => violation.elements.length > 0);
}

/** The violations left when the elements of the known violations are taken out. */
export function violationsBesides(violations: readonly AxeViolation[], known: readonly KnownViolation[]): AxeViolation[] {
  return violations
    .map((violation) => ({...violation, elements: violation.elements.filter((element) => !isKnown(known, violation.rule, element))}))
    .filter((violation) => violation.elements.length > 0);
}
