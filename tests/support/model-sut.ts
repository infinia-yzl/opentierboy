import {createPlaywrightSut, PlaywrightOracleError, type PlaywrightSutConfig} from '@xstate/test/playwright';
import type {TestSut, TestSutSession} from '@xstate/test';
import type {AnyMachineSnapshot, EventObject} from 'xstate';
import type {ConsoleMessage, Page, Response} from '@playwright/test';
import {expectHydrated} from './hydrated';
import {bypassSecret} from './vercel-bypass';

async function pageStarted(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await expectHydrated(page);
}

export interface ModelSutConfig<TSnapshot extends AnyMachineSnapshot, TEvent extends EventObject>
  extends PlaywrightSutConfig<Page, TSnapshot, TEvent> {
  readonly pages?: () => readonly (Page | null | undefined)[];
}

const REJECTION_PREFIX = '[xstate-test] unhandledrejection: ';
const REJECTION_SCRIPT = `window.addEventListener('unhandledrejection', function (event) {
  var reason = event.reason;
  console.error(${JSON.stringify(REJECTION_PREFIX)} + (reason && reason.message ? reason.message : String(reason)));
});`;

function consoleReport(message: ConsoleMessage): string | null {
  const text = message.text();
  if (text.startsWith(REJECTION_PREFIX)) return `unhandledrejection: ${text.slice(REJECTION_PREFIX.length)}`;
  return message.type() === 'error' ? `console.error: ${text}` : null;
}

interface Watched {
  readonly page: Page;
  readonly label: string;
  readonly found: string[];
  readonly stop: () => void;
  tracing: boolean;
}

async function watchPage(page: Page, label: string, trace: boolean): Promise<Watched> {
  const found: string[] = [];
  const report = (text: string | null) => {
    if (text !== null) found.push(`${label}: ${text}`);
  };
  const onError = (error: Error) => report(`pageerror: ${error.message}`);
  const onConsole = (message: ConsoleMessage) => report(consoleReport(message));
  const onResponse = (response: Response) => {
    if (response.status() >= 400) report(`HTTP ${response.status()} ${response.request().method()} ${response.url()}`);
  };
  page.on('pageerror', onError);
  page.on('console', onConsole);
  page.on('response', onResponse);
  const watched: Watched = {
    page,
    label,
    found,
    tracing: false,
    stop: () => {
      page.off('pageerror', onError);
      page.off('console', onConsole);
      page.off('response', onResponse);
    },
  };
  await page.addInitScript(REJECTION_SCRIPT);
  (await page.pageErrors()).forEach(onError);
  (await page.consoleMessages()).forEach(onConsole);
  if (trace) {
    try {
      await page.context().tracing.start({screenshots: true, snapshots: true});
      watched.tracing = true;
    } catch {
    }
  }
  return watched;
}

function withOtherPages<TSnapshot extends AnyMachineSnapshot, TEvent extends EventObject>(
  sut: TestSut<TSnapshot, TEvent>,
  pages: () => readonly (Page | null | undefined)[],
  settle: (page: Page) => Promise<void>,
  {testInfo, trace}: Pick<ModelSutConfig<TSnapshot, TEvent>, 'testInfo' | 'trace'>,
): TestSut<TSnapshot, TEvent> {
  const keepTraces = testInfo !== undefined && trace !== 'off';
  let failedFiles: {name: string; path?: string; body?: Buffer; contentType: string}[] = [];
  return {
    ...sut,
    create: async (context) => {
      const session = await sut.create(context) as TestSutSession<TSnapshot, TEvent>;
      const watched = new Map<Page, Watched>();
      const open = () => pages().filter((page): page is Page => Boolean(page) && !page!.isClosed());
      const watchOpen = async () => {
        for (const page of open()) {
          if (!watched.has(page)) watched.set(page, await watchPage(page, `page ${watched.size + 2}`, keepTraces));
        }
      };
      return {
        ...session,
        settle: async () => {
          await session.settle?.();
          await watchOpen();
          for (const page of open()) await settle(page);
        },
        check: async () => {
          let messages: string[] = [];
          try {
            await session.check?.();
          } catch (error) {
            if ((error as {name?: string}).name !== 'PlaywrightOracleError') throw error;
            messages = [...(error as PlaywrightOracleError).messages];
          }
          for (const {found} of watched.values()) messages.push(...found.splice(0));
          if (messages.length > 0) throw new PlaywrightOracleError([...new Set(messages)]);
        },
        dispose: async (result) => {
          try {
            for (const {page, label, stop, tracing} of watched.values()) {
              stop();
              const name = label.replace(' ', '-');
              if (!result.passed && !page.isClosed()) {
                failedFiles.push({name: `failure-${name}.png`, body: await page.screenshot(), contentType: 'image/png'});
              }
              if (!tracing) continue;
              const path = result.passed ? undefined : testInfo!.outputPath(`xstate-test-failure-trace-${name}.zip`);
              const kept = await page.context().tracing.stop(path ? {path} : undefined).then(() => true, () => false);
              if (path && kept) failedFiles.push({name: `trace-${name}`, path, contentType: 'application/zip'});
            }
          } finally {
            await session.dispose?.(result);
          }
        },
      };
    },
    complete: async (result) => {
      await sut.complete?.(result);
      const files = failedFiles;
      failedFiles = [];
      if (result.passed || !testInfo) return;
      for (const {name, ...file} of files) await testInfo.attach(name, file);
    },
  };
}

export function modelSut<TSnapshot extends AnyMachineSnapshot, TEvent extends EventObject>(
  page: Page,
  {pages, ...config}: ModelSutConfig<TSnapshot, TEvent>,
): TestSut<TSnapshot, TEvent> {
  const trace = config.trace ?? (bypassSecret() ? 'off' : 'retain-on-failure');
  const sut = createPlaywrightSut<Page, TSnapshot, TEvent>(page, {
    settle: pageStarted,
    ...config,
    trace,
  });
  return pages ? withOtherPages(sut, pages, pageStarted, {testInfo: config.testInfo, trace}) : sut;
}
