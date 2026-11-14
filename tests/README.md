# End-to-end tests

These Playwright tests check OpenTierBoy the way people use it: they open links, drag items,
rename tiers and share lists. They follow the
[Playwright best practices](https://playwright.dev/docs/best-practices) and the
[page object model](https://playwright.dev/docs/pom).

## Running the tests

Against a local production build (Playwright starts `npm run start` itself):

```bash
npx playwright install        # once, to download the browsers
npm run build
npm run test:e2e              # all projects
npm run test:e2e -- --project=chromium tests/e2e/drag-and-drop.spec.ts
npm run test:e2e:ui           # interactive UI mode
```

Against a deployed site (no local server is started):

```bash
BASE_URL=https://your-preview.vercel.app npm run test:e2e
```

For a deployment behind Vercel Deployment Protection, also set
`VERCEL_AUTOMATION_BYPASS_SECRET`. The tests send it only to the site under test: browser
tests add it to requests for the `BASE_URL` origin (`tests/support/vercel-bypass.ts`), and
API tests send it with every request because they only call that site. Images from other
sites never receive it.

Set `PORT` to run the local server on another port than 3000. The link preview tests in
`link-previews.api.spec.ts` skip themselves on a local server that is not on port 3000, because
the preview route loads item images from `http://localhost:3000` outside Vercel.

The tests run against the production build, not the dev server. Rebuild after every change
to what the build reads: `app/`, `components/`, `contexts/`, `lib/`, `models/`, `articles/`,
`public/`, `imageset.config.json`, `imageset.custom.json` and the config files
(`next.config.ts`, `postcss.config.mjs`). `npm run build` copies every
image set, legacy sets included, from `node_modules` into `public/images/` before every build
(the `prebuild` script), so run `npm ci` after a change to `package-lock.json`.

`npx playwright install` downloads the browsers once per machine. If the browsers are already
installed in a shared folder (for example in a container image), set
`PLAYWRIGHT_BROWSERS_PATH` to that folder instead. `@playwright/test` is pinned to an exact
version, because each version expects its own browser builds.

Projects (see `playwright.config.ts`):

| Project | Runs |
| --- | --- |
| `api` | `*.api.spec.ts` only, without a browser |
| `chromium`, `firefox`, `webkit` | every browser test |
| `mobile-chrome`, `mobile-safari` | only tests tagged `@mobile` |

## Layout

```
tests/
  e2e/            Playwright specs: one file per UI area or route (see "Where a test goes")
  pages/          page objects: every selector and every user action (tier-list-page.ts, site-page.ts)
  machines/       XState v6 machines of UI areas, one per file, ready to paste into Stately
  models/         what the model-based tests send and check for each machine (see "Model-based tests")
  support/        Playwright fixtures and helpers: links, image sites, snapshot files
  fixtures/       golden links and link states, golden snapshot files, images to upload (append-only)
  unit/           Vitest unit tests, at the same paths as the code they test
    lib/, app/, models/, scripts/   one test file per source file
    rules/        project rules: ESLint, imports, plain modules, the dnd-kit fork wiring,
                  image shapes, test names and file names
    fixtures/     checks of the golden fixtures in tests/fixtures
    support/      unit test helpers
```

## Where a test goes

- **Unit or end-to-end.** A test of a function's input and output is a unit test. A test of
  what a visitor does in the browser, or of what the server answers, is an end-to-end test.
- **Unit tests** sit at the path of the file they test: `lib/state/decode.ts` is tested in
  `tests/unit/lib/state/decode.test.ts`. A test that checks several files of one folder
  together is named after what it checks, in that folder (`lib/state/v3-format.test.ts`,
  `lib/snapshot/round-trip.test.ts`). Each top-level `describe` names the function it tests,
  as in code (`checkLinkImageUrl`, `tierListReducer`). When one function has several groups
  of inputs, each group's `describe` names the function and the group:
  `extractSnapshotText with bad files`.
- **End-to-end tests** have one file per UI area or route. Each file has one top-level
  `describe`, named after its area in lower case (`drag and drop`, `share panel`). A nested
  `describe` names a part of that area as a noun phrase (`keyboard`, `touch`, `Known bugs`).
  The areas:

  | File | Area |
  | --- | --- |
  | `editor-layout` | the title row, the tools, the rows and the Unranked tray on screen; tile sizes |
  | `editor-labels` | the title, row names, label position and label visibility |
  | `editor-rows` | adding and removing rows |
  | `editor-items` | adding, removing and resetting items; unknown items |
  | `drag-and-drop` | moving items and rows by mouse, keyboard and touch; announcements |
  | `history` | Back and Forward, and the history entries each change adds |
  | `share-panel` | the link and the Markdown text Share hands out |
  | `snapshot-files` | Freeze Frame: capture, Download, and opening files |
  | `link-images` | images from web addresses, and consent for other sites |
  | `device-images` | uploaded and pasted pictures kept in this browser |
  | `appearance` | Mode, Game colours, Font, and the toasts in each mode |
  | `zen` | Zen mode |
  | `zen-layouts` | Zen's creator layouts: 16:9, 9:16 and the stream overlay (green key) |
  | `tips` | the one-time tips for first-time visitors, and About's "Show the tips again" |
  | `home` | the home page and Recently viewed |
  | `site-pages` | About, Blog and the links between pages |
  | `shared-links` | golden links people shared, and their page tags |
  | `legacy-sets` | the legacy image sets (pages, and `.api` for files, sitemap, shortcuts) |
  | `routes` | template pages (and `.api` for status codes and redirects) |
  | `link-previews.api` | the link preview image (`/api/og`) |
  | `security` | the Content Security Policy, user text as plain text, device pictures kept local (and `.api` for the security headers on every kind of page) |
  | `accessibility` | automatic axe-core scans for the WCAG 2.1 A and AA rules: each page, and the dialogs and menus that matter, in light and dark mode (see "Accessibility scans") |
  | `journeys` | long scenarios over several areas, with Back and Forward |
  | `tile-shapes` | tiles of other shapes (needs a special build) |

## File names

- **A unit test of one source file has that file's name and path**, whatever its case:
  `lib/images/deviceStore.ts` is tested in `tests/unit/lib/images/deviceStore.test.ts`, and
  `lib/TierCortex.ts` in `tests/unit/lib/TierCortex.test.ts`. A search for the name finds both.
- **Every other file and folder under `tests/` is kebab-case:** specs (`drag-and-drop.spec.ts`),
  tests of several files (`lib/state/v3-format.test.ts`), rule tests, page objects
  (`tier-list-page.ts` holds the class `TierListPage`), helpers (`image-sites.ts`) and fixtures.
- `tests/unit/rules/test-file-names.test.ts` checks both rules on every file.

## Writing tests

- **Import `test` and `expect` from `tests/support/test.ts`.** It provides the `tierList`,
  `site` and `openAsVisitor` fixtures (the last one opens a link in a fresh browser, like a
  friend who receives it), and `consoleErrors`: the errors the page logged to the browser
  console during the test.
- **Name each test `<verb> <result> when <condition>`** (see "Test names" below).
- **Put page knowledge in the page objects.** Specs call `tierList.dragItemToTier('Mauga', 'S')`
  and never touch selectors directly. Add a method to the page object when a spec needs a
  new action.
- **Locate by role and accessible name**, the way assistive technology sees the page: a tier
  row is a `group` named after its label (the unnamed last row is `Unranked`, another row
  without a label is `Row <n>`, its position), an item is a `button` named after its label. Each
  ranked row has two handles: its grip, a `button` named `Move row <label>` (`Move Row 4`), which
  moves the whole row (`rowGrip`), and its stack, a `button` named `Move the 3 items of row
  <label>`, which moves only its items (`rowStack`). An empty row has no stack: it is hidden
  until the row holds an item. The Unranked tray has no handles; every row and the tray hold a level-2 heading,
  which is how the page object finds them. If an element has no accessible name, add
  one to the app (an `aria-label` or `sr-only` text) instead of using CSS or test ids.
- **Never sleep, and name no time.** No `waitForTimeout`, no fixed delays and no `{timeout: N}`
  on a wait. Wait for what the user would see: web-first assertions such as `toHaveText`, the
  drag announcer for drag and drop, and the address bar for saved changes. Page object methods
  that change the list return only after the new link is in the address bar. The editor writes
  it in the event of the change (`history.pushState`), with no request to the server.
- **Wait until the page is not busy.** The page says `aria-busy="true"` on `<main>` while it
  works on something the visitor started (`lib/busy.ts`): until it has started in the browser,
  while it goes to another address (a link, Back or Forward), during a drag and its drop, and
  while files or pictures are added or captured. A change to the list is not counted: its link
  is in the address bar at once. `TierListPage.settled()` and `SitePage.settled()` wait until it is done; `goto`,
  `reload`, `goBack`, `goForward` and `gotoHome` end with it, and specs never navigate with a raw
  `page.goto`/`goBack`/`reload` (`goBackNow` is the one exception, for a test that presses Back
  while the page works on purpose). A test that acts while the page works, on purpose (two
  quick moves), does not wait for it. A page that may crash opens with `gotoPageThatMayCrash`.
- **Toasts are found in Sonner's region** (`toasts(page)`, the region named "Notifications"),
  and a step that shows a toast waits for its own new toast, never for one already on screen.
- **Page errors fail the test.** The `pageErrors` fixture collects uncaught errors from every
  page the test opens, visitors included, and fails on any that is not in `BENIGN_PAGE_ERRORS`
  (`tests/support/machines.ts`) or in `test.use({allowedPageErrors})`.
- **Lint guards the specs.** ESLint refuses `waitForTimeout`, `'networkidle'`, `.locator`, `$`,
  `$$`, `$eval` and `waitForSelector` in `tests/e2e/**`; selectors live in the page objects.
- **The server answers when the test says so.** Where timing matters, a test holds the
  server's answers to a navigation to another `/rank` page (`holdRankPages`, for example a
  list file of another template) or to the trip home (`holdTripHome`), or holds the device
  image store as a slow disk would (`holdDeviceStore`), acts, then calls `release()`. No route
  delays answers by a time. A change to the list asks nothing of the server, so there is no
  answer to hold.
- **Timers run on the page clock.** A toast ends by itself after a time (4 s, a tip's 10 s). A
  test that waits for that turns the page clock on with `test.use({pageClock: true})` (or calls
  `page.clock.install()` before the page opens) and moves the page's time on by the app's own
  duration (`letToastTimeOut` in `tests/support/page-clock.ts`). The clock gives the page no
  navigation entry, so it stays off where the shared-list tip must show.
- **Motion is reduced.** Every test runs as a visitor who asks for less motion
  (`reducedMotion: 'reduce'` in `playwright.config.ts`): animations and transitions take no time
  (`app/globals.css`), and dnd-kit drops without its animation. A test about an animation turns
  it back on with `test.use({reducedMotion: 'no-preference'})`.
- **Arrange state through the URL.** Use `rankingState()` from `tests/support/links.ts` to
  open a list with items already ranked (a v2 link), and `v3State()` for a v3 link with layout
  settings or link and device images, instead of dragging items into place first:

  ```ts
  await tierList.goto('/rank/overwatch/tank', rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));
  ```

- **Tests never reach real sites.** `tests/support/test.ts` blocks requests to hosts other
  than the site under test and local addresses: from the browser (contexts from the fixtures,
  `openAsVisitor`, `openInChromiumProfile` and the worker's `browser`), `page.request`,
  `context.request`, the `request` fixture and the runner's `fetch()` (guarded when the module
  is first imported). A blocked request fails the test, also one marked `test.fail()`; one
  outside a test fails its file or the worker. Play image sites with
  `tests/support/image-sites.ts`. Lint refuses the ways around it (`route.continue()`,
  `route.fetch()`, `browser.newContext()`, `browser.newPage()`, `launch()`...) outside
  `tests/support`. Known limits, not guarded: `node:http` and `node:https` in tests, a route
  that answers a site address with a redirect to an outside host (or falls back with an
  outside `url`), and fetches the server makes for `/api/og` (it loads only the app's own
  images; `tests/unit/app/api/og/route.test.ts` checks that it requests no link image address).
- **The tips are off in every test** but `tips.spec.ts`: the fixtures store tips off before
  each page starts (`tests/support/test.ts`), so tips never cover what a test checks. A spec
  turns them on with `test.use({tips: true})`.
- **Tag read-only journeys that make sense on phones with `@mobile`.** Mouse drags and
  right-clicks do not apply to touch screens.
- **Some input cannot be simulated in every browser.** Firefox drops the files of a paste event
  that a test makes (`new ClipboardEvent('paste', {clipboardData})`), so tests that paste skip
  Firefox with `test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP)`. WebKit refuses
  `page.goto()` of a `blob:` URL in a new tab, so the test that opens an upload's image in a
  tab skips WebKit (`BLOB_TAB_SKIP`). Both reasons live in `tests/pages/tier-list-page.ts`. These
  are limits of the test tools; Chromium runs every one of these tests.
- **Run a new test under load before you commit it**, for example
  `npx playwright test --workers=4 --repeat-each=5 path/to.spec.ts`.

### Drag and drop

The editor's drag and drop runs on dnd-kit through `lib/dnd` (`docs/reference/drag-and-drop.md`). During a
drag the editor shows the list as it would be after the drop: rows and items move out of the
way of the dragged one. The list itself changes only on the drop, with one history entry.

- **Mouse.** `TierListPage.dragWithMouse` presses, moves a few pixels (a mouse drag starts
  after 5 px) and waits for the lift announcement. After the drop it waits until the drop has
  ended (the rows drop `data-dragging`), its animation included where motion is not reduced:
  until then a press starts no drag and the drag library blocks text selection on the page, so
  typing into a label would go nowhere.
- **Where to aim.** Drops on a row (its free space, or the place of another row) measure the
  drop point once, before the drag starts: a row measured during the drag has already moved.
  Drops before or after an item (`dragItemNextTo`, `dragItemOnto`) follow the target item until
  it stays put: an item goes before or after the item under the pointer, by the half the
  pointer is over, so following the target settles.
- **Every tile takes a drag.** After each drop (mouse, keyboard, touch, also a cancelled drag),
  the drop helpers check that every item tile has the role description "draggable"
  (`expectEveryItemDraggable`). The editor renders it only while the drag library holds the
  tile's draggable, so a tile that could not be dragged fails the test that dropped something.
- **Keyboard.** `moveItemWithKeyboard`, `moveRowWithKeyboard` (the grip) and
  `moveRowItemsWithKeyboard` (the stack) wait for the announcement after each key, and after the
  drop for focus to come back to the item, grip or stack.
- **Rows.** `dragRowOnto` drags a row by its grip onto the place of another row: the whole row
  moves, name included. `dragRowItemsOnto` drags a row's stack there: the items move and the
  labels stay. Both aim at the centre of the target row, measured before the drag.
- **Announcements.** The live region is `dragAnnouncer` (`role="status"`, id starting with
  `dnd-kit-announcement`). dnd-kit reads moves after 500 ms, so wait for the text.
- **Touch.** `touchDragItemToTier`, `longPressItem` and `swipeUpFromItem` send touch events
  through the Chrome DevTools Protocol, so those tests run only on Chromium phones
  (`mobile-chrome`). The hold before a touch drag lives in the event times, so the test does
  not wait for it; the long press waits until the item menu shows.
- **Rows that wrap** are tested at the default window size: twelve tiles do not fit on one
  line.

### Zen's creator layouts

`tests/e2e/zen-layouts.spec.ts` opens a layout the way a person does: Zen on, then the Layout
menu (`TierListPage.gotoInLayout`); no address opens one. A creator layout draws a frame under a
strip that holds the Zen bar, and the two together fit the window. A frame pixel is a CSS pixel
when the window is as wide as the frame and as high as the frame plus the strip: 1920 x 1168 for
16:9 and the overlay (an 88 px strip), 1080 x 2024 for 9:16 (a 104 px strip). The Zen bar is
always shown; `TierListPage.listPartsUnderZenBar` lists any title, row or item under it.

No creator layout scrolls its frame or the cover around it (`TierListPage.frameOverflows`): the
Unranked tray, or Up next and the queue, scrolls (`unrankedItemsScroll`), and with more rows than
the frame holds the rows scroll too (`rowsScroll`). `dragItemToTierByHand` scrolls the target row
into view, then the item, before it drags; at the row it moves the pointer by a pixel and back
(still one press), as a hand does, so the drag library reads the drop point again after the rows
have made room. The long-list tests use the full THE FINALS template
(77 items) and a list of 19 rows.

### Tile shapes

`tests/e2e/tile-shapes.spec.ts` checks tiles of mixed shapes (square, landscape, portrait).
No image set publishes another shape than square yet, so the spec skips itself unless the
build has a made-up shapes config. To run it (never commit the changed config):

```bash
npm run build                                  # prepares the images and imageset.config.json
node tests/support/synthetic-shapes.mjs        # marks some OVERWATCH images landscape or portrait
npx next build                                 # builds again without prebuild, which would rewrite the config
npx playwright test tests/e2e/tile-shapes.spec.ts
git checkout imageset.config.json              # back to the real config, then build again
```

While the made-up config is in place, the guard in `tests/unit/rules/image-shapes.test.ts` fails on
purpose.

### Accessibility scans

`tests/e2e/accessibility.spec.ts` opens each page, dialog and menu in its list (`SCANS`), in light
and dark mode, and scans it with [axe-core](https://github.com/dequelabs/axe-core) for the WCAG 2.1
A and AA rules (`scanForViolations` in `tests/support/accessibility.ts`). The scan starts once the
page has settled, its fonts have loaded and its animations have ended. The violations found when
the spec was added are listed in `OPEN_VIOLATIONS`, each with its own test in `Known bugs`; a scan
leaves out only those elements, in the scans and modes listed there.

A failing scan prints the violations it did not expect: for each, the axe-core rule id (its page is
`https://dequeuniversity.com/rules/axe/<version>/<rule>`), its impact, what the rule asks for, and
each element as a CSS path followed by its opening tag. Find the element on the page from the tag,
read the rule's page, and fix the app or ask the owner; a confirmed bug the owner keeps for later
goes into `OPEN_VIOLATIONS` with its own `Known bugs` test. When a Known bugs test passes, the
violation is gone: remove its entry and its test.

## Model-based tests

Some areas also have a model: an XState v6 machine in `tests/machines/` that describes what the
area does, state by state, and a model in `tests/models/` that ties it to the page. [`@xstate/test`](https://github.com/statelyai/xstate/tree/next/packages/xstate-test#readme)
2.0 walks the machine and runs every walk against the page through its Playwright adapter,
`createPlaywrightSut` (the [XState v6 guide](https://stately.ai/docs/xstate/v6/model-based-testing)
and the package README are the reference). A model test fails when the page and the machine
disagree, and its error lists every step with the machine's state.

- **A machine describes intended behaviour.** It mirrors what the page shows, including details
  such as a tooltip that takes an Escape. When the app changes on purpose, change the machine in
  the same pull request. When the app looks wrong, ask the owner, as for any test.
- **The machine file** (`tests/machines/<id>.ts`) holds only the machine: one import of
  `createMachine` from `xstate` and the exported machine. Every transition is an object with a
  written-out target (`{target: 'off'}`), never a function, so XState and the Stately editor see
  every arrow. Use the statechart features for what code would compute: nested states for
  what exists only inside another state, parallel states for settings that change on their own,
  history states for what a state remembers, and one state per case the page shows. The root
  `description` says what the machine describes, and a state's `description` says what the page
  shows in it. `tests/unit/rules/stately-machines.test.ts` checks these rules in `npm run check`.
- **The model file** (`tests/models/<id>.ts`) holds what the tests need: a `defineModel({...})`
  (`tests/support/machines.ts`) with an `id` (the file name), the machine and the `events` the
  tests send (fast-check generators, with `when` so an event is sent only where the page offers
  it; `offered(type)` sends it where the machine takes it), and helpers that say what each state
  shows on the page. Add every model to `tests/models/index.ts`.
- **The walk** is computed from the machine (`walkPaths`): a few event sequences from the start
  state that together cover every item of `walkItems`. They enter every reachable state, take
  every transition into every state it can lead to and from every state below the node that
  declares it (Escape declared on a parent is pressed in each of its children), and send each
  event the page must ignore once in each state that ignores it. Below a parallel state, each
  region's states count one by one, not every combination of them. A state that a history state
  remembers counts on its own, so Zen turns on again in each layout. The walk is the same on
  every run.
- **The walk in parts.** `walkParts` splits the walk into parts of at most `MAX_PART_STEPS`
  steps. Each part is a test of its own (`... (part 2 of 5)`), so a failure names a short part
  and the parts run in parallel. The parts together are the whole walk: shorter parts lose no
  coverage.
- **The campaign** sits at the end of its area's spec in a `describe('model')`, with one test
  per part. `reset` opens the start list through the URL, each event calls a page object action,
  and `states` holds web-first checks. The sut comes from `modelSut` (`tests/support/model-sut.ts`):
  before each check it waits until the page is not busy, so a check never sees a page halfway
  through a step. Where the page is busy on purpose (a drag in progress, a held server answer),
  the model names those states (`busyIn`), and there the check waits only for the page to load.
  Where the events act in a second browser (`openAsVisitor`), `pages` names its page: `modelSut`
  settles it too, checks it for page errors, console errors and answers of status 400 or more,
  and keeps its trace and a screenshot of a failing run. `attachCoverage` adds the coverage
  report of the part to the Playwright report. It checks nothing: a run that passes took every
  step of its part, since a step that fails throws. Model tests have no retries
  (`test.describe.configure({retries: 0})`): a model test that needs a second try is a bug to
  fix. Give each test `test.setTimeout(MODEL_PART_TIMEOUT)`, the limit of the whole part; the
  steps inside wait for what the page shows. With `testInfo`, a failing part attaches the
  failing run's trace (unless the tests run with the Vercel bypass secret), its `fixture.json`
  and a screenshot.
- **Side effects.** A step often starts work that ends later: a page that waits for the server,
  a message that closes by itself, a picture that is stored, an image site that answers.
  Each side effect is handled in one of two ways, never by a guess:
  - **Inside the step.** When its timing changes nothing the visitor sees, the step ends when
    the side effect has ended. The app counts it as busy from the event that starts it until it
    ends (`lib/busy.ts`), and `modelSut` waits until the page is not busy before each check.
  - **As an event of its own.** When its timing or its result changes what the visitor sees
    (a change made while Home is still on its way, a message still showing or gone, an image
    site that answers or fails), the machine has a waiting state and an event named after what
    the outside world does: `HOME_ANSWERS`, `TOAST_TIMES_OUT`, `IMAGE_SITE_ANSWERS`,
    `IMAGE_CHECK_TIMES_OUT`. The test makes it happen at that step: it holds the server's
    answers and releases them (`holdTripHome`), runs the page clock (`letToastTimeOut`), or
    holds the image site. The model names its waiting states in `busyIn`, where the page is
    busy on purpose.
- **Page time.** With `pageTime: 'paused'`, page time stands still for the whole test
  (`pausePageTime` in `tests/support/page-clock.ts`): Date, `performance.now()` and every timer
  with a delay wait until a time event runs the page clock (`runPageClock`). A slow step on a
  busy runner can no longer let a message close or an image check give up, and a time event
  checks the app's exact duration: `letToastTimeOut` checks that a message still shows 1 ms
  before its time and has closed 1 ms later, and `IMAGE_CHECK_TIMES_OUT` that the page still
  waits for the site 1 ms before it gives up. What the browser runs "as soon as possible" still
  runs at once: timers of 0 or 1 ms, animation frames and idle callbacks, which React, Sonner,
  Radix and Next.js need to show a page, a toast or a dialog (`pausePageTime` says why). React's
  reveal throttles run on real time too: React shows a loading state at least 300 ms before the
  content replaces it, and a move inside the site can show two in turn (the route's, then the
  editor's while its code loads), so React DOM's own timers use the real ones and the next page
  shows without a time event. The app's timers, Sonner's included, stay on page time. The
  models with timed messages or checks use it: link images, the "From a link" dialog, snapshot
  files, tips, add-from-template, device images, recently viewed and remove-and-undo. The
  shared-list tip machine cannot (the page clock hides the navigation entry that tip reads), so
  it keeps the pointer resting on its toast; a few hand-written tests still use `pageClock`,
  whose time runs with real time. A time event is an event of the machine, not an XState `after`
  transition: the walk chooses where time passes like any other step, a message that the
  pointer holds would need a timer the machine pauses, and @xstate/test would learn which
  `after` events fired only from an `advance` that reads the app's timers.
- **What is proven where.** `tests/unit/machines/walks.test.ts` runs each model's walk on the
  machine alone, in `npm run check`, and proves that it is complete twice: @xstate/test's coverage
  of the whole walk takes every state node, transition and reachable state
  (`assertFullCoverage`), and the sequences of all the parts together cover every item of
  `walkItems` (`pathItems`). It also checks that the parts hold every sequence of the walk, each
  part within `MAX_PART_STEPS`. The Playwright test of a part proves that the page does what the
  machine says at each step of that part.
- **Seeing a machine.** Copy the whole file, open the [Stately editor](https://editor.stately.ai)
  and paste it into Import Code. The editor draws the machine as it is in the file. A history
  state shows as **H**; its default target is in the file, and the editor does not draw it.
- **Watching a run.** With `MODEL_INSPECT=1`, each walk also drives a live XState actor of its
  machine, one step after each page action, and streams it to Stately's hosted inspector
  (`@statelyai/sdk`). The run prints `[Stately Inspector] <link>` once per worker: open that link
  to watch the machine move while Playwright drives the page. One worker gives one link:

  ```bash
  MODEL_INSPECT=1 npx playwright test --project=chromium tests/e2e/zen-layouts.spec.ts -g model --workers=1
  ```

  The inspector receives the machine's definition and its steps from your run. It is free and
  anonymous; the link is private and expires 24 hours after its last activity. CI never turns it
  on, and `tests/support/test.ts` lets the test runner reach only `sky.stately.ai`, only for it.
  If the inspector cannot connect, the run goes on without it. `STATELY_INSPECT_URL` points it at
  another relay.
- **Failures.** `@xstate/test` can save a failing sequence in `.xstate-test/` and replay it first
  next time; the folder is ignored by git. To keep a fixed bug's sequence as a regression test,
  replay its fixture with `replayTest(..., {expect: 'pass'})`.
- **XState v6 syntax.** Targets are objects (`{target: 'on'}`), a leading dot targets a child
  (`'.wide'`), and `#<machine id>.<path>` targets a state elsewhere in the machine. A history
  state needs a default `target`.

## Test names

Every test name has the form `<verb> <result> when <condition>`. The first word is one of
four verbs:

| Verb | The test asserts | Example |
| --- | --- | --- |
| `returns` | a return value, a resolved Promise or result object; an HTTP response (status, headers, body); a script's exit code | `returns {ok: false, reason: 'ip-address'} when the host is an IPv4 address` |
| `throws` | a thrown error or a rejected Promise | `throws TypeError when the input is empty` |
| `writes` | stored or sent data: IndexedDB, localStorage, files, a script's output, the `state` parameter, history entries, network requests, the clipboard, calls to listeners, console errors and CSP violation reports | `writes 1 history entry when the user drops an item in row S` |
| `renders` | what the page has in the DOM: elements, text, order, visibility, focus, images, colours | `renders the item in row S when the user drags it to row S` |

- Pick the verb of the assertion the test exists for. Join a second result with "and" only
  when the same condition produces it.
- A negative result uses the same verbs: `writes no history entry when …`, `returns null when …`.
- The condition states the input or the action. Unit tests: `when the host is …`, `when the
  list has 21 rows`. End-to-end tests: `when the user <action>`, `when the page opens <link>`,
  `when the request has <path>`.
- Use code names and UI labels exactly: row S, Unranked row, item, link image, device image,
  snapshot file, `state` parameter, history entry, toast, dialog, button "Share".
- Banned words: carry, keep, hold, give, bring, show, works, handles, correctly, properly,
  should, always.
- Decision ids such as (A10) and issue numbers such as (#107) stay at the end of the name.
- A name has at most 120 characters.
- `tests/unit/rules/test-names.test.ts` checks these rules, and the one top-level `describe` of
  each end-to-end file, on every test file.

## Golden shared links

`tests/fixtures/shared-links.json` holds real links that people have shared, together with
what a visitor must see when opening them. `shared-links.spec.ts` checks that every link
still opens exactly as captured, and `link-previews.api.spec.ts` checks their preview images.

The entries are a contract: links that are already out in the world must keep working. If
one of these tests fails, the app broke existing links. Fix the app. **Never edit, reorder or
remove an existing entry.**

To add links, append them with the capture script:

```bash
node scripts/capture-shared-links.mjs --source "Discord #tier-lists, 2026-10" <url-or-path> [...]
```

`tests/fixtures/state/` holds link states with the exact list each one must decode to.
`generated.json` holds 24 links written by the 2024 code of the three legacy formats (v0, v1,
v2). A script made them once from git history; it was removed in 2.0.0, and git history keeps
it (`scripts/generate-legacy-fixtures.mjs`). `v3.json` holds links in the v3 format, and each of its entries must also encode back
to its `state` (see `docs/reference/link-format.md`). The unit tests in `tests/unit/lib/state/` decode
every entry of these files and of `shared-links.json`.
The same rule applies: append, never edit. `npm run check:fixtures` fails when an existing
entry of a fixture file, `image-registry.lock.json` or `image-aliases.json` changed or
disappeared compared with the base branch (pass `-- --base <ref>` to choose the branch).

## Product rules

- **The browser history is the undo feature.** Every change to the list adds a history
  entry, and the Back button steps back to the previous version of the list, one change at a
  time (`history.spec.ts`). This is intended behaviour, not a bug.
- **Moving a row's items keeps the labels in place.** Dropping the stack of row S on A's
  position moves the contents; the labels stay S, A, B... from top to bottom. The grip moves the
  whole row, its name included (owner decision, 2026-11-14); the colours stay with the positions.
- **Label settings travel in the link without a Back step.** The label position and label
  visibility are part of v3 links, written in place of the current history entry (owner's
  decision, 2026-10-25). Back and Forward inside the editor keep the settings on screen; a link
  opened fresh shows its own. The page object waits for the address after each setting.

## Known bugs

A test for a confirmed bug describes the correct behaviour and goes in a `Known bugs`
describe block, marked with `test.fail(true, '<one-line reason>')`. Add an `issue`
annotation when there is a GitHub issue. The suite stays green while the bug exists. When a
fix lands, Playwright reports "Expected to fail, but passed": remove the marker then and move
the test next to the other tests of that feature.

A known-bug test waits until the page has settled (`settled()`), then reads the page once
(`expect(await ...)`) instead of waiting: it fails at once while the bug exists, and never runs
into the test timeout, which would not count as the expected failure.

Do not use `test.fail` for behaviour you are unsure about. Ask, or leave the test out.
