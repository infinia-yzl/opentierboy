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
dnd-kit (drag and drop; a fork in `packages/dnd-kit`, used only through `lib/dnd`) · `lz-string`
(link compression) · `html2canvas-pro` (screenshots) · Playwright (end-to-end tests) · Vitest
(unit tests) · hosted on Vercel.

## Commands

```bash
npm ci                    # install exactly what package-lock.json says
npm run dev               # prepare images, then the dev server on :3000
npm run build             # prepare images, check item ids, then the production build
npm run check             # type check, lint, unit tests, item ids, trusted sites, fixtures (CI runs this)
npm run lint              # ESLint (`eslint .`, config in eslint.config.mjs)
npm run test:unit         # Vitest only
npm run check:images      # every shipped item id is registered (`-- --update` adds new ids;
                          # `-- --files`: its image and PNG copy are in public/images/)
npm run check:fixtures    # no fixture entry changed since the base branch (`-- --base <ref>`)
npm run check:trusted-sites   # no trusted image site is on the pinned tracker list (downloads it with git)
npx playwright install    # once per machine: the browsers for Playwright
npm run test:e2e          # Playwright; needs `npm run build` first
npm run test:e2e -- --project=chromium tests/e2e/ranking.spec.ts
```

- Run `npm run check` before every commit. CI runs the same script.
- Playwright runs against the production build. Rebuild before e2e tests after any change
  to `app/`, `components/`, `contexts/`, `lib/`, `models/`, `articles/`, `public/`,
  `imageset.config.json`, `imageset.custom.json` or the config files (`next.config.ts`,
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
components/           React components; components/ui/ is shadcn/ui; DragDropTierList.tsx is the
                      editor's rows (drag and drop through lib/dnd/react.tsx)
contexts/TierContext.tsx   the editor store: TierListProvider runs lib/tierListReducer.ts and
                      syncs it with the address (one router.push per list change, one at a time;
                      label settings use router.replace, owner decision A3)
contexts/CustomImagesContext.tsx   the editor's device images (store, object URLs, legacy
                      uploads) and link images (allowed sites, load checks)
lib/tierListReducer.ts   editor state and every change to it (pure reducer), link writes queue;
                      moves and added or removed rows come from lib/dnd/moves.ts
lib/TierCortex.ts     createTierCortex(): the functions of the next three modules, bound to the
                      app's aliases, image sets and base URL (used by the store, /rank and /api/og)
lib/packageItems.ts   item lookup (built once per image-set config, shared), aliases, placeholder
                      items, item and category shapes, custom items
lib/listLink.ts       the link encode and decode used by the store: link to tiers of items, and back
lib/linkPreview.ts    preview helpers for the OG route: row gradients, preview image URLs, base URL
lib/legacyLinkLimits.ts   limits and type checks for v0-v2 links (JSON size, rows, items, types)
lib/dnd/              drag and drop adapter, the only code that imports dnd-kit: pure moves, previews,
                      keyboard targets, announcements (labels, never ids), touch activation, and
                      the React API in react.tsx (docs/dnd-fork.md)
lib/tileSize.ts       tile sizes by shape (square, landscape, portrait)
lib/imageSets.ts      visibleImageSets(): the sets offered in the picker, landing page, sitemap
lib/state/            link format: decodeState (all formats), encodeState (v3; v2 on request); lz-string only
lib/state/deviceId.ts device image id rule (A40) and legacy upload ids (A42)
lib/state/lz.ts       lz-string decompression with an output cap, checked before decompressing
lib/images/           images from links and devices: address checks, trusted sites, device
                      image store (the only IndexedDB code), image load check
lib/security/         Content Security Policy header (sent by next.config.ts)
lib/zod.ts            zod without eval (import `z` from here, never from `zod`)
lib/snapshot/         snapshot files: the list inside a Freeze Frame PNG (iTXt chunk, checked
                      reader, zod payload), and what opening a file does
lib/recent/           Recently viewed: links this browser opened, in local storage (pins, caps)
lib/rankPath.ts       the /rank path rule for stored paths, and page names for lists without a title
lib/utils.ts          slugs for /rank URLs, tier gradients
lib/mdx.ts            blog article options (JavaScript in articles is removed, never run)
models/               types: Tier (row templates), Item, ItemSet, ImageSet
packages/dnd-kit/     the vendored dnd-kit fork (npm workspaces, committed build; docs/dnd-fork.md)
scripts/prepareImages.js   builds imageset.config.json and public/images from the official image-*
                      packages, and checks the committed legacy images (see "Image sets")
scripts/lib/image-sets.mjs   shared rules: official vs legacy, config entries, shapes
scripts/image-set-update.mjs   checks for the image-set-update workflow (payload and patch gate)
scripts/generate-legacy-fixtures.mjs   golden links from the historical encoders (git history)
image-registry.lock.json   every item id ever shipped (append-only)
image-aliases.json    old item id → new item id, for renamed images
trusted-image-sites.json   sites whose link images load without asking
scripts/tracker-list.pin.json   the tracker list check:trusted-sites downloads (no copy in the repo)
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
  `resolveItem` (`lib/packageItems.ts`) follows it, so old links show the renamed image.
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
  `packageItemLookup` (`lib/packageItems.ts`) puts it on items (`itemShape()`). Tiles render
  at their shape (`lib/tileSize.ts`), but link previews still draw every image as a square.
  Until the owner decides otherwise, image sets must not publish other shapes; a unit test in
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

