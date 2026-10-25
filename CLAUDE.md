# OpenTierBoy

A tier list maker at opentierboy.com. No accounts, no database. The whole list lives in the
page link (`?state=`), and sharing the link shares the list.
`AGENTS.md` is a symlink to this file. Edit `CLAUDE.md` only.

## Product rules (never break these)

1. **Existing behaviour is intended.** Do not add, remove or change anything users can see
   or do unless the task says so. If something looks wrong, ask the owner first, or record it
   as a known-bug test (see Tests). Do not fix it on the side.
2. **Browser history is the undo feature.** Every change to the list pushes a new history
   entry (`router.push` with a new `?state=`). Back steps to the previous version. Never use
   `router.replace` or `history.replaceState` for list edits. Never merge or skip entries.
3. **Every shared link ever made keeps working.** Link formats v0, v1, v2 and v3 decode forever.
   The golden fixtures in `tests/fixtures/` are append-only. See "Link contract" below.
4. **Item ids are permanent.** An id is `<packageName>-<filename>`, for example
   `image-overwatch-ana.webp`. Never rename or remove a shipped id. Renames go through
   `image-aliases.json` only.
5. **Links are the only save.** No accounts, no database, no server storage of lists or
   images. Images uploaded from a device never reach the server.
6. **Tier labels describe positions.** Dragging row S onto A's place moves the contents. The
   labels stay S, A, B... from top to bottom.

## Ask before you

Ask the owner first, unless the task explicitly asks for it:

- change anything a user can see or do (layout, wording, flows, defaults);
- change how links are encoded or decoded;
- add a dependency, or upgrade a major version;
- edit a workflow in `.github/` or this file.

Never edit or delete an existing fixture entry, even when asked to "fix a test".

When unsure, stop and ask. Explain the change and its risk in plain words.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) · Tailwind CSS 4 + shadcn/ui ·
`@hello-pangea/dnd` (drag and drop) · `lz-string` (link compression) · `html2canvas-pro`
(screenshots) · Playwright (end-to-end tests) · Vitest (unit tests) · hosted on Vercel.

## Commands

```bash
npm ci                    # install exactly what package-lock.json says
npm run dev               # prepare images, then the dev server on :3000
npm run build             # prepare images, check item ids, then the production build
npm run check             # type check, lint, unit tests, item ids, fixtures (CI runs this)
npm run lint              # ESLint (`eslint .`, config in eslint.config.mjs)
npm run test:unit         # Vitest only
npm run check:images      # every shipped item id is registered (`-- --update` adds new ids;
                          # `-- --files`: its image and PNG copy are in public/images/)
npm run check:fixtures    # no fixture entry changed since the base branch (`-- --base <ref>`)
npx playwright install    # once per machine: the browsers for Playwright
npm run test:e2e          # Playwright; needs `npm run build` first
npm run test:e2e -- --project=chromium tests/e2e/ranking.spec.ts
```

- Run `npm run check` before every commit. CI runs the same script.
- Playwright runs against the production build. Rebuild before e2e tests after any change
  to `app/`, `components/`, `contexts/`, `lib/`, `models/`, `articles/`, `public/`,
  `imageset.config.json`, `imageset.custom.json` or the config files (`next.config.mjs`,
  `postcss.config.mjs`). Tailwind 4 has no config file: the theme lives in
  `app/globals.css`.
- `npm run build` first runs the `prebuild` script: it copies the official image sets from
  `node_modules/image-*` into `public/images/` (with their PNG copies for link previews),
  checks the committed legacy images and makes their PNG copies, then runs
  `check:images -- --files`, so a lost item id
  or image file stops the build. Always build with `npm run build`. A plain `next build` skips the images.
- Browsers already installed elsewhere: see `tests/README.md` (`PLAYWRIGHT_BROWSERS_PATH`).
- Link preview tests (`og-image.api.spec.ts`) need the server on port 3000. They skip
  themselves on other ports.

## Folder map

