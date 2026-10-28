#!/usr/bin/env node
/**
 * Drag performance benchmark: drags one item with the mouse across a list of 200 tiles and
 * measures what a person would notice.
 *
 *   npm run build && npm run start -- -p 3300      (in another terminal)
 *   npm run bench:drag -- --url http://127.0.0.1:3300 [--cpu 4] [--runs 3] [--budget] [--verbose]
 *
 * Measures, in Chromium:
 * - frame time while dragging (p50, p95, max): the gap between two animation frames;
 * - preview lag (median, p95, max): from the first pointer move inside a row until the dragged
 *   item shows in that row;
 * - long tasks (over 50 ms), and main-thread, script, style and layout time per frame
 *   (Chrome's performance metrics);
 * - the drop: at the end of each run the item is released in row S. The drop animation lasts
 *   DROP_ANIMATION_MS (`DROP_ANIMATION` in lib/dnd/dndKit.ts), about 18 frames at 60 Hz. The
 *   result counts the frames drawn during it, and the worst frame in the DROP_WINDOW_MS after
 *   the release (the list's update and its new link come in that time).
 *
 * The window is 1800 px high, so every row is on screen and the drag never auto-scrolls.
 * `--cpu 4` slows the CPU four times (Chrome's CPU throttling), close to a mid-range phone.
 * `--budget` exits with 1 when a result is over BUDGET. `--profile <file>` and `--trace <file>`
 * save a CPU profile or a Chrome trace of the first run (open them in Chrome DevTools).
 * The list: all items of the official sets, then label tiles up to 200 items, spread over the
 * five rows and Unranked. Runs on one machine vary by about 20%: compare builds on the same
 * machine, with several runs.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
import LZString from 'lz-string';

/**
 * No visible lag (owner, 2026-10-28), at full CPU speed: 95% of frames within two frames at
 * 60 Hz, and 95% of row changes shown within 100 ms.
 */
export const BUDGET = Object.freeze({frameP95Ms: 34, previewLagP95Ms: 100});

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const baseUrl = option('url', 'http://127.0.0.1:3000');
const cpu = Number(option('cpu', '1'));
const runs = Number(option('runs', '3'));
const tileCount = Number(option('tiles', '200'));
const checkBudget = args.includes('--budget');
const profilePath = option('profile', undefined);
const tracePath = option('trace', undefined);

const ROWS = [
  {i: 'tier-s', n: 'S'},
  {i: 'tier-a', n: 'A'},
  {i: 'tier-b', n: 'B'},
  {i: 'tier-c', n: 'C'},
  {i: 'tier-f', n: 'F'},
  {i: 'uncategorized', n: ''},
];
const DRAGGED = 'Bench 1';
const DROP_ANIMATION_MS = 300;
const DROP_WINDOW_MS = 800;

function benchState() {
  const config = JSON.parse(readFileSync(new URL('../imageset.config.json', import.meta.url), 'utf8'));
  const official = Object.entries(config.packages)
    .filter(([, data]) => !data.legacy)
    .flatMap(([packageName, data]) => data.images.map(image => ({i: `${packageName}-${image.filename}`})));
  const labels = Array.from({length: Math.max(0, tileCount - official.length)}, (_, n) => ({i: `bench-${n + 1}`, c: `Bench ${n + 1}`}));
  // The dragged label tile first, so it starts at the top left of row S.
  const items = [...labels.slice(0, 1), ...official, ...labels.slice(1)].slice(0, tileCount);
  const perRow = Math.ceil(items.length / ROWS.length);
  const tiers = ROWS.map((row, index) => ({...row, t: items.slice(index * perRow, (index + 1) * perRow)}));
  return LZString.compressToEncodedURIComponent(JSON.stringify({title: 'Drag benchmark', tiers}));
}

const percentile = (values, p) => {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};
const round = (value) => Math.round(value * 10) / 10;

