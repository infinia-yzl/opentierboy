import {createPlaywrightSut, type PlaywrightSutConfig} from '@xstate/test/playwright';
import {initialTransition, transition, type AnyMachineSnapshot, type AnyStateMachine, type EventObject} from 'xstate';
import type {Page} from '@playwright/test';
import {expectSettled} from './settled';
import {bypassSecret} from './vercel-bypass';

/** Waits until the page has loaded and has finished what the last step started (expectSettled). */
export async function pageSettled(page: Page) {
  await page.waitForLoadState('load');
  await expectSettled(page);
}

/**
 * The states of a machine in which the page is busy on purpose, such as a drag in progress or a
 * list that waits for a held server answer: there a step has finished once the page has loaded.
 */
export interface BusyStates<TSnapshot extends AnyMachineSnapshot> {
  readonly machine: AnyStateMachine;
  readonly busyIn: (snapshot: TSnapshot) => boolean;
}

/**
 * createPlaywrightSut (@xstate/test/playwright) as every model's Playwright test uses it:
 * - `settle`: before each check the page has finished what the step started (pageSettled), so a
 *   check never looks at a page halfway through a change. With `busy`, the sut follows the
 *   machine (xstate's initialTransition and transition) and, in a state where the page is busy
 *   on purpose, waits only for the page to load.
 * - `trace`: the trace of a failing run, unless the tests run with the Vercel bypass secret,
 *   which a trace would record (playwright.config.ts).
 */
export function modelSut<TSnapshot extends AnyMachineSnapshot, TEvent extends EventObject>(
  page: Page,
  config: PlaywrightSutConfig<Page, TSnapshot, TEvent>,
  busy?: BusyStates<TSnapshot>,
) {
  if (!busy) {
    return createPlaywrightSut<Page, TSnapshot, TEvent>(page, {
      settle: pageSettled,
      trace: bypassSecret() ? 'off' : 'retain-on-failure',
      ...config,
    });
  }
  const {machine, busyIn} = busy;
  let current = initialTransition(machine)[0] as TSnapshot;
  const events = Object.fromEntries(Object.entries(config.events).map(([type, action]) => [
    type,
    async (target: Page, event: TEvent) => {
      await (action as (page: Page, event: TEvent) => void | Promise<void>)(target, event);
      current = transition(machine, current, event)[0] as TSnapshot;
    },
  ])) as unknown as PlaywrightSutConfig<Page, TSnapshot, TEvent>['events'];
  return createPlaywrightSut<Page, TSnapshot, TEvent>(page, {
    trace: bypassSecret() ? 'off' : 'retain-on-failure',
    ...config,
    reset: async (target) => {
      current = initialTransition(machine)[0] as TSnapshot;
      await config.reset?.(target);
    },
    events,
    settle: (target) => (busyIn(current) ? target.waitForLoadState('load') : pageSettled(target)),
  });
}