```
app/                  routes: / (landing), /rank/[[...slug]] (editor), /api/og (link preview
                      image, edge runtime), /blog, /about, sitemap
components/           React components; components/ui/ is shadcn/ui
contexts/TierContext.tsx   the editor store: TierListProvider runs lib/tierListReducer.ts and
                      syncs it with the address (one router.push per list change, one at a time;
                      label settings use router.replace, owner decision A3)
lib/tierListReducer.ts   editor state and every change to it (pure reducer), link writes queue
lib/TierCortex.ts     item lookup and aliases, item and category shapes, custom items, preview
                      helpers, the link encode and decode used by the store
lib/legacyLinkLimits.ts   limits and type checks for v0-v2 links (JSON size, rows, items, types)
lib/dragAnnouncements.ts  screen reader messages for drag and drop (labels, never ids)
lib/imageSets.ts      visibleImageSets(): the sets offered in the picker, landing page, sitemap
lib/state/            link format: decodeState (all formats), encodeState (v3; v2 on request); lz-string only
lib/state/deviceId.ts device image id rule (A40) and legacy upload ids (A42)
lib/state/lz.ts       lz-string decompression with an output cap, checked before decompressing
lib/utils.ts          slugs for /rank URLs, tier gradients
lib/mdx.ts            blog article options (JavaScript in articles is removed, never run)
models/               types: Tier (row templates), Item, ItemSet, ImageSet
scripts/prepareImages.js   builds imageset.config.json and public/images from the official image-*
                      packages, and checks the committed legacy images (see "Image sets")
scripts/lib/image-sets.mjs   shared rules: official vs legacy, config entries, shapes
scripts/image-set-update.mjs   checks for the image-set-update workflow (payload and patch gate)
scripts/generate-legacy-fixtures.mjs   golden links from the historical encoders (git history)
image-registry.lock.json   every item id ever shipped (append-only)
image-aliases.json    old item id → new item id, for renamed images
imageset.custom.json  which image sets ship, in display order: official sets with display names,
                      legacy sets as {"legacy": true} (the official list)
imageset.legacy.json  frozen config entries of the legacy sets (append-only, never edit an entry)
imageset.config.json  generated by prepareImages (do not edit by hand)
public/images/        official sets: copied at build time (git-ignored); legacy sets: committed
                      WebP images (image-set, image-wutheringwaves, image-webdev, image-supervive,
                      image-helldivers2). PNG copies of all sets are made at build time (git-ignored)
articles/             blog posts (Markdown)
tests/e2e/            Playwright specs, one file per user journey
tests/pages/          page objects (TierListPage, SitePage)
tests/support/        test.ts (fixtures), links.ts (build a ranking link)
tests/fixtures/       golden shared links and link states (append-only)
tests/unit/           Vitest unit tests (*.test.ts)
docs/                 owner checklists
```

A later phase adds `trusted-image-sites.json`.

## Link contract

- A shared link is `/rank/<set>/<tag>?state=<value>`. The value is lz-string
  `compressToEncodedURIComponent` of JSON.
- Formats: v0 is an array of tiers; v1 and v2 are `{title?, tiers: [{i, n, t: [{i, c?}]}]}`.
  The app writes v3: `3.` + lz-string of `{t?, tp?, lp?, sl?, r}` (see `docs/link-format-v3.md`).
  Rows are `[id?, name, items]`. An item is an image-set id, `{i, c}` (an id that names no
  image-set item, with its label), `{u, c}` (link image) or `{d, c}` (device image).
  `DEFAULT_WRITE_FORMAT` in `lib/state/encode.ts` chooses the format. v3 fixtures live in
  `tests/fixtures/state/v3.json` (append-only).
- Label position and label visibility are written with `router.replace`, so they add no Back
  step (owner decision A3, 2026-10-25). Every list change pushes a new history entry.
- Old formats are decoded forever. Never change what an old link decodes to.
- `lib/state/` holds the format. It imports only `lz-string` (no React, `window`,
  `localStorage` or Node modules), because the edge OG route uses it too.
- `lib/state/decoders/legacy.ts` is frozen: never edit it. If an old link stops decoding,
  fix the code around it.
- `tests/fixtures/shared-links.json` holds real links and what visitors must see.
  `tests/fixtures/state/generated.json` holds links from the historical v0–v2 encoders
  (`node scripts/generate-legacy-fixtures.mjs` runs them from git history and only appends).
  Both are **append-only**: never edit, reorder or delete an entry. A failing fixture means
  the app broke old links: fix the app. Add links with `node scripts/capture-shared-links.mjs`.
  `npm run check:fixtures` fails when an entry changed or disappeared.
- Do not update `lz-string` without the owner. A new version could decode old links
  differently.

## Image id contract

- Image sets are npm packages named `image-*`. Each image's id is
  `<packageName>-<filename>` and appears inside shared links.
- Never rename or delete an image file in a shipped set, and never drop a shipped set.
  Old links that use those ids would show placeholders.
- `image-registry.lock.json` lists every id ever shipped. Never remove or change an entry.
  `npm run check:images` fails when a registered id is gone without an alias;
  `npm run check:images -- --update` appends new ids.
- A rename needs an alias entry (old id → new id) in `image-aliases.json`.
  `TierCortex.resolveItem` follows it, so old links show the renamed image.
- **An alias target must be a new id, added in the same change that removes the old id.**
  Never point an alias at an id that already shipped: an old list holding both ids would show
  the merged image twice, with duplicate drag ids. `image-set-update.yml` refuses such aliases.

## Image sets

- **Official sets** come from npm: THE FINALS (`image-reachthefinals`) and OVERWATCH
  (`image-overwatch`). They are the entries of `imageset.custom.json` without `"legacy"`.
  New versions arrive as pull requests from `.github/workflows/image-set-update.yml`: an image
  set repository publishes to npm and sends `repository_dispatch` `image-set-published` with
  `{package, version}`. The workflow installs that exact version, registers new ids and runs
  the checks and tests. The owner reviews and merges every pull request; nothing merges on its
  own. Dependabot's `image-sets` group is the fallback.