/** Page-side recorder: animation frame gaps, long tasks, and when the dragged item reaches each row. */
function installRecorder(dragged) {
  const state = {frames: [], times: [], longTasks: 0, lags: [], watching: null, running: true};
  window.__bench = state;
  let last = performance.now();
  const frame = (now) => {
    if (!state.running) return;
    state.frames.push(now - last);
    state.times.push(now);
    last = now;
    const watch = state.watching;
    if (watch && watch.start !== null && watch.end === null) {
      const row = document.querySelector(`[role="group"][aria-label="${CSS.escape(watch.row)}"]`);
      if (row?.querySelector(`[role="button"][aria-label="${CSS.escape(dragged)}"]`)) {
        watch.end = now;
        state.lags.push(watch.end - watch.start);
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  try {
    new PerformanceObserver(list => { state.longTasks += list.getEntries().length; }).observe({type: 'longtask'});
  } catch { /* no long task timing */ }
  window.addEventListener('pointermove', (event) => {
    const watch = state.watching;
    if (!watch || watch.start !== null) return;
    const row = document.querySelector(`[role="group"][aria-label="${CSS.escape(watch.row)}"]`)?.getBoundingClientRect();
    if (row && event.clientY >= row.top && event.clientY <= row.bottom) watch.start = event.timeStamp;
  }, {capture: true});
}

async function rowBox(page, label) {
  const box = await page.locator(`[role="group"][aria-label="${label}"]`).first().boundingBox();
  if (!box) throw new Error(`No row ${label}`);
  return box;
}

async function oneRun(browser, state, profile) {
  const context = await browser.newContext({viewport: {width: 1280, height: 1800}});
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await page.goto(`${baseUrl}/rank?state=${state}`);
  const dragged = page.locator(`[role="button"][aria-label="${DRAGGED}"]`);
  await dragged.waitFor();
  await page.waitForLoadState('networkidle');
  await cdp.send('Performance.enable');
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', {rate: cpu});
  await page.evaluate(installRecorder, DRAGGED);

  const start = await dragged.boundingBox();
  const mouse = page.mouse;
  await mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await mouse.down();
  await mouse.move(start.x + start.width / 2 + 10, start.y + start.height / 2 + 10, {steps: 4});
  await page.getByText(/^Picked up /).first().waitFor({state: 'attached'}).catch(() => {});
  await page.evaluate(() => { window.__bench.frames = []; window.__bench.longTasks = 0; });
  const before = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  if (profile === true && tracePath) await browser.startTracing(page, {path: tracePath, screenshots: false});
  if (profile && profile !== true) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', {interval: 200});
    await cdp.send('Profiler.start');
  }

  // Down through every row, then back up: each step enters a new row in the middle of its items.
  const path = ['A', 'B', 'C', 'F', 'Unranked', 'F', 'C', 'B', 'A', 'S'];
  for (const label of path) {
    const box = await rowBox(page, label);
    await page.evaluate((row) => { window.__bench.watching = {row, start: null, end: null}; }, label);
    // 20 small moves to a point inside the row, as a hand would move.
    await mouse.move(box.x + box.width * 0.45, box.y + box.height / 2, {steps: 20});
    // Wiggle inside the row: items under the pointer change sides.
    for (let n = 0; n < 10; n++) await mouse.move(box.x + box.width * (0.3 + n * 0.03), box.y + box.height / 2, {steps: 2});
    await page.waitForFunction(() => window.__bench.watching?.end !== null, null, {timeout: 10_000}).catch(() => {});
  }

  const after = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  if (profile === true && tracePath) await browser.stopTracing();
  if (profile && profile !== true) {
    const {profile: cpuProfile} = await cdp.send('Profiler.stop');
    writeFileSync(profile, JSON.stringify(cpuProfile));
  }
  const result = await page.evaluate(() => ({frames: window.__bench.frames.slice(), lags: window.__bench.lags, longTasks: window.__bench.longTasks}));

  // The drop. A fixed wait is right here: the benchmark measures what happens in that time.
  const releasedAt = await page.evaluate(() => {
    window.__bench.frames = [];
    window.__bench.times = [];
    return performance.now();
  });
  await mouse.up();
  await page.waitForTimeout(DROP_WINDOW_MS + 100);
  const drop = await page.evaluate(({releasedAt, animationMs, windowMs}) => {
    const state = window.__bench;
    state.running = false;
    const during = (ms) => state.frames.filter((_, n) => state.times[n] > releasedAt && state.times[n] <= releasedAt + ms);
    const window_ = during(windowMs);
    return {animationFrames: during(animationMs).length, worstFrameMs: Math.max(...window_), framesOver33Ms: window_.filter(gap => gap > 33).length};
  }, {releasedAt, animationMs: DROP_ANIMATION_MS, windowMs: DROP_WINDOW_MS});
  await context.close();
  const frames = result.frames.slice(1);
  return {
    frames,
    drop,
    lags: result.lags,
    missedRows: path.length - result.lags.length,
    longTasks: result.longTasks,
    scriptMsPerFrame: ((after.ScriptDuration - before.ScriptDuration) * 1000) / Math.max(1, frames.length),
    layoutMsPerFrame: ((after.LayoutDuration - before.LayoutDuration) * 1000) / Math.max(1, frames.length),
    styleMsPerFrame: ((after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000) / Math.max(1, frames.length),
    taskMsPerFrame: ((after.TaskDuration - before.TaskDuration) * 1000) / Math.max(1, frames.length),
  };
}

const browser = await chromium.launch();
const state = benchState();
const results = [];
for (let run = 0; run < runs; run++) results.push(await oneRun(browser, state, run === 0 ? (profilePath ?? (tracePath ? true : undefined)) : undefined));
await browser.close();

const frames = results.flatMap(r => r.frames);
const lags = results.flatMap(r => r.lags);
const summary = {
  url: baseUrl,
  tiles: tileCount,
  cpuSlowdown: cpu,
  runs,
  frameMs: {p50: round(percentile(frames, 50)), p95: round(percentile(frames, 95)), max: round(Math.max(...frames))},
  previewLagMs: {median: round(percentile(lags, 50)), p95: round(percentile(lags, 95)), max: round(Math.max(...lags))},
  rowsNotReached: results.reduce((sum, r) => sum + r.missedRows, 0),
  longTasks: results.reduce((sum, r) => sum + r.longTasks, 0),
  scriptMsPerFrame: round(results.reduce((sum, r) => sum + r.scriptMsPerFrame, 0) / runs),
  layoutMsPerFrame: round(results.reduce((sum, r) => sum + r.layoutMsPerFrame, 0) / runs),
  styleMsPerFrame: round(results.reduce((sum, r) => sum + r.styleMsPerFrame, 0) / runs),
  mainThreadMsPerFrame: round(results.reduce((sum, r) => sum + r.taskMsPerFrame, 0) / runs),
  drop: {
    animationFrames: {
      ideal: Math.round(DROP_ANIMATION_MS / (1000 / 60)),
      min: Math.min(...results.map(r => r.drop.animationFrames)),
      median: percentile(results.map(r => r.drop.animationFrames), 50),
    },
    worstFrameMs: round(Math.max(...results.map(r => r.drop.worstFrameMs))),
    framesOver33Ms: results.reduce((sum, r) => sum + r.drop.framesOver33Ms, 0),
  },
};
console.log(JSON.stringify(summary, null, 2));
if (args.includes('--verbose')) {
  for (const [index, result] of results.entries()) console.log(`run ${index + 1} lags (ms): ${result.lags.map(round).join(', ')}`);
}

if (checkBudget) {
  const over = [];
  if (summary.frameMs.p95 > BUDGET.frameP95Ms) over.push(`frame p95 ${summary.frameMs.p95} ms > ${BUDGET.frameP95Ms} ms`);
  if (summary.previewLagMs.p95 > BUDGET.previewLagP95Ms) over.push(`preview lag p95 ${summary.previewLagMs.p95} ms > ${BUDGET.previewLagP95Ms} ms`);
  if (summary.rowsNotReached > 0) over.push(`${summary.rowsNotReached} rows never showed the dragged item`);
  if (over.length) {
    console.error(`Over budget: ${over.join('; ')}`);
    process.exit(1);
  }
}
