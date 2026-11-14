import * as fc from 'fast-check';
import type {TestInfo} from '@playwright/test';
import {assertTestCoverage, formatTestCoverage, formatTestCoverageHTML, testPaths, type TestCoverage} from '@xstate/test';
import type {createInspector} from '@statelyai/sdk';
import {createActor, initialTransition, transition, type AnyMachineSnapshot, type AnyStateMachine, type EventObject} from 'xstate';
import {getAdjacencyMap, getPathsFromEvents, type AdjacencyValue} from 'xstate/graph';
import {modelInspectOn} from './model-inspect';

/**
 * Helpers for the model-based tests (tests/README.md, "Model-based tests"): XState v6 machines in
 * tests/machines/, walked by @xstate/test 2.0 (testPaths) through the official Playwright
 * adapter (@xstate/test/playwright, createPlaywrightSut).
 *
 * A machine file in tests/machines/ holds only its machine, with every target written out, so
 * the file pastes into the Stately editor as it is. Its model in tests/models/ is a `MachineModel`:
 * the machine and the event cases the tests send (the `events` option of testPaths).
 */

/**
 * The `events` option of testPaths: by event type, a fast-check generator, a
 * descriptor with `generate` (and `case`, `when`), or an array of them (README, "Events").
 * Typed as testPaths checks them in each spec; here only the generators are read.
 */
export type ModelEvents = Readonly<Record<string, unknown>>;

type EventCase = fc.Arbitrary<unknown> | {readonly generate: fc.Arbitrary<unknown>};

/** What an event case's `when` receives. */
export interface When {
  readonly snapshot: AnyMachineSnapshot;
}

/** A `when` that sends the event wherever the walk is: the page must ignore it where the machine does. */
export const always = (_args: When) => true;

/** A `when` that sends the event only where the machine takes it (snapshot.can). */
export const offered = (type: string) => ({snapshot}: When) => snapshot.can({type});

export interface MachineModel<TMachine extends AnyStateMachine = AnyStateMachine> {
  /** The machine's file name and the title of the coverage report, such as 'zen-layout'. */
  readonly id: string;
  readonly machine: TMachine;
  /** The events the tests send, with `when` so each is sent only where the page offers it. */
  readonly events: ModelEvents;
}

/**
 * testPaths, with its options untyped: a model's events and sut follow its own machine's types,
 * which this shared helper does not know. Each spec still types its sut.
 */
type Walker = (machine: unknown, options: Record<string, unknown>) => Promise<{coverage: TestCoverage}>;
const runPaths = testPaths as unknown as Walker;

/**
 * WebKit's page error for a Next.js link prefetch (an `?_rsc=` request) that a navigation cut
 * off, such as `/127.0.0.1:3000/blog?_rsc=Zhvt… due to access control checks.` A run's `reset`
 * opens a new page while the old page still prefetches its links (CI, PR #236).
 */
const ABORTED_PREFETCH = /\?_rsc=[^\s]+ due to access control checks\.$/;

/**
 * WebKit's report that ResizeObserver delivered some notifications a frame late. It is not an
 * exception: the specification reports it to help debugging, and nothing is lost. Radix menus
 * size themselves to the space beside their button (components/ui/dropdown-menu.tsx), so a page
 * that reflows while a menu closes, such as tiles growing after Comfortable, can cause it.
 */
const RESIZE_OBSERVER_LOOP = /ResizeObserver loop completed with undelivered notifications\.$/;

/** The page errors the walks pass over: browser notices, not failures of the app. */
export const BENIGN_PAGE_ERRORS: readonly RegExp[] = [ABORTED_PREFETCH, RESIZE_OBSERVER_LOOP];

interface SutSession {
  check?: () => unknown;
}

/**
 * The sut, with its page oracles (createPlaywrightSut's `check`, README "Oracles") passing over
 * BENIGN_PAGE_ERRORS only: a failure that lists any other message still fails the step.
 */
