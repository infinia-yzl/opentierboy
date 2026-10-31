# Drag and drop: the dnd-kit fork and lib/dnd

The editor's drag and drop runs on dnd-kit. It replaced `@hello-pangea/dnd`, which cannot
handle rows that wrap onto several lines (#142). This document covers the copy of dnd-kit in
`packages/dnd-kit` and the adapter in `lib/dnd`, which is the only code that uses it.

## What is vendored, and why

`packages/dnd-kit` holds the dnd-kit packages that `@dnd-kit/react` needs, copied from the
official repository:

| Package | Folder |
| --- | --- |
| `@dnd-kit/abstract` | `packages/dnd-kit/abstract` |
| `@dnd-kit/collision` | `packages/dnd-kit/collision` |
| `@dnd-kit/dom` | `packages/dnd-kit/dom` |
| `@dnd-kit/geometry` | `packages/dnd-kit/geometry` |
| `@dnd-kit/helpers` | `packages/dnd-kit/helpers` |
| `@dnd-kit/react` | `packages/dnd-kit/react` |
| `@dnd-kit/state` | `packages/dnd-kit/state` |

- Source: https://github.com/clauderic/dnd-kit, tag `@dnd-kit/react@0.5.1`, commit
  `01bc678e93477e56a78aa2244c69b08a96cb0da6` (2026-10-15). All seven `@dnd-kit/<name>@0.5.1`
  tags point at that commit.
- Why 0.5.1: the latest stable release. It was 10 days old when it was copied, which meets the
  7-day wait for new releases.
- Why a fork: the tier list needs things that dnd-kit may not ship soon (or ever), for example
  keyboard moves in wrapping rows and touch gestures next to the item menu. With a fork, a fix
  is a normal commit here, and it can go upstream as a pull request later.
- Licence: MIT. `packages/dnd-kit/LICENSE`, the `LICENSE` in every package folder and
  `packages/dnd-kit/NOTICE` (source, tag, commit) must stay with the code.

Also copied: the shared TypeScript settings (`packages/dnd-kit/config/typescript`). Not copied:
the rest of the upstream repository (other frameworks, docs, stories, the lint package).

## How the app uses the packages

The seven folders are **npm workspaces** of the app (`workspaces` in the root `package.json`).
`npm ci` links them into `node_modules/@dnd-kit/`. The app depends on `@dnd-kit/abstract`,
`@dnd-kit/dom` and `@dnd-kit/react` at exactly `0.5.1`.

Each package folder holds its **built files, committed to git**, next to its `src/`. The app
reads them like any npm package. So Vercel and CI build the app with no extra tool, and the
app's `tsc` reads the packages' `.d.ts` files.

Why not let Next.js compile the TypeScript sources (`transpilePackages`)? The sources of
`@dnd-kit/abstract` and `@dnd-kit/dom` use standard decorators with `accessor` fields
(`@reactive accessor value`). Next.js's compiler setup would need extra support for those,
which nothing here proves. The committed build is plain JavaScript, and it is byte for byte the
same as the npm release (see "Building"), so it is easy to trust and to check.

The root `tsc`, ESLint and Vitest skip `packages/` (`tsconfig.json` `exclude`, `globalIgnores`
in `eslint.config.mjs`, `exclude` in `vitest.config.mts`). The upstream tests in the package
folders need Bun and do not run here.

### One copy of each package

dnd-kit's packages depend on each other with ranges like `^0.5.1`. If a fork version stops
matching such a range, npm quietly installs a second copy from the registry. Two copies of
`@dnd-kit/state` (or of `@preact/signals-core`) break drag and drop at runtime. So:

- Fork versions are plain release numbers, never prerelease suffixes such as `0.5.1-otb.1`
  (a prerelease does not match `^0.5.1`).
- `npm ls @dnd-kit/state @preact/signals-core` must show one copy of each.
- `tests/unit/dnd/workspace.test.ts` checks this on every `npm run check`: the lockfile links
  each package to its folder and has no other `@dnd-kit` copy, there is one
  `@preact/signals-core`, every internal range matches, and the built entry files exist.

**Dependabot:** a registry update for `@dnd-kit/*` (for example 0.5.2) would replace the link
with a registry copy. `.github/dependabot.yml` ignores `@dnd-kit/*` (an owner decision), so
Dependabot proposes none. Update through "Updating from upstream" below.

## Building

```bash
npm ci                              # in the repository root, links the workspaces
node packages/dnd-kit/build.mjs     # installs the tools, builds, deletes the tools
```

`build.mjs` runs each package's upstream `build` script (tsup commands, written for Bun) with
Node, in dependency order, and writes the output where `package.json` points. It deletes build
files that upstream does not publish, so each folder holds what the npm package holds. A full
build takes about 1.5 minutes.

The tools are the versions upstream used for 0.5.1, listed in `packages/dnd-kit/package.json`:
tsup 8.3.0, TypeScript 5.8.3, `@types/react` 19.2.14, `bun-types` 1.2.15, and through
`overrides` esbuild 0.23.1 and rollup 4.40.1. `packages/dnd-kit/.npmrc` writes no lockfile,
skips install scripts, and only takes releases published before a fixed date (`before=`), so
every machine gets the same versions. The script deletes the tools afterwards: their
`@types/react` would otherwise sit next to the packages and clash with the app's own copy in
type checks (`--keep-tools` keeps them).

There is no lockfile for the tools on purpose. esbuild 0.23.1 has a known advisory for its
development server (GHSA-67mh-4wv8-2f99). The build never starts that server, but a lockfile
with it would fail the OSV-Scanner check on pull requests. The tools never reach the app's
install.

### Checking the build against npm

The committed output was checked against the npm tarballs: all 77 files are identical. To
repeat the check after a build:

```bash
mkdir -p /tmp/dnd-npm && cd /tmp/dnd-npm
for p in abstract collision dom geometry helpers react state; do
  npm pack @dnd-kit/$p@0.5.1 --silent && mkdir -p $p && tar xzf dnd-kit-$p-0.5.1.tgz -C $p
done
cd -
for p in abstract collision dom geometry helpers react state; do
  (cd /tmp/dnd-npm/$p/package && find . -type f ! -name package.json ! -name README.md ! -name LICENSE) |
    while read f; do cmp -s "/tmp/dnd-npm/$p/package/$f" "packages/dnd-kit/$p/$f" || echo "differs: $p/$f"; done
done
```

After a fresh build, `git status` should also show no changes. Once the fork has local changes,
the files those changes touch will differ from npm, and nothing else should.

## Updating from upstream

1. Pick the release: the newest stable `@dnd-kit/react` that is at least 7 days old
   (`npm view @dnd-kit/react time`). Find its tag and commit on GitHub.
2. Clone the upstream repository (outside this one) and check out the tag.
3. For each package folder, replace `src/`, `tests/`, `README.md`, `CHANGELOG.md`, `LICENSE`,
   `tsup.config.ts` (when present) and `package.json` with the upstream files. Copy
   `config/typescript/` and the root `LICENSE` too. Leave out `.eslintrc.js`.
4. Redo the local build-file changes listed under "Local changes" (remove `devDependencies`,
   add `"private": true`, fix the `extends` path in each `tsconfig.json`).
5. If the release needs a new package, add it to the root `workspaces`, to `PACKAGES` in
   `build.mjs` and to `FORK_PACKAGES` in `tests/unit/dnd/workspace.test.ts`.
6. Update the tool versions in `packages/dnd-kit/package.json` to the ones in upstream's lockfile
   for that release (tsup, TypeScript, esbuild, rollup, `@types/react`, `bun-types`), and move
   the `before=` date in `.npmrc` to after their release dates.
7. Run `npm install` in the root (it updates `package-lock.json`), then
   `node packages/dnd-kit/build.mjs`, then the npm check above.
8. Re-apply the fork's local source changes, if any, and rebuild.
9. Update `NOTICE` (tag, commit, date) and this document. Run `npm run check`, then the
   end-to-end tests.

## Making a local change

1. Change the TypeScript in `packages/dnd-kit/<name>/src/`.
2. Run `node packages/dnd-kit/build.mjs` and commit the sources and the built files together.
3. Keep the version number. Never add a prerelease suffix (see "One copy of each package").
4. Add the change to "Local changes" below, with the reason and the upstream issue or pull
   request, so the next upstream update can carry it over or drop it.

## Moving the fork to its own repository later

`packages/dnd-kit` is already laid out like a small repository: build tools, build script,
licence, notice and the packages.

1. Create the repository (for example `infinia-yzl/dnd-kit-fork`) and copy `packages/dnd-kit`
   into it with its history (`git subtree split --prefix packages/dnd-kit`).
2. Add a root `package.json` there with the packages as workspaces, and run the build there.
3. Publish the packages under a scope the owner controls (for example `@otb/dnd-kit-react`), or
   keep the `@dnd-kit/*` names and install them from git. Renamed packages need the internal
   imports renamed too, because the packages import each other by name.
4. In OpenTierBoy, remove `packages/dnd-kit` and the `workspaces` entries, depend on the
   published packages, and point the ESLint pattern (`DND_KIT_ONLY_IN_LIB_DND`) and `lib/dnd` at
   the new names. `lib/dnd` is the only code that imports dnd-kit, so nothing else changes.
5. Keep the check from `tests/unit/dnd/workspace.test.ts` in some form: one copy of each
   package and of `@preact/signals-core`.

## Local changes

Changes to the upstream sources (in `@dnd-kit/dom` and `@dnd-kit/abstract`, for drag and drop
performance with long lists; measured with `npm run bench:drag`, see "Performance" below).
Each change is marked `OpenTierBoy fork` in the source. All of them could go upstream as pull
requests.

- `dom/src/core/entities/droppable/droppable.ts`: shape updates from the position observers
  are batched. Upstream set a droppable's new shape inside its observer's callback, and each
  new shape ran collision detection over all droppables, so a render that moved 60 items ran
  it 60 times. Now a droppable that already has a shape queues its update, and one task after
  the observer callbacks measures all queued droppables in one `batch()`, so collision
  detection runs once. The first shape of a drag, and a droppable leaving the screen, still
  update at once. Effect: script time per frame of a 200-tile drag fell by about a third.
- `dom/src/sortable/sortable.ts`: the index-change animations of one render run together.
  Upstream cancelled, measured and animated each sortable in turn, and each measurement also
  set a shape (one more collision detection run). Now the sortables that changed index in the
  same render are flushed together: all transitions cancelled, all elements measured in one
  `batch()`, then all animations started. The animations are the same as upstream's.
- `abstract/src/core/manager/operation.ts` and `actions.ts`: a new reactive flag,
  `DragOperation.ending`. `stop()` sets it before it sends `dragend`, and `reset()` clears it
  once the drop animation has finished. `start()` clears it too.
- `dom/src/core/entities/droppable/droppable.ts`: droppables stop observing their positions
  when `ending` turns true. Upstream kept every position observer running until the status
  became Dropped. The list changes at the release, so each of the 200 observers measured its
  element again and rebuilt its IntersectionObserver during the drop animation (about 1,300
  timers and 4,200 layout reads). Collisions no longer matter once the drag has stopped.
- `abstract/src/core/collision/notifier.ts`: the drop target stays as it is once `ending` is
  true. The droppables forget their shapes when they stop observing, and collisions computed
  without them would clear `dragOperation.target` before `dragend` reads it. Before this
  guard, the target survived only because the collision observer skips an update while the
  pointer has not moved (CodeRabbit review on #198).

The app reads `ending` too: `useTierDragState()` (lib/dnd/react.tsx) keeps `dragging` true
until the dropped element has landed, so the tile labels keep the drag style through the drop
animation (see "Performance").

The built files these change: `abstract/index.*`, `dom/index.*`, `dom/sortable.*` (and their
maps). Every other built file stays identical to npm.

Changes to build files:

- Every package `package.json`: `devDependencies` removed (they name upstream's private lint
  package, ESLint 8 and Bun types, and would break the app's `npm ci`), `"private": true`
  added (these copies are never published).
- Every package `tsconfig.json`: `extends` reads `../config/typescript/...` (upstream:
  `../../config/typescript/...`), because the packages sit one folder higher than upstream.
- `.eslintrc.js` (abstract, geometry, state) left out.
- Added: `packages/dnd-kit/package.json`, `.npmrc`, `build.mjs`, `NOTICE`.

Upstream details worth knowing:

- `@dnd-kit/dom` imports `@dnd-kit/helpers` without listing it as a dependency, and its build
  bundles a copy of `move()` into `sortable.js`. `build.mjs` therefore orders builds by the
  imports in `src/` as well as by `dependencies`.
- tsup drops the `"use client"` lines from the `@dnd-kit/react` output (a warning during the
  build). The npm release has the same output, so `lib/dnd/react.tsx` marks itself
  `'use client'`.

## lib/dnd: the adapter

`lib/dnd` is the only module that may import dnd-kit. ESLint enforces this
(`no-restricted-imports` with the `DND_KIT_ONLY_IN_LIB_DND` pattern); only `lib/dnd/**` and its
tests in `tests/unit/dnd/` may import `@dnd-kit/*`. Every `no-restricted-imports` setting in
`eslint.config.mjs` comes from `restrictImports()`, which always adds the rules that apply
everywhere (IndexedDB, zod, dnd-kit), so a later config block cannot drop the dnd-kit pattern.
`tests/unit/lint/dnd-kit-imports.test.ts` checks it. Inside `lib/dnd`, only `dndKit.ts` and
`react.tsx` import dnd-kit; the other files are pure functions (no React, no DOM), checked by
`tests/unit/dnd/purity.test.ts`.

| File | What it does |
| --- | --- |
| `model.ts` | Types: `ItemPosition`, `ItemMove`, `RowMove`, `Direction` |
| `moves.ts` | `moveItem`, `reorderRows`, `addTier`, `removeTier`, `findItem`, limits |
| `preview.ts` | The list as a drag shows it, and the move it makes on drop |
| `keyboard.ts` | Arrow key targets in wrapping rows with mixed tile shapes |
| `labels.ts` | Row and item names ("tier S", "Unranked", "Tier 3") |
| `announcements.ts` | Screen reader texts and instructions |
| `activation.ts` | When a press becomes a drag (mouse, touch hold, long-press menu): rules and a reducer |
| `ids.ts` | The ids dnd-kit sees: `item:<id>`, `row:<tier id>`, `tier:<tier id>` |
| `dndKit.ts` | dnd-kit sensors, activation constraint, plugins and page measurements |
| `react.tsx` | The React components and hooks the editor uses (client module) |

`lib/tierListReducer.ts` (the editor store) applies the moves with `moveItem`, `reorderRows`,
`addTier` and `removeTier` from `moves.ts`, so the editor has one implementation of each.

**The one class (A47).** Our code has no classes (CLAUDE.md, "Code conventions"), with one
exception: `HoldThenMoveConstraint` in `dndKit.ts`. dnd-kit's `ActivationConstraint` API needs
a subclass: sensors call its methods, and the base class keeps its controller in a private
class field that only a real subclass has. The gesture itself is the pure reducer
`holdThenMoveReducer` in `activation.ts`; the class only feeds it pointer events.
`ALLOWED_CLASS_FILES` in `eslint.config.mjs` lists `lib/dnd/dndKit.ts`, and
`tests/unit/lint/no-classes.test.ts` checks that it is the only class there and that no other
lib/dnd file may declare one.

Decisions in the adapter:

- **History stays the undo.** The list changes only on drop: one `moveItem` or `reorderRows`,
  one `router.push`. During a drag the editor renders a preview (`preview.ts`): a copy of the
  list that follows the pointer or the arrow keys. React draws every change; dnd-kit's
  optimistic sorting, which moves elements behind React's back (and breaks when an item moves
  to another row), is not used. On drop, `itemMoveFromPreview` or `rowMoveFromPreview` gives
  the one move from the list to the preview, or nothing when the item or row ends where it
  started, so such a drop adds no history entry.
- **Where an item goes.** Over another item, the dragged item goes just before it or just
  after it, by the half of that item under the pointer, in its own row as in another one.
  Over the free space of another row (or an empty row), it goes to the end of that row. The
  place depends only on where the pointer is, so with tiles of different widths the preview
  settles instead of flipping back and forth. A pointer drag released over nothing that takes
  it (outside the rows) changes nothing, as before.
- **Rows** take the place of the row they move onto, with their label while dragging. On drop
  `reorderRows` moves the contents (items, id and every other field) and leaves each label at
  its position, exactly as before, Unranked row included (product rule 6).
- **Keyboard.** Left and Right follow reading order across wrapped lines. Up and Down go to
  the nearest line above or below, keeping the horizontal place; inside a wrapping row the
  function replays the wrapping, so tiles of mixed shapes cannot pull the item back onto its
  old line. Rows move one place per key press. dnd-kit's `SortableKeyboardPlugin` is not used:
  `react.tsx` listens to the keyboard moves, measures the rows (`measureRows`), asks
  `keyboardItemTarget` or `keyboardRowTarget`, draws the new preview, and then moves the
  dragged element onto its new place. Auto-scroll is off during keyboard drags; the move
  scrolls the new place into view.
- **Announcements** name rows and items by their labels, never by ids (the editor hands in
  each item's display label, so a link image without a label is named by its site). They
  count positions in the list from the start of the drag and name the place the preview
  shows after the event, so a move is announced as the screen shows it. A pointer drag
  released over nothing is announced as cancelled. dnd-kit waits 500 ms before it reads a
  move, so quick moves are read once.
- **Touch.** Hold an item still for 250 ms, then move to drag. Moving earlier scrolls the
  page. Holding still for 700 ms opens the item menu (Radix ContextMenu: Delete) and then no
  drag starts; a browser that opens a context menu earlier on a long press (Chrome on Android)
  also stops the drag. Row handles drag after a 250 ms hold. Mouse drags start after 5 px, as
  before. These numbers are constants in `activation.ts` for a test on a real phone. Items and
  row handles turn off text selection and the iOS touch callout (CSS).
- **Drop animation:** 300 ms, `cubic-bezier(0.2, 0, 0, 1)`, the editor's values before, for
  pointer drops. dnd-kit skips it when the user prefers reduced motion. Keyboard drops have no
  animation (each arrow key already put the element on its place), so focus comes back to the
  item or row handle at once; with the animation it came back 300 ms later and could pull
  focus out of a dialog opened in the meantime. During a pointer drop's animation a press
  starts no drag and dnd-kit still blocks text selection. Events that arrive after the drop
  never bring a preview back. Auto-scroll is dnd-kit's default.
- **Manual tiers (#182).** `addTier` puts a new empty row just above Unranked (or at a given
  position, never below Unranked), with a fresh id (`tier-1`, `tier-2`...; the template ids use
  letters) and Unranked's label position. The editor labels it "Tier <its row number>", so the
  label shows and can be clicked to rename it. `removeTier` moves the row's items to the end
  of Unranked; Unranked cannot be removed, and one ranked row always stays. At most
  `MAX_TIER_ROWS` (20) rows, Unranked included. The limit is an owner decision and must not
  exceed the row cap of the link decoder (`tests/unit/dnd/listIds.test.ts` checks it). The
  "Add row" button under the rows adds one, and the Row options menu (the cogwheel beside it)
  offers "Remove a row" (a submenu of the ranked rows). Each is one history entry.
- **Mixed tile shapes.** Tiles render at their shape with one height (`lib/tileSize.ts`), and
  dnd-kit and the keyboard code work from measured boxes.

### React API

`lib/dnd/react.tsx` wraps `@dnd-kit/react`, so components never import dnd-kit:

```tsx
// Around the rows. children receives the tiers to show: the list, or the preview during a
// drag. onItemMove and onRowMove are called once per drop, and only when something moved.
<TierDragDrop tiers={tiers} onItemMove={move => ...} onRowMove={move => ...} itemLabel={item => ...}>
  {(shownTiers) => shownTiers.map((tier, index) => <Row key={tier.id} .../>)}
</TierDragDrop>

// A row, sortable by its handle: ref on the row, handleRef on the handle.
useTierRow({tierId, index}): {ref, handleRef, isDragging}

// The item area of a row: takes items over its free space and over an empty row
// (low collision priority). isDropTarget: the dragged item would land in this row.
useTierItems({tierId}): {ref, isDropTarget}

// An item tile, sortable inside and between rows. describedBy: the keyboard instructions,
// for aria-describedby.
useTierItem({itemId, tierId, index}): {ref, isDragging, isDropping, describedBy}

// describedBy for row handles: the keyboard instructions. It never changes during a drag.
useTierDragDescription(): string

// rowDrag: true during a row drag. dragging: true during any drag.
useTierDragState(): {rowDrag, dragging}
```

The drag state sits in two React contexts: the instructions (`describedBy`, read by every
tile) never change, and the drop target and drag flags (read only by rows and the row list)
change during a drag. With one context, every tile rendered again each time the dragged item
reached another row. New drop targets (`dragover`) and moves (`dragmove`) come from the
manager's monitor in `DragMoves`, never from `DragDropProvider`'s `onDragOver` prop: that prop
runs its handler in a React transition, which React may hold back while the pointer keeps
moving, so the preview trailed the pointer.

`components/DragDropTierList.tsx` and `components/RowHandle.tsx` use these. They keep the
accessible names: a row is a `group` named by its label, an item a `button` named by its
label, a handle a `button` named `Move tier <label>`. dnd-kit adds `aria-roledescription`
and `aria-pressed`; the editor sets `role`, `tabIndex` and `aria-describedby` itself, so the
server-rendered page has them too.

### Wiring checklist (done)

- [x] `@hello-pangea/dnd` replaced in `components/DragDropTierList.tsx` and
  `components/RowHandle.tsx`; the dependency is removed.
- [x] Keyboard moves with `keyboardItemTarget` for items and `keyboardRowTarget` for rows, in
  place of dnd-kit's `SortableKeyboardPlugin`.
- [x] The `dragover` announcement reads the position after the move (the preview), as the
  screen shows it.
- [x] Accessible names kept (row `group`, item `button`, handle `Move tier <label>`).
- [x] Touch: hold-to-drag and the long-press menu (Delete) both work; no text selection or
  callout on a long press (CSS); a swipe that starts on an item scrolls the page. Tested in
  Chromium's phone emulation; a real phone is still to be tried.
- [x] Only the drag methods of `tests/pages/TierListPage.ts` changed, plus new methods for the
  new tests: `tests/e2e/drag-and-drop.spec.ts` (wrapping rows, drops that change nothing,
  announcements, touch), `tests/e2e/tier-rows.spec.ts` (add and remove rows) and
  `tests/e2e/tile-shapes.spec.ts` (mixed shapes, with a made-up config: see
  `tests/README.md`).
- [x] Dragging with 200 tiles measured: `npm run bench:drag` (see "Performance").
- [x] `MAX_TIER_ROWS <= V3_LIMITS.maxRows` and unique tier and item ids where the editor
  hands its list to `lib/dnd` (`tests/unit/dnd/listIds.test.ts`).
- [x] `CLAUDE.md` (stack, folder map) and `tests/README.md` (drag and drop) updated.

## Performance

`scripts/bench-drag.mjs` (`npm run bench:drag -- --url <server>`) drags one item through all
rows of a 200-tile list in Chromium and reports frame times, preview lag (from the pointer
entering a row until the item shows there), long tasks and main-thread time per frame.
`--cpu 4` slows the CPU four times, close to a mid-range phone; `--budget` fails when the
result at full speed is over the owner's "no visible lag" budget. Measured on the agents'
sandbox (2 CPUs), 2026-10-28, against a production build:

| Build | CPU | Frame p50 / p95 | Preview lag median / p95 | Long tasks | Main thread per frame |
| --- | --- | --- | --- | --- | --- |
| `@hello-pangea/dnd` (before 5e) | 4x slower | 16.7 / 67-83 ms | (not comparable) | 670-810 | 13 ms |
| 5e as first opened (#196) | full | 16.7 / 50 ms | 64 / 157 ms | 12 | - |
| 5e as first opened (#196) | 4x slower | 67 / 167 ms | 452 / 1,064 ms | 878 | 111 ms |
| 5e after the performance fixes | full | 16.7 / 16.8 ms | 24 / 42 ms | 5 | 13 ms |
| 5e after the performance fixes | 4x slower | 16.7 / 67 ms | 52 / 156 ms | 140 | 28 ms |

The largest cost was the blurred label of every tile (`backdrop-blur-xs` with its own
compositing layer): during a drag the labels now drop the blur, as they already did while the
page scrolls (`data-dragging` on the row list, `app/globals.css`). What remains at 4x is mostly
dnd-kit's own work per moved item: position observers, shape measurements and collision
detection, about 10 ms of script per frame.

The drop (owner report, 2026-10-28: "as it's easing into the tier row, it seems to be laggy").
`bench:drag` releases the item in row S at the end of each run and counts the frames drawn
during the 300 ms drop animation (18 at 60 Hz). Same machine, five runs each:

| Build | CPU | Drop animation frames, min / median | Worst frame in 800 ms after the release |
| --- | --- | --- | --- |
| Before the drop fixes | full | 6 / 7 | 117 ms |
| After the drop fixes | full | 18 / 18 | 133 ms (after the item has landed) |
| Before the drop fixes | 4x slower | 4 / 5 | 433 ms |
| After the drop fixes | 4x slower | 6 / 9 | 150 ms |

Two causes, both fixed:

- The tile labels got their blur back at the release. Their `transition-all` then animated the
  blur and the transform of every label (about 400 transitions with 200 tiles) during the drop
  animation. The labels now keep the drag style until the item has landed.
- The position observers of every droppable ran again at the release ("Local changes" above).

What remains comes after the landing: the labels draw their blur again, and the list writes its
new link (`router.push`), about 0.5 s after the release. The item has stopped moving by then.
Turning the label transitions off did not change those frames.

