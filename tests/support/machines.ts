import * as fc from 'fast-check';
import type {TestInfo} from '@playwright/test';
import {assertTestCoverage, formatTestCoverage, formatTestCoverageHTML, propertyTest, testPaths, type TestCoverage} from '@xstate/test';
import type {createInspector} from '@statelyai/sdk';
import {createActor, type AnyStateMachine, type EventObject, type SnapshotFrom} from 'xstate';
import {getAdjacencyMap} from 'xstate/graph';
import {modelInspectOn} from './model-inspect';

/**
 * Helpers for the model-based tests (tests/README.md, "Model-based tests"): XState v6 machines in
 * tests/machines/, walked by @xstate/test 2.0 (testPaths, propertyTest) through the official
 * Playwright adapter (@xstate/test/playwright, createPlaywrightSut).
 *
 * A machine file exports a `MachineModel`: the machine, the event cases the tests send (the
 * `events` option of testPaths and propertyTest), and the bounds of its graph. To see a machine,
 * open its file in the Stately editor (tests/README.md, "Model-based tests").
 */

/**
 * The `events` option of testPaths and propertyTest: by event type, a fast-check generator, a
 * descriptor with `generate` (and `case`, `when`), or an array of them (README, "Events").
 * Typed as testPaths checks them in each spec; here only the generators are read.
 */
export type ModelEvents = Readonly<Record<string, unknown>>;

type EventCase = fc.Arbitrary<unknown> | {readonly generate: fc.Arbitrary<unknown>};

export interface MachineModel<TMachine extends AnyStateMachine = AnyStateMachine> {
  /** The machine file's name and the title of the coverage report, such as 'zen-layout'. */
  readonly id: string;
  readonly machine: TMachine;
  readonly events: ModelEvents;
  /** Bounds a graph whose context grows without end (testPaths' `stopWhen`). */
  readonly stopWhen?: (snapshot: SnapshotFrom<TMachine>) => boolean;
  /**
   * How the tests walk the machine, as the v6 guide advises: every simple path of a finite graph
   * (`testPaths`), or seeded random sequences for a graph too large to walk (`propertyTest`).
   * The walk must reach every state node and transition (attachAndAssertCoverage).
   */
  readonly walk: {readonly paths: 'simple'} | {readonly property: PropertyWalk};
  /**
   * A short seeded propertyTest after the walk, for revisits that simple paths skip (a state
   * entered a second time, such as Zen turned off and on again). Omit when `walk` is a property walk.
   */
  readonly revisits?: PropertyWalk;
}

/** The options of a seeded propertyTest run. */
export interface PropertyWalk {
  readonly seed: number;
  readonly numRuns: number;
  readonly maxCommands: number;
}

/**
 * testPaths and propertyTest, with their options untyped: a model's events and sut follow its own
 * machine's types, which this shared helper does not know. Each spec still types its sut.
 */
type Walker = (machine: unknown, options: Record<string, unknown>) => Promise<{coverage: TestCoverage}>;
const runPaths = testPaths as unknown as Walker;
const runProperty = propertyTest as unknown as Walker;

/**
 * WebKit's page error for a Next.js link prefetch (an `?_rsc=` request) that a navigation cut
 * off, such as `/127.0.0.1:3000/blog?_rsc=Zhvt… due to access control checks.` A run's `reset`
 * opens a new page while the old page still prefetches its links (CI, PR #236).
 */
const ABORTED_PREFETCH = /\?_rsc=[^\s]+ due to access control checks\.$/;

interface SutSession {
  check?: () => unknown;
}

/**
 * The sut, with its page oracles (createPlaywrightSut's `check`, README "Oracles") passing over
 * aborted-prefetch errors only: a failure that lists any other message still fails the step.
 */