- **Legacy sets** are frozen: SUPERVIVE, WUTHERING WAVES, HELLDIVERS 2, Web Development
  Technologies and the example template (`image-set`). Their entries live in
  `imageset.legacy.json` and their WebP images are committed in `public/images/<package>/`
  (prepareImages makes their PNG copies at build time). Never edit, move or delete them. They are hidden from the template
  picker, the landing page and the sitemap (`lib/imageSets.ts`), the app shortcuts
  (`app/manifest.ts`) and the search engine data (`app/layout.tsx`), but their `/rank` pages,
  old links and link previews keep working (`tests/e2e/legacy-sets*.spec.ts`).
- **Shapes**: an image set may declare `shape` (`square`, `landscape` or `portrait`) per image
  and per category. `imageset.config.json` stores it only when it is not square, and
  `TierCortex` puts it on items (`itemShape()`). Tiles still render square until the drag and
  drop update (Phase 5e). Until then, image sets must not publish other shapes; a unit test in
  `tests/unit/shapes.test.ts` fails if `imageset.config.json` holds one.
- **Adding DEADLOCK** (`image-deadlock`, not on npm yet). Once its first version is published
  (a manual owner step, `docs/setup-checklist.md`), one pull request adds it:
  1. add `"image-deadlock": {"displayName": "DEADLOCK", ...}` at the end of
     `imageset.custom.json` (this puts it on the official list; the display name becomes its
     URL slug, so choose it once);
  2. `npm install image-deadlock@<version> --save-exact`;
  3. `npm run prepare-images` and `npm run check:images -- --update`, then commit
     `imageset.config.json` and `image-registry.lock.json`;
  4. if it should have a landing page card, add it to `FEATURED_SETS` in `app/page.tsx`
     (ask the owner; tests in `tests/e2e/legacy-sets.spec.ts` list the cards).
  The image-deadlock repository's `release.yml` already sends the dispatch, so later versions
  arrive through `image-set-update.yml`. The workflow refuses packages that are not on the
  official list, so the first version cannot come through it.
- **Making a set legacy**: copy its entry from `imageset.config.json` into
  `imageset.legacy.json` with `"legacy": true`, commit its WebP images in `public/images/` (with
  a `.gitignore` negation; never the PNG copies), set its `imageset.custom.json` entry to
  `{"legacy": true}`, `npm uninstall` the package, add it to `LEGACY_SETS` in
  `tests/support/links.ts`, and check that `imageset.config.json` only gained `"legacy": true`.

## Tests

- Read `tests/README.md` before writing e2e tests.
- Import `test` and `expect` from `tests/support/test.ts`. Put selectors in page objects
  (`tests/pages/`), never in specs.
- Locate by role and accessible name. If an element has none, add an `aria-label` to the
  app. No CSS selectors, no test ids.
- Never sleep: no `waitForTimeout`, no fixed delays. Wait for what the user sees.
- Arrange state through the URL with `rankingState()` from `tests/support/links.ts`.
- Tag read-only journeys that work on phones with `@mobile`.
- A confirmed bug gets a test of the correct behaviour in a `Known bugs` describe block,
  marked `test.fail(true, '<reason>')`. When you fix it, remove the marker and move the test.
- Run new e2e tests under load: `--repeat-each=5 --workers=4`.
- Unit tests: Vitest, `tests/unit/**/*.test.ts`, import app code through `@/`.
- Keep tests cross-browser (Chromium, Firefox, WebKit).

## Code conventions

- TypeScript strict. `tsconfig.json` targets ES2017: Next.js adds that target on build when
  it is missing, so keep it.
- `app/api/og/` runs on the edge runtime. Code it imports (`lib/TierCortex.ts`, `lib/state/`)
  must not use Node APIs (`fs`, `path`) or browser APIs (`window`, `localStorage`) at import
  time. ESLint enforces this for `lib/state/` and `app/api/og/`.
- Follow the patterns in nearby code. Keep changes small and focused on the task.
- Never commit secrets. Never add tracking, analytics or ads.

## Commits and pull requests

- Conventional Commits: `type(scope): summary`, for example
  `fix(editor): keep the title when switching templates`.
- Small, logical commits. Each commit passes `npm run check`.
- Pull request text: what changed, why, how you verified it, and what you could not verify.
- Write for the owner in plain, short sentences.

## Review rules

Reviews (human or Claude) flag these as bugs:

- Breaking a product rule above, or changing behaviour the task did not ask for.
- Editing or deleting an existing fixture entry, or a change that alters what an old link
  decodes to.
- Renaming or removing an image file, image set or item id.
- Cross-site scripting: user text (titles, labels, link data) rendered as HTML, or
  `dangerouslySetInnerHTML` with anything other than trusted JSON.
- Untrusted input (shared links, uploaded or pasted files, image URLs) parsed without
  validation and size limits.
- The server fetching a URL that came from a user.
- Secrets in code, logs or test fixtures.
- GitHub workflows with `pull_request_target`, write permissions they do not need, or
  event data (titles, branch names, payloads) placed directly in `run:` steps. Pass such
  data through `env:` instead.
- Third-party actions not pinned to a full commit SHA.
