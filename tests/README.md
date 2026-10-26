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
npm run test:e2e -- --project=chromium tests/e2e/ranking.spec.ts
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
`og-image.api.spec.ts` skip themselves on a local server that is not on port 3000, because
the preview route loads item images from `http://localhost:3000` outside Vercel.

The tests run against the production build, not the dev server. Rebuild after every change
to what the build reads: `app/`, `components/`, `contexts/`, `lib/`, `models/`, `articles/`,
`public/`, `imageset.config.json`, `imageset.custom.json` and the config files
(`next.config.ts`, `postcss.config.mjs`). `npm run build` copies the
official image sets into `public/images/` before every build (the `prebuild` script). The
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
  e2e/            specs, one file per user journey (ranking, editing, sharing, history...)
  pages/          page objects: TierListPage (the editor at /rank/...), SitePage
  support/        test.ts (fixtures and assertions), links.ts (build a ranking link)
  fixtures/       shared-links.json (golden links), state/ (golden link states), images/ (files to upload)
  unit/           Vitest unit tests (*.test.ts), for example the link format in lib/state
```

## Writing tests

- **Import `test` and `expect` from `tests/support/test.ts`.** It provides the `tierList`,
  `site` and `openAsVisitor` fixtures (the last one opens a link in a fresh browser, like a
  friend who receives it), and `consoleErrors`: the errors the page logged to the browser
  console during the test.
- **Describe what the user does and sees.** Test names read as behaviour ("drag an item from
  Unranked into a tier"), not as implementation.
- **Put page knowledge in the page objects.** Specs call `tierList.dragItemToTier('Mauga', 'S')`
  and never touch selectors directly. Add a method to the page object when a spec needs a
  new action.
- **Locate by role and accessible name**, the way assistive technology sees the page: a tier
  row is a `group` named after its label (the unnamed last row is `Unranked`, a row whose
  label was cleared is `Tier <n>`), an item is a `button` named after its label, a row
  handle is a `button` named `Move tier <label>`. If an element has no accessible name, add
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
  `tests/support/imageSites.ts`. Lint refuses the ways around it (`route.continue()`,
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
  tab skips WebKit (`BLOB_TAB_SKIP`). Both reasons live in `tests/pages/TierListPage.ts`. These
  are limits of the test tools; Chromium runs every one of these tests.
- **Run a new test under load before you commit it**, for example
  `npx playwright test --workers=4 --repeat-each=5 path/to.spec.ts`.

### Drag and drop

The app uses `@hello-pangea/dnd`. The drag library measures every row and item when a drag
starts, moves other elements out of the way during the drag, and auto-scrolls the page near
the window edges. `TierListPage.dragWithMouse` therefore measures the drop point once,
before the drag starts, in page coordinates, and then keeps the pointer on that page point
until the page stops scrolling. Do not re-measure the drop target during a drag: it has
already moved out of the way.

## Golden shared links

`tests/fixtures/shared-links.json` holds real links that people have shared, together with
what a visitor must see when opening them. `shared-links.spec.ts` checks that every link
still opens exactly as captured, and `og-image.api.spec.ts` checks their preview images.

The entries are a contract: links that are already out in the world must keep working. If
one of these tests fails, the app broke existing links. Fix the app. **Never edit, reorder or
remove an existing entry.**

To add links, append them with the capture script:

```bash
node scripts/capture-shared-links.mjs --source "Discord #tier-lists, 2026-10" <url-or-path> [...]
```

`tests/fixtures/state/` holds link states with the exact list each one must decode to.
`generated.json` comes from the historical encoders of the three legacy formats (v0, v1, v2),
run from git history by `node scripts/generate-legacy-fixtures.mjs` (see the comment at its
top). `v3.json` holds links in the v3 format, and each of its entries must also encode back
to its `state` (see `docs/link-format-v3.md`). The unit tests in `tests/unit/state/` decode
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