export function ignoringAbortedPrefetches<TSut>(sut: TSut): TSut {
  const {create} = sut as {create: (...args: unknown[]) => unknown};
  return {
    ...sut,
    create: async (...args: unknown[]) => {
      const session = await create(...args) as SutSession;
      const check = session.check;
      if (!check) return session;
      return {
        ...session,
        check: async () => {
          try {
            await check.call(session);
          } catch (error) {
            const {name, messages} = error as {name?: string; messages?: readonly string[]};
            const noise = name === 'PlaywrightOracleError' && messages && messages.length > 0
              && messages.every((message) => ABORTED_PREFETCH.test(message));
            if (!noise) throw error;
          }
        },
      };
    },
  };
}

type Inspector = ReturnType<typeof createInspector>;
/** This worker's inspector: undefined until the first walk asks, null when it is off or failed. */
let workerInspector: Inspector | null | undefined;

/**
 * Stately's hosted inspector (@statelyai/sdk, createInspector), one per worker, in a local run
 * with MODEL_INSPECT=1 (tests/support/model-inspect.ts). The SDK prints its private link. If
 * it cannot connect, the walk runs without it.
 */
async function liveInspector(): Promise<Inspector | null> {
  if (!modelInspectOn) return null;
  if (workerInspector !== undefined) return workerInspector;
  // Loaded only when the inspector is on. The SDK is an ES module only, which Playwright's
  // CommonJS test files reach with import().
  const sdk = await import('@statelyai/sdk');
  const inspector = sdk.createInspector({launch: 'none', name: 'OpenTierBoy model tests'});
  try {
    await inspector.ready; // the SDK prints the private link: "[Stately Inspector] <link>"
    workerInspector = inspector;
  } catch (error) {
    console.warn(`The Stately inspector did not connect, so this run is not inspected: ${String(error)}`);
    workerInspector = null;
  }
  return workerInspector;
}

interface SendingSession {
  send: (event: EventObject, context: unknown) => unknown;
  dispose?: (result: unknown) => unknown;
}

/**
 * The sut, with each run mirrored on a live actor of the model's machine: after the page
 * performs an event, the actor takes the same event, so the inspector shows the machine moving
 * in step with the page. Without the inspector, the sut as it is.
 */
async function withLiveInspector<TSut>(model: MachineModel, sut: TSut): Promise<TSut> {
  const inspector = await liveInspector();
  if (!inspector) return sut;
  const {create} = sut as {create: (...args: unknown[]) => unknown};
  return {
    ...sut,
    create: async (...args: unknown[]) => {
      const session = await create(...args) as SendingSession;
      const actor = createActor(model.machine, {inspect: inspector.inspect});
      actor.start();
      return {
        ...session,
        send: async (event: EventObject, context: unknown) => {
          await session.send(event, context);
          actor.send(event);
        },
        dispose: async (result: unknown) => {
          actor.stop();
          await session.dispose?.(result);
        },
      };
    },
  };
}

/** The sut as every walk runs it: aborted prefetches passed over, and the live inspector when on. */
async function walkSut(model: MachineModel, sut: unknown): Promise<unknown> {
  return withLiveInspector(model, ignoringAbortedPrefetches(sut));
}

/** Runs the model's walk against `sut`, and resolves with its coverage. */
export async function walkModel(model: MachineModel, sut: unknown): Promise<TestCoverage> {
  const shared = {events: model.events, sut: await walkSut(model, sut), ...(model.stopWhen ? {stopWhen: model.stopWhen} : {})};
  if ('paths' in model.walk) {
    const {coverage} = await runPaths(model.machine, {...shared, pathGenerator: model.walk.paths, samples: 1});
    return coverage;
  }
  const {coverage} = await runProperty(model.machine, {...shared, ...model.walk.property});
  return coverage;
}

/** Runs the model's `revisits` run against `sut`, when it has one. */
export async function walkRevisits(model: MachineModel, sut: unknown): Promise<TestCoverage | null> {
  if (!model.revisits) return null;
  const {coverage} = await runProperty(model.machine, {events: model.events, sut: await walkSut(model, sut), ...model.revisits, frontiers: 'auto'});
  return coverage;
}

/**
 * The time limit of one model campaign. A campaign opens the list once per path or run (about
 * 2.5 s each on Chromium, alone), and Firefox, WebKit and busy CI runners are slower.
 */
