import * as fc from 'fast-check';
import type {TestInfo} from '@playwright/test';
import {assertTestCoverage, formatTestCoverage, formatTestCoverageHTML, testPaths, type TestCoverage} from '@xstate/test';
import type {createInspector} from '@statelyai/sdk';
import {createActor, initialTransition, transition, type AnyMachineSnapshot, type AnyStateMachine, type EventObject} from 'xstate';
import {getAdjacencyMap, getPathsFromEvents, type AdjacencyValue} from 'xstate/graph';
import {modelInspectOn} from './model-inspect';


export type ModelEvents = Readonly<Record<string, unknown>>;

type EventCase = fc.Arbitrary<unknown> | {readonly generate: fc.Arbitrary<unknown>};

export interface When {
  readonly snapshot: AnyMachineSnapshot;
}

export const always = (_args: When) => true;

export const offered = (type: string) => ({snapshot}: When) => snapshot.can({type});

export interface MachineModel<TMachine extends AnyStateMachine = AnyStateMachine> {
  readonly id: string;
  readonly machine: TMachine;
  readonly events: ModelEvents;
}

type Walker = (machine: unknown, options: Record<string, unknown>) => Promise<{coverage: TestCoverage}>;
const runPaths = testPaths as unknown as Walker;

const ABORTED_PREFETCH = /\?_rsc=[^\s]+ due to access control checks\.$/;

const RESIZE_OBSERVER_LOOP = /ResizeObserver loop completed with undelivered notifications\.$/;

export const BENIGN_PAGE_ERRORS: readonly RegExp[] = [ABORTED_PREFETCH, RESIZE_OBSERVER_LOOP];

interface SutSession {
  check?: () => unknown;
}

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
let workerInspector: Inspector | null | undefined;

async function liveInspector(): Promise<Inspector | null> {
  if (!modelInspectOn) return null;
  if (workerInspector !== undefined) return workerInspector;
  const sdk = await import('@statelyai/sdk');
  const inspector = sdk.createInspector({launch: 'none', name: 'OpenTierBoy model tests'});
  try {
    await inspector.ready;
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

async function walkSut(model: MachineModel, sut: unknown): Promise<unknown> {
  return withLiveInspector(model, ignoringBenignPageErrors(sut));
}

export const MAX_PART_STEPS = 30;

export interface WalkPart {
  readonly number: number;
  readonly count: number;
  readonly paths: readonly (readonly EventObject[])[];
  readonly name: string;
}

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

export async function walkModel(model: MachineModel, sut: unknown, part?: WalkPart): Promise<TestCoverage> {
  const sequences = part?.paths ?? walkPaths(model);
  const paths = sequences.flatMap((events) => getPathsFromEvents(model.machine, [...events]));
  const {coverage} = await runPaths(model.machine, {events: model.events, sut: await walkSut(model, sut), paths});
  return coverage;
}

export const MODEL_PART_TIMEOUT = 120_000;

export function defineModel<TMachine extends AnyStateMachine>(model: MachineModel<TMachine>): MachineModel<TMachine> {
  return Object.freeze(model);
}

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

function walkKey(snapshot: AnyMachineSnapshot): string {
  const remembered = Object.entries(snapshot.historyValue ?? {})
    .filter(([id]) => !snapshot.matches(`#${id.slice(0, id.lastIndexOf('.'))}` as never))
    .map(([id, nodes]) => [id, (nodes as readonly {id: string}[]).map((node) => node.id).sort()])
    .sort();
  return JSON.stringify({value: snapshot.value, remembered});
}

function stateNodesOf(machine: AnyStateMachine): AnyStateMachine['root'][] {
  const visit = (node: AnyStateMachine['root']): AnyStateMachine['root'][] => [node, ...Object.values(node.states).flatMap(visit)];
  return visit(machine.root);
}

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

function valueInRegion(node: AnyStateMachine['root'], value: unknown): unknown {
  let region = node;
  while (region.parent && region.parent.type !== 'parallel') region = region.parent;
  return region.path.reduce<unknown>((part, key) => (part as Record<string, unknown>)[key], value);
}

function sourceKeys(node: AnyStateMachine['root'], snapshot: AnyMachineSnapshot): string[] {
  const children = Object.values(node.states).filter((child) => child.type !== 'history');
  const below = (child: AnyStateMachine['root']) => sourceKeys(child, snapshot).map((key) => (key ? `${child.key}.${key}` : child.key));
  if (children.length === 0) return [''];
  if (node.type === 'parallel') return children.flatMap(below);
  return children.filter((child) => snapshot.matches(`#${child.id}` as never)).flatMap(below);
}

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

interface WalkStep {
  readonly from: string;
  readonly event: EventObject;
  readonly to: string;
  readonly covers: readonly string[];
}

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

export function walkItems(model: MachineModel): string[] {
  return itemsOf(walkGraph(model));
}

function itemsOf({initial, steps}: {initial: string; steps: readonly WalkStep[]}): string[] {
  const items = new Set(steps.flatMap((step) => step.covers));
  items.delete(`state ${initial}`);
  return [...items].sort();
}

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

export function walkPaths(model: MachineModel, {maxSteps = MAX_PART_STEPS}: {maxSteps?: number} = {}): EventObject[][] {
  const graph = walkGraph(model);
  const {initial} = graph;
  const stepsFrom = new Map<string, WalkStep[]>();
  for (const step of graph.steps) stepsFrom.set(step.from, [...(stepsFrom.get(step.from) ?? []), step]);
  const uncovered = new Set(itemsOf(graph));
  const useful = (step: WalkStep) => step.covers.some((item) => uncovered.has(item));
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

function canonicalState(value: unknown): string {
  const sorted = (node: unknown): unknown => (typeof node === 'string'
    ? node
    : Object.fromEntries(Object.keys(node as object).sort().map((key) => [key, sorted((node as Record<string, unknown>)[key])])));
  return JSON.stringify(sorted(value));
}

export function reachableStates(model: MachineModel): string[] {
  const adjacency = getAdjacencyMap(model.machine, {events: sampleEvents(model.events)});
  return [...new Set(Object.values(adjacency).map(({state}) => canonicalState(state.value)))].sort();
}

function historyStateIds(machine: AnyStateMachine): string[] {
  const visit = (node: AnyStateMachine['root']): string[] => [
    ...(node.type === 'history' ? [node.id] : []),
    ...Object.values(node.states).flatMap(visit),
  ];
  return visit(machine.root);
}

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

export const IDLE_SUT = Object.freeze({create: () => ({send: () => {}})});
