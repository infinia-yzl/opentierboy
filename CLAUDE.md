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
3. **Every shared link ever made keeps working.** Link formats v0, v1 and v2 decode forever.
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

Next.js 14 (App Router) · React 18 · TypeScript (strict) · Tailwind CSS 3 + shadcn/ui ·
`@hello-pangea/dnd` (drag and drop) · `lz-string` (link compression) · `html2canvas-pro`
(screenshots) · Playwright (end-to-end tests) · Vitest (unit tests) · hosted on Vercel.

## Commands

```bash
npm ci                    # install exactly what package-lock.json says
npm run dev               # prepare images, then the dev server on :3000
npm run build             # production build (prepares images on the first build)
npm run check             # type check + lint + unit tests (CI runs this)
npm run test:unit         # Vitest only
npx playwright install    # once per machine: the browsers for Playwright
npm run test:e2e          # Playwright; needs `npm run build` first
npm run test:e2e -- --project=chromium tests/e2e/ranking.spec.ts
```

- Run `npm run check` before every commit. CI runs the same script.
- Playwright runs against the production build. Rebuild before e2e tests after any change
  to `app/`, `components/`, `contexts/`, `lib/`, `models/`, `articles/`, `public/`,
  `imageset.config.json`, `imageset.custom.json` or the config files (`next.config.mjs`,
  `tailwind.config.ts`, `postcss.config.mjs`).
- `npm run build` copies image sets from `node_modules/image-*` into `public/images/` only
  once (then writes `.prepare-images-lock`). After changing `imageset.custom.json` or an
  `image-*` package, delete `.next` and `.prepare-images-lock` before building.
- Browsers already installed elsewhere: see `tests/README.md` (`PLAYWRIGHT_BROWSERS_PATH`).
- Link preview tests (`og-image.api.spec.ts`) need the server on port 3000. They skip
  themselves on other ports.

## Folder map

```
app/                  routes: / (landing), /rank/[[...slug]] (editor), /api/og (link preview
                      image, edge runtime), /blog, /about, sitemap
components/           React components; components/ui/ is shadcn/ui
contexts/TierContext.tsx   editor settings (label position, show labels)
lib/TierCortex.ts     link encode/decode, item lookup, custom items, preview helpers
lib/utils.ts          slugs for /rank URLs, tier gradients
models/               types: Tier (row templates), Item, ItemSet, ImageSet
scripts/prepareImages.js   builds imageset.config.json and public/images from image-* packages
imageset.custom.json  which image sets ship, with display names (edit this one)
imageset.config.json  generated from the packages (do not edit by hand)
articles/             blog posts (Markdown)
tests/e2e/            Playwright specs, one file per user journey
tests/pages/          page objects (TierListPage, SitePage)
tests/support/        test.ts (fixtures), links.ts (build a ranking link)
tests/fixtures/       golden shared links (append-only)
tests/unit/           Vitest unit tests (*.test.ts)
docs/                 owner checklists
```

Later phases add `lib/state/` (link format), `image-registry.lock.json` and
`image-aliases.json` (item ids), and `trusted-image-sites.json`.

## Link contract

- A shared link is `/rank/<set>/<tag>?state=<value>`. The value is lz-string
  `compressToEncodedURIComponent` of JSON.
- Formats: v0 is an array of tiers; v1 and v2 are `{title?, tiers: [{i, n, t: [{i, c?}]}]}`.
  The app writes v2 today. Future formats start with a version prefix (`3.`).
- Old formats are decoded forever. Never change what an old link decodes to.
- `tests/fixtures/shared-links.json` holds real links and what visitors must see.
  It is **append-only**: never edit, reorder or delete an entry. A failing fixture means the
  app broke old links: fix the app. Add links with `node scripts/capture-shared-links.mjs`.
- Do not update `lz-string` without the owner. A new version could decode old links
  differently.

## Image id contract

- Image sets are npm packages named `image-*`. Each image's id is
  `<packageName>-<filename>` and appears inside shared links.
- Never rename or delete an image file in a shipped set, and never drop a shipped set.
  Old links that use those ids would show placeholders.
- A rename needs an alias entry (old id → new id) in `image-aliases.json`.

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

- TypeScript strict. `tsconfig` has no `target`: avoid `for…of` over `Map`/`Set`
  iterators or `.entries()`; use `Array.from` or index loops.
- `app/api/og/` runs on the edge runtime. Code it imports (`lib/TierCortex.ts`) must not
  use Node APIs (`fs`, `path`) or browser APIs (`window`, `localStorage`) at import time.
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