export function ignoringBenignPageErrors<TSut>(sut: TSut): TSut {
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
              && messages.every((message) => BENIGN_PAGE_ERRORS.some((benign) => benign.test(message)));
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

/** The sut as every walk runs it: benign browser notices passed over, and the live inspector when on. */
async function walkSut(model: MachineModel, sut: unknown): Promise<unknown> {
  return withLiveInspector(model, ignoringBenignPageErrors(sut));
}

/**
 * The most steps one part of a walk takes (walkParts). A model's Playwright test runs each part
 * as a test of its own, so a failure names a short part, and parts run in parallel. Together the
 * parts cover the whole machine (tests/unit/machines/walks.test.ts).
 */
export const MAX_PART_STEPS = 30;

/** One part of a model's walk: some of its event sequences, each from the initial state. */
export interface WalkPart {
  /** Counted from 1. */
  readonly number: number;
  readonly count: number;
  readonly paths: readonly (readonly EventObject[])[];
  /** For test titles: "part 2 of 5". */
  readonly name: string;
}

/**
 * The model's walk (walkPaths), in parts of at most MAX_PART_STEPS steps: each sequence in
 * order, with short sequences together in one part.
 */
export function walkParts(model: MachineModel): WalkPart[] {
  const groups: EventObject[][][] = [];
  for (const path of walkPaths(model)) {
    const last = groups.at(-1);
    const steps = last?.reduce((sum, events) => sum + events.length, 0) ?? Infinity;
    if (last && steps + path.length <= MAX_PART_STEPS) last.push(path);
    else groups.push([path]);
  }
  return groups.map((paths, index) => Object.freeze({
    number: index + 1,
    count: groups.length,
    paths,
    name: `part ${index + 1} of ${groups.length}`,
  }));
}

/**
 * Runs the model's walk against `sut` with testPaths, and resolves with its coverage: the whole
 * walk, or one part of it (walkParts).
 */
export async function walkModel(model: MachineModel, sut: unknown, part?: WalkPart): Promise<TestCoverage> {
  const sequences = part?.paths ?? walkPaths(model);
  const paths = sequences.flatMap((events) => getPathsFromEvents(model.machine, [...events]));
  const {coverage} = await runPaths(model.machine, {events: model.events, sut: await walkSut(model, sut), paths});
  return coverage;
}

/**
 * The time limit of one part of a model's walk (walkParts): up to MAX_PART_STEPS steps and a
 * page load for each of its sequences, on the slowest browser and a busy CI runner. It limits
 * the whole test; every step inside waits for what the page shows, not for a time.
 */
export const MODEL_PART_TIMEOUT = 120_000;

/** Ties a model to its machine's types. */
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

/** The model's events that its `when` sends in `snapshot`: one sample of each event case. */
function eventsIn(model: MachineModel, snapshot: AnyMachineSnapshot): EventObject[] {
  return sampleEvents(model.events).filter((event) => {
    const cases = model.events[event.type];
    const list = (Array.isArray(cases) ? cases : [cases]) as readonly unknown[];
    return list.some((entry) => {
      const when = (entry as {when?: (args: When) => boolean}).when;
      return !when || when({snapshot});
    });
  });
}

/**
 * A traversal key for a snapshot: its state value, and what its history states remember while
 * their parent is not active. Zen off with 9:16 remembered is a different state from Zen off
 * with Overlay remembered, because Zen turns on again in a different layout. While the parent
 * is active, what its history state holds is replaced on the next exit, so it does not count.
 */
function walkKey(snapshot: AnyMachineSnapshot): string {
  const remembered = Object.entries(snapshot.historyValue ?? {})
    .filter(([id]) => !snapshot.matches(`#${id.slice(0, id.lastIndexOf('.'))}` as never))
    .map(([id, nodes]) => [id, (nodes as readonly {id: string}[]).map((node) => node.id).sort()])
    .sort();
  return JSON.stringify({value: snapshot.value, remembered});
}

/** Every state node of a machine. */
function stateNodesOf(machine: AnyStateMachine): AnyStateMachine['root'][] {
  const visit = (node: AnyStateMachine['root']): AnyStateMachine['root'][] => [node, ...Object.values(node.states).flatMap(visit)];
  return visit(machine.root);
}

/**
 * The state nodes whose transitions `type` takes in `snapshot`: for each active state, the
 * nearest state node, itself or an ancestor, that declares `type` in `on`.
 */
function transitionsTaken(machine: AnyStateMachine, snapshot: AnyMachineSnapshot, type: string): AnyStateMachine['root'][] {
  const active = stateNodesOf(machine).filter((node) => snapshot.matches(`#${node.id}` as never));
  const handles = (node: AnyStateMachine['root']) => Boolean((node.config.on as Record<string, unknown> | undefined)?.[type]);
  const taken = active
    .filter((node) => Object.keys(node.states).length === 0 || node.type === 'parallel')
    .map((node) => {
      let at: AnyStateMachine['root'] | undefined = node;
      while (at && !handles(at)) at = at.parent;
      return at;
    })
    .filter((node): node is AnyStateMachine['root'] => node !== undefined);
  return [...new Set(taken)];
}

/**
 * The part of `value` in the region of `node`: under its nearest ancestor-or-self that is a region
 * of a parallel state, or the whole value. A transition in one region leaves the other regions as
 * they are, so where it leads is read in its own region only.
 */
function valueInRegion(node: AnyStateMachine['root'], value: unknown): unknown {
  let region = node;
  while (region.parent && region.parent.type !== 'parallel') region = region.parent;
  return region.path.reduce<unknown>((part, key) => (part as Record<string, unknown>)[key], value);
}

/**
 * Where `node` stands in `snapshot`, below itself: the active child, and its active child, down
 * to an atomic state. A parallel state gives one key per region instead of their product, so a
 * transition declared above parallel regions needs each state of each region once, not every
 * combination. An atomic node gives one empty key.
 */
function sourceKeys(node: AnyStateMachine['root'], snapshot: AnyMachineSnapshot): string[] {
  const children = Object.values(node.states).filter((child) => child.type !== 'history');
  const below = (child: AnyStateMachine['root']) => sourceKeys(child, snapshot).map((key) => (key ? `${child.key}.${key}` : child.key));
  if (children.length === 0) return [''];
  if (node.type === 'parallel') return children.flatMap(below);
  return children.filter((child) => snapshot.matches(`#${child.id}` as never)).flatMap(below);
}

/**
 * What one step of a walk covers, from `state` with `event` to `next`:
 * - `state <key>`: the state it enters (walkKey);
 * - `transition <node> <event> to <value>`: each transition it takes, by the node that declares
 *   it and where it leads in that node's region (valueInRegion);
 * - `transition <node> <event> from <key>`: the same transition, by where it starts below the
 *   node that declares it (sourceKeys), so a transition declared on a compound state is taken
 *   from each of its children, not only from the first one the walk reaches;
 * - `ignored <event> in <value>`: an event that no transition takes, where the page must ignore it.
 */
export function stepItems(machine: AnyStateMachine, state: AnyMachineSnapshot, event: EventObject, next: AnyMachineSnapshot): string[] {
  const taken = transitionsTaken(machine, state, event.type);
  if (taken.length === 0) return [`state ${walkKey(next)}`, `ignored ${event.type} in ${JSON.stringify(state.value)}`];
  return [`state ${walkKey(next)}`, ...taken.flatMap((node) => [
    `transition ${node.id} ${event.type} to ${JSON.stringify(valueInRegion(node, next.value))}`,
    ...(Object.keys(node.states).length > 0
      ? sourceKeys(node, state).map((key) => `transition ${node.id} ${event.type} from ${key}`)
      : []),
  ])];
}

/** One step the model's events can take: from a walkKey, with an event, to a walkKey. */
interface WalkStep {
  readonly from: string;
  readonly event: EventObject;
  readonly to: string;
  readonly covers: readonly string[];
}

/** Every step the model's events can take (xstate/graph's getAdjacencyMap), and the initial walkKey. */
function walkGraph(model: MachineModel): {initial: string; steps: WalkStep[]} {
  const {machine} = model;
  const adjacency = getAdjacencyMap(machine, {
    events: ((snapshot: AnyMachineSnapshot) => eventsIn(model, snapshot)) as never,
    serializeState: walkKey as never,
  });
  const steps = (Object.entries(adjacency) as [string, AdjacencyValue<AnyMachineSnapshot, EventObject>][])
    .flatMap(([from, {state, transitions}]) => (Object.values(transitions) as {event: EventObject; state: AnyMachineSnapshot}[])
      .map(({event, state: next}) => ({from, event, to: walkKey(next), covers: stepItems(machine, state, event, next)})));
  const [initial] = Object.keys(adjacency);
  return {initial, steps};
}

/**
 * What the walk of a model must cover (stepItems): every item that a step the model's events
 * can take covers, except entering the initial state, where every sequence starts.
 */
export function walkItems(model: MachineModel): string[] {
  return itemsOf(walkGraph(model));
}

function itemsOf({initial, steps}: {initial: string; steps: readonly WalkStep[]}): string[] {
  const items = new Set(steps.flatMap((step) => step.covers));
  items.delete(`state ${initial}`);
  return [...items].sort();
}

/**
 * What one event sequence covers when it runs on the machine alone, from the initial state
 * (xstate's initialTransition and transition), by the same rules as the walk (stepItems).
 */
export function pathItems(model: MachineModel, path: readonly EventObject[]): string[] {
  const {machine} = model;
  const items = new Set<string>();
  let state = initialTransition(machine)[0] as AnyMachineSnapshot;
  for (const event of path) {
    const next = transition(machine, state, event)[0] as AnyMachineSnapshot;
    stepItems(machine, state, event, next).forEach((item) => items.add(item));
    state = next;
  }
  return [...items].sort();
}

/**
 * The walk of a model: event sequences, each from the initial state, that together cover every
 * item of walkItems. They enter every reachable state (walkKey), take every transition of the
 * machine into every state it can lead to (so Zen turns on again in each layout it can remember)
 * and from every state below the node that declares it, and send each event that the page must
 * ignore once in each state that ignores it. The machines are small and static, so
 * xstate/graph's getAdjacencyMap lists every step the model's events can take. The walk starts
 * at the initial state and goes, by the shortest route, to the nearest step that reaches
 * something not yet covered. When nothing uncovered is reachable from where it stands, or the
 * sequence would grow past `maxSteps`, a new sequence starts. The result is deterministic: the
 * same machine and events give the same walk.
 */
export function walkPaths(model: MachineModel, {maxSteps = MAX_PART_STEPS}: {maxSteps?: number} = {}): EventObject[][] {
  const graph = walkGraph(model);
  const {initial} = graph;
  const stepsFrom = new Map<string, WalkStep[]>();
  for (const step of graph.steps) stepsFrom.set(step.from, [...(stepsFrom.get(step.from) ?? []), step]);
  const uncovered = new Set(itemsOf(graph));
  const useful = (step: WalkStep) => step.covers.some((item) => uncovered.has(item));
  /** The shortest route from `start` that ends with a useful step, or null. */
  const routeFrom = (start: string): WalkStep[] | null => {
    const reachedBy = new Map<string, WalkStep | null>([[start, null]]);
    const queue = [start];
    for (let at = queue.shift(); at !== undefined; at = queue.shift()) {
      const steps = stepsFrom.get(at) ?? [];
      const found = steps.find(useful);
      if (found) {
        const route = [found];
        for (let step = reachedBy.get(at); step; step = reachedBy.get(step.from)) route.unshift(step);
        return route;
      }
      for (const step of steps) {
        if (reachedBy.has(step.to)) continue;
        reachedBy.set(step.to, step);
        queue.push(step.to);
      }
    }
    return null;
  };
  const paths: EventObject[][] = [];
  while (uncovered.size > 0) {
    const path: EventObject[] = [];
    for (let at = initial, route = routeFrom(at); route; route = routeFrom(at)) {
      // A sequence stops before it grows past maxSteps; the next one starts from the initial state.
      if (path.length > 0 && path.length + route.length > maxSteps) break;
      for (const step of route) {
        step.covers.forEach((item) => uncovered.delete(item));
        path.push(step.event);
        at = step.to;
      }
    }
    if (path.length === 0) throw new Error(`The walk of ${model.id} cannot reach: ${[...uncovered].join(', ')}`);
    paths.push(path);
  }
  return paths;
}

/** A state value as JSON with its keys sorted, so two spellings of one state compare equal. */
function canonicalState(value: unknown): string {
  const sorted = (node: unknown): unknown => (typeof node === 'string'
    ? node
    : Object.fromEntries(Object.keys(node as object).sort().map((key) => [key, sorted((node as Record<string, unknown>)[key])])));
  return JSON.stringify(sorted(value));
}

/** Every state the machine can reach with the model's events, as canonical JSON state values. */
export function reachableStates(model: MachineModel): string[] {
  const adjacency = getAdjacencyMap(model.machine, {events: sampleEvents(model.events)});
  return [...new Set(Object.values(adjacency).map(({state}) => canonicalState(state.value)))].sort();
}

/**
 * The ids of the machine's history states. A history state is never active: entering it enters
 * the state it remembers, so @xstate/test counts it as an uncovered state node however often a
 * run goes through it. The transitions into it still count.
 */
function historyStateIds(machine: AnyStateMachine): string[] {
  const visit = (node: AnyStateMachine['root']): string[] => [
    ...(node.type === 'history' ? [node.id] : []),
    ...Object.values(node.states).flatMap(visit),
  ];
  return visit(machine.root);
}

/**
 * Fails unless the walk took every state node (history states aside), transition and reachable state.
 * - assertTestCoverage counts only covered and uncovered ids.
 * - A transition that a function computes stays "unknown" until a run takes it, so unknown
 *   transitions fail too, as the official model-based-testing example checks
 *   (`coverage.transitions.unknown` is empty). The machines here have none
 *   (tests/unit/machines/static-machines.test.ts), so this guards against one coming back.
 * - The states dimension lists only the states the runs entered, so a state that no run reached
 *   is missing from it without being "uncovered". Every reachable state must be covered: in a
 *   machine with parallel regions, that is every combination of their states.
 */
export function assertFullCoverage(model: MachineModel, coverage: TestCoverage) {
  assertTestCoverage(coverage, {transitions: 1});
  const problems: string[] = [];
  const history = new Set(historyStateIds(model.machine));
  const missedNodes = coverage.stateNodes.uncovered.filter((id) => !history.has(id));
  if (missedNodes.length > 0) problems.push(`no run entered these state nodes: ${missedNodes.join(', ')}`);
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
 * Attaches the coverage report of one part of a model's walk (walkParts) to the Playwright report:
 * formatTestCoverageHTML and the text of formatTestCoverage. It checks nothing: a run that
 * passes covers what its part covers on the machine alone, since a step that fails throws. That
 * the parts together cover the machine is proven without a browser, in
 * tests/unit/machines/walks.test.ts.
 */
export async function attachCoverage(testInfo: TestInfo, model: MachineModel, coverage: TestCoverage, part: WalkPart) {
  const title = `${model.id}-${part.number}-of-${part.count}`;
  await testInfo.attach(`${title}-coverage.html`, {
    body: formatTestCoverageHTML(coverage, {title: model.machine.id}),
    contentType: 'text/html',
  });
  await testInfo.attach(`${title}-coverage.md`, {
    body: formatTestCoverage(coverage, {format: 'markdown'}),
    contentType: 'text/markdown',
  });
}

/** A system under test that does nothing: the walk follows the machine alone. */
export const IDLE_SUT = Object.freeze({create: () => ({send: () => {}})});
