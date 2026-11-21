import AxeBuilder from '@axe-core/playwright';
import type {Page} from '@playwright/test';
import {expectHydrated} from './hydrated';

export const WCAG_21_AA_TAGS: readonly string[] = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export interface AxeViolation {
  readonly rule: string;
  readonly impact: string | null;
  readonly help: string;
  readonly elements: readonly string[];
}

export async function scanForViolations(page: Page): Promise<AxeViolation[]> {
  await expectHydrated(page);
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