## Custom images

- **Link images** (`{u, c}` items) load from other sites in the visitor's browser. An address
  must pass `checkLinkImageUrl` (`lib/images/linkImage.ts`): https only, no IP addresses, no
  local or private names, no user names, passwords or ports, at most 2,000 characters. Store
  the normalised address it returns.
- Render link images with a plain `<img referrerPolicy="no-referrer" loading="lazy">`. Never
  send them through `next/image` or `/_next/image`, and never add `https://**` to
  `images.remotePatterns` (A8).
- **Trusted sites** (`trusted-image-sites.json`) load without asking. Images from any other
  site load only after the visitor chooses Load (this page) or Always allow these sites (kept
  in localStorage). Nothing may request such an image before that.
  `npm run check:trusted-sites` checks the list against the pinned Disconnect tracker list.
- **The server never fetches a user's address**, with one exception: the OG route draws images
  from trusted sites, with caps (`app/api/og/link-images.ts`). Every other link image and every
  device image is a label tile. A link image address never reaches `inlineLocalImages`.
- **Device images** (`{d, c}` items: uploads and pasted images) stay in the visitor's browser,
  in IndexedDB. `lib/images/deviceStore.ts` is the only module that may use IndexedDB (ESLint
  enforces it). The list holds only the image id (`isDeviceImageId` in `lib/state/deviceId.ts`).
  Open the store only in effects (`contexts/CustomImagesContext.tsx`), never during rendering,
  so the server and the browser render the same list. Make object URLs only from a Blob of the
  type sniffed from the bytes (`ObjectUrlRegistry.urlFor(id, blob, type)`,
  `previewableImage`), never from a `File`: its type comes from its name, and a `text/html`
  `blob:` URL runs as a page of this site.
- Uploads that older versions kept in localStorage (`customItems`) move into the store, under
  `legacy-<id>` when the id is too short (A42). Old links keep their images.
- **Content Security Policy**: `next.config.ts` sends the header from `lib/security/csp.ts`.
  Inline scripts are allowed; eval is not (only `next dev` allows it). A new external script,
  font or connection needs a change to the policy and to `tests/e2e/csp.spec.ts`.
- **zod**: import `z` from `@/lib/zod`, never from `zod`. Plain zod tries eval when it builds a
  schema, which the policy reports as a violation (A39).

## Snapshot files and recently viewed

- **Snapshot file**: Freeze Frame's Download saves the captured PNG with one `iTXt` chunk
  (keyword `opentierboy`) that holds the list: `{version: 1, state, path?, images}`. `state` is
  the v3 link Share hands out; `images` are the list's device images as raster data URLs.
  Format, limits and reason codes: `docs/snapshot-and-recent.md`. Saved files must keep
  opening, like old links: never change what payload version 1 means.
- Files are untrusted input. `readSnapshotFile` (`lib/snapshot/`) checks the PNG (signature,
  CRCs, size caps, capped decompression) and the payload (zod, caps, and each image's size as
  its header declares it, at most 4096 x 4096), and never throws. Every image is drawn again
  through a canvas before it is stored (`prepareImageForStore` with `alwaysReencode`), because
  the payload checks only its header (A10).
- Open file, a dropped file and a pasted file all go through `openFiles` in
  `components/useSnapshotFiles.tsx`. A file with a list asks first, then opens with one
  `router.push` (one Back step). Pictures become items, like "From your device".
- **Recently viewed** (`lib/recent/recentLinks.ts`, `components/useRecentLinks.ts`, the landing
  page section) keeps the links this browser opened in local storage (`otb-recent-links`). The
  editor records a list once, when it opens with a list in its link; edits never record. Pin
  limit 20 and unpinned limit 30 are constants (owner review). Stored entries are checked with
  zod, and only plain `/rank` paths pass (`lib/rankPath.ts`).

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
- `app/api/og/` runs on the edge runtime. Code it imports (`lib/TierCortex.ts` and the modules
  it binds, `lib/state/`) must not use Node APIs (`fs`, `path`) or browser APIs (`window`,
  `localStorage`) at import time. ESLint enforces this for `lib/state/` and `app/api/og/`.
- Functional style (owner, A47): plain functions and readonly data. No classes in any code
  file (ESLint enforces it); only `tests/`, `packages/` and the root config files named in
  `ROOT_CONFIG_FILES` may use them. The other exception is a class that a third-party API
  requires: it goes in the one file that wraps that API, listed in `ALLOWED_CLASS_FILES` in
  `eslint.config.mjs` (today `lib/dnd/dndKit.ts`, for dnd-kit's activation constraint). Never
  turn the rule off with an `eslint-disable` comment.
- State that outlives a call lives in a factory function with closures (for example
  `createTierCortex`, `createMemoryDeviceStore`). UI state lives in React hooks.
- Errors are plain `Error` objects with a `name` and a `code` (see `pixelCapError()` in
  `lib/images/prepareImage.ts`), or result objects. Never use `instanceof` on our own types.
  A programmer error, such as a bad argument, may throw a built-in `RangeError` or
  `TypeError`.
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