export const MODEL_CAMPAIGN_TIMEOUT = 360_000;

/** Ties a machine file's model to its machine's types. */
export function defineModel<TMachine extends AnyStateMachine>(model: MachineModel<TMachine>): MachineModel<TMachine> {
  return Object.freeze(model);
}

/** The concrete events of every event case: one sample each, with a fixed seed (for getAdjacencyMap). */
export function sampleEvents(events: ModelEvents): EventObject[] {
  return Object.entries(events).flatMap(([type, cases]) => {
    const list = (Array.isArray(cases) ? cases : [cases]) as readonly EventCase[];
    return list.map((entry) => {
      const generator = fc.Arbitrary.prototype.isPrototypeOf(entry)
        ? (entry as fc.Arbitrary<unknown>)
        : (entry as {generate: fc.Arbitrary<unknown>}).generate;
      const [payload] = fc.sample(generator, {numRuns: 1, seed: 1});
      return {...(payload as object), type};
    });
  });
}

/** A state value as JSON with its keys sorted, so two spellings of one state compare equal. */
function canonicalState(value: unknown): string {
  const sorted = (node: unknown): unknown => (typeof node === 'string'
    ? node
    : Object.fromEntries(Object.keys(node as object).sort().map((key) => [key, sorted((node as Record<string, unknown>)[key])])));
  return JSON.stringify(sorted(value));
}

/**
 * Every state the machine can reach with the model's events, as canonical JSON state values:
 * xstate/graph's getAdjacencyMap runs every transition, so transition functions (v6 guards)
 * count too.
 */
export function reachableStates(model: MachineModel): string[] {
  const adjacency = getAdjacencyMap(model.machine, {
    events: sampleEvents(model.events),
    ...(model.stopWhen ? {stopWhen: model.stopWhen} : {}),
  });
  return [...new Set(Object.values(adjacency).map(({state}) => canonicalState(state.value)))].sort();
}

/**
 * Fails unless the walk took every state node, transition and reachable state.
 * - assertTestCoverage counts only covered and uncovered ids.
 * - A transition whose target a function computes (every v6 guard) stays "unknown" until a run
 *   takes it, so unknown transitions fail too, as the official model-based-testing example
 *   checks (`coverage.transitions.unknown` is empty).
 * - The states dimension lists only the states the runs entered, so a state no run reached is
 *   missing from it without being "uncovered". Every reachable state must be covered.
 */
export function assertFullCoverage(model: MachineModel, coverage: TestCoverage) {
  assertTestCoverage(coverage, {stateNodes: 1, transitions: 1});
  const problems: string[] = [];
  if (coverage.transitions.unknown.length > 0) {
    problems.push(`no run took these transitions: ${coverage.transitions.unknown.join(', ')}`);
  }
  const covered = new Set(coverage.states.covered.map((id) => canonicalState(JSON.parse(id))));
  const missed = reachableStates(model).filter((state) => !covered.has(state));
  if (missed.length > 0) problems.push(`no run entered these reachable states: ${missed.join(', ')}`);
  if (problems.length > 0) {
    throw new Error(`The walk of ${model.id} is incomplete: ${problems.join('; ')}\n${formatTestCoverage(coverage)}`);
  }
}

/**
 * Attaches the coverage report to the Playwright report (formatTestCoverageHTML and the text of
 * formatTestCoverage), then fails the test unless the run took every state node and transition.
 */
export async function attachAndAssertCoverage(testInfo: TestInfo, model: MachineModel, coverage: TestCoverage) {
  await testInfo.attach(`${model.id}-coverage.html`, {
    body: formatTestCoverageHTML(coverage, {title: model.machine.id}),
    contentType: 'text/html',
  });
  await testInfo.attach(`${model.id}-coverage.md`, {
    body: formatTestCoverage(coverage, {format: 'markdown'}),
    contentType: 'text/markdown',
  });
  assertFullCoverage(model, coverage);
}
