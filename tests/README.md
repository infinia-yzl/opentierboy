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
(`next.config.ts`, `postcss.config.mjs`). `npm run build` copies the
active image sets into `public/images/` before every build (the `prebuild` script). The
legacy image sets are committed there already.

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
  | `editor-layout` | the title row, the tools, the rows and the Unranked tray on screen |
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
  | `home` | the home page and Recently viewed |
  | `site-pages` | About, Blog and the links between pages |
  | `shared-links` | golden links people shared, and their page tags |
  | `legacy-sets` | the legacy image sets (pages, and `.api` for files, sitemap, shortcuts) |
  | `routes` | template pages (and `.api` for status codes and redirects) |
  | `link-previews.api` | the link preview image (`/api/og`) |
  | `security` | the Content Security Policy, user text as plain text, device pictures kept local |
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
  row is a `group` named after its label (the unnamed last row is `Unranked`, a row whose
  label was cleared is `Tier <n>`), an item is a `button` named after its label, a row
  handle is a `button` named `Move tier <label>`. The Unranked tray has no handle; every row
  and the tray hold a level-2 heading, which is how the page object finds them. If an element has no accessible name, add
  one to the app (an `aria-label` or `sr-only` text) instead of using CSS or test ids.
- **Never sleep.** No `waitForTimeout` and no fixed delays. Wait for what the user would
  see: web-first assertions such as `toHaveText`, the drag announcer for drag and drop, and
  the address bar for saved changes. Page object methods that change the list return only
  after the new link is in the address bar.
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
  outside `url`), and fetches the server makes for `/api/og` (no test sends it a trusted-site
  image).
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

The editor's drag and drop runs on dnd-kit through `lib/dnd` (`docs/dnd-fork.md`). During a
drag the editor shows the list as it would be after the drop: rows and items move out of the
way of the dragged one. The list itself changes only on the drop, with one history entry.

- **Mouse.** `TierListPage.dragWithMouse` presses, moves a few pixels (a mouse drag starts
  after 5 px) and waits for the lift announcement. After the drop it waits until the drop
  animation (about 300 ms) ends: until then a press starts no drag and the drag library blocks
  text selection on the page, so typing into a label would go nowhere.
- **Where to aim.** Drops on a row (its free space, or the place of another row) measure the
  drop point once, before the drag starts: a row measured during the drag has already moved.
  Drops before or after an item (`dragItemNextTo`, `dragItemOnto`) follow the target item until
  it stays put: an item goes before or after the item under the pointer, by the half the
  pointer is over, so following the target settles.
- **Keyboard.** `moveItemWithKeyboard` and `moveTierWithKeyboard` wait for the announcement
  after each key, and after the drop for focus to come back to the item or row handle.
- **Announcements.** The live region is `dragAnnouncer` (`role="status"`, id starting with
  `dnd-kit-announcement`). dnd-kit reads moves after 500 ms, so wait for the text.
- **Touch.** `touchDragItemToTier`, `longPressItem` and `swipeUpFromItem` send touch events
  through the Chrome DevTools Protocol, so those tests run only on Chromium phones
  (`mobile-chrome`). The hold before a touch drag lives in the event times, so the test does
  not wait for it; the long press waits until the item menu shows.
- **Rows that wrap** are tested at the default window size: twelve tiles do not fit on one
  line.

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
to its `state` (see `docs/link-format-v3.md`). The unit tests in `tests/unit/lib/state/` decode
every entry of these files and of `shared-links.json`.
The same rule applies: append, never edit. `npm run check:fixtures` fails when an existing
entry of a fixture file, `image-registry.lock.json` or `image-aliases.json` changed or
disappeared compared with the base branch (pass `-- --base <ref>` to choose the branch).

## Product rules

- **The browser history is the undo feature.** Every change to the list adds a history
  entry, and the Back button steps back to the previous version of the list, one change at a
  time (`history.spec.ts`). This is intended behaviour, not a bug.
- **Moving a row keeps the labels in place.** Dropping row S on A's position moves the
  contents; the labels stay S, A, B... from top to bottom.
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

Assertions in known-bug tests use short timeouts (`{timeout: 3_000}`), so they fail fast and
never run into the test timeout, which would not count as the expected failure.

Do not use `test.fail` for behaviour you are unsure about. Ask, or leave the test out.
