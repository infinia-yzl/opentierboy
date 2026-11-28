# Scribble

For contributors and agents: Scribble, the pen of Zen (owner decision, 2026-11-25). People who
record themselves ranking a list write notes around it by hand.

The notes are saved in the page address, in a value of their own: `ink=`, beside `state=`
(owner decision, 2026-11-25). The list's link format (`lib/state/`, v0 to v3) is not touched.
The address is the source of truth for ink, as it is for the list: drawing writes it, and a
reload, Back and Forward read it. Link previews and Freeze Frame files hold no ink yet (see
"Limits").

- The logic, without React or the browser: `lib/scribble/`. The ink value: `format.ts`
  (write and read), `ink.ts` (the notes of an address, with the one value the app shares and
  writes) and `address.ts` (the value in a search string).
- The ink layer: `components/ScribbleLayer.tsx`, with `components/scribbleSurface.ts` (it reads
  where the tiles, rows and tray are).
- The pen controls: `components/ScribbleControls.tsx`. The toggle is in `components/ZenBar.tsx`.
- The store: `components/useScribble.ts`: the pen (on or off, its colour) in memory, and the
  notes read from the address. The icon: `components/ScribbleIcon.tsx`.
- The notice for ink that cannot be read: `components/InkNotice.tsx`. The Share panel's group:
  `components/ShareButton.tsx`.

## What people see

- **The toggle.** The Zen bar has a button "Scribble" after Layout, with the tooltip
  "Scribble (D)". Its icon is a wavy pen stroke (`ScribbleIcon`), never a pencil: the pencil
  means "Edit title". The key D turns Scribble on and off in Zen, except while a text field has
  focus or a menu or dialog is open; a key held down toggles once. Escape turns Scribble off
  first; a second Escape exits Zen.
- **The pen controls.** While Scribble is on, a toolbar "Scribble" shows to the right of the Zen
  bar, in the same row or strip. The Zen bar and the list do not move when it shows or hides.
  It holds the ink colour, "Remove last note", "Clear scribbles" and the ink level.
- **A narrow window.** When the toolbar does not fit between the Zen bar and the window's edge,
  it shows under the Zen bar, centred, over the top of the list. Nothing moves. The room it needs
  includes the ink level, so it does not jump when the level shows.
- **Ink colour.** A menu with Red, Blue and Contrast. Contrast is navy in light mode and white in
  dark mode. There is no green: the layout "Overlay · green key" keys green out. The colours are
  theme tokens in `app/globals.css` (`--scribble-red`, `--scribble-blue`, `--scribble-contrast`):

  | Colour | Light | Dark |
  | --- | --- | --- |
  | Red | `#dc2626` | `#f87171` |
  | Blue | `#2563eb` | `#60a5fa` |
  | Contrast | `#0c1143` | `#ffffff` |

- **Drawing.** With Scribble on, a mouse, a finger or a pen draws over the whole Zen area: the
  frame in 16:9, 9:16 and the overlay, and the editor's column in the plain layout. Tiles and
  rows take no press, so nothing moves under the pen. With Scribble off the ink stays on screen
  and takes no pointer events: everything works as without Scribble.
- **Ink over pictures.** Where a stroke crosses the picture of an item, the ink is negative ink:
  the brightness of the picture is reversed under the stroke, and Red and Blue add their hue.
  Contrast ink shows the plain negative. On rows, labels, the tray and the background the ink is
  solid, as before. See "Ink over pictures" below.
- **Leaving Zen** turns the pen off. The ink stays on screen.
- **In the editor, outside Zen,** the ink of the address shows too, read only (owner decision,
  2026-11-26): same anchors, no pen controls, and the pointer passes through it. The pen stays
  in Zen.

## Ink is a limited supply

Ink runs out; it does not fill up (owner decision, 2026-11-25).

- One pen has `INK_SUPPLY` points: 500 (`lib/scribble/supply.ts`). A stroke is a list of points,
  and each point takes one unit of ink.
- The points are chosen while the stroke is drawn (`movePen` in `lib/scribble/points.ts`), so the
  level falls while the pen moves. A new point is kept when the line:
  - has left the last kept point by `POINT_STEP`, 0.3 of a tile; or
  - has turned by `POINT_TURN_DEGREES`, 18 degrees, from the direction in which it left the last
    kept point. Moves shorter than `POINT_MIN_MOVE`, 0.08 of a tile, do not count, so a shaking
    hand costs nothing.
- Lifting the pen keeps the last position as a point. A tap is a dot of one point.
- A stroke ends where the ink ends. At zero the line stops, and what was drawn stays as a note.
- "Remove last note" returns the points of that note. "Clear scribbles" refills the pen.
- The supply is counted from the notes in the address, so a link opened with 410 points of ink
  leaves 90 to draw.
- The ink level (`inkLevel`, `inkStatusText`):

  | Ink left | The controls show | Status text for screen readers |
  | --- | --- | --- |
  | more than 30% | no level | none |
  | 30% or less | a level bar, the percentage and `(o_o;)` | "Ink 18% left" |
  | none | an empty bar, "Out of ink" and `(x_x)` | "Out of ink. Remove a note to get ink back." |

  Out of ink, "Remove last note" and "Clear scribbles" get an amber tint, the ink colour button is
  faded and disabled, and the pen starts no stroke. The emoticons are plain characters, hidden
  from screen readers.
- The stored points are drawn as a smooth line (`strokePath`): curves through the middle of each
  pair of points.

## Notes and anchors

- **A note** is one or more strokes with one anchor (`lib/scribble/notes.ts`).
- **Joining.** When the pen lifts, the stroke joins the nearest note whose box is within
  `JOIN_DISTANCE`, half a tile, of the stroke's box. Otherwise it starts a new note. Only the
  distance counts, never the time between strokes.
- **The anchor** comes from the note's first stroke (`anchorAt` in `lib/scribble/anchors.ts`): the
  tile under the centre of the stroke's box (the item's id); else the row under it (the row's
  place, counted from the top); else the Unranked tray; else the frame.
- **A row note stays with the row's position** (owner decision, 2026-11-28: as it is, for now).
  When a row moves, or a row above it is removed, the note stays at its place in the list and
  is then on another row.
- **Points are stored from the anchor, in tile sizes,** on a grid of 1/32 of a tile (`INK_GRID`).
  For an item, from the corner of its tile, in the side of that square tile: the box of the
  tile's picture, not the item with its name. Compact tiles with Show Labels on put the name
  under the tile, and that name is no part of the size. For a row, from the start of its item
  area. For the tray and the frame, from their corners. So a note follows its tile to another
  row, grows and shrinks with the tile, and keeps its place and size on the tile when the
  layout, the window, Compact tiles or the labels change (`measureSurface` in
  `components/scribbleSurface.ts`).
- **What can be an anchor.** An item whose id is longer than 256 characters (a link image with
  a long address) is no anchor: the note takes the row under it. The first 100 rows can be
  anchors; a note on a later row takes the frame. These are the limits of the ink value.
- **An absent anchor.** A note whose item or row is not on the page is not drawn. It keeps its ink
  until it is removed. The same holds for a tile that the queue hides ("Hide the queue"), and
  for a tile or row scrolled out of its scrolling box in a frame layout: the note scrolls with
  its tile and is hidden while the tile is out of view.
- **"Remove last note"** removes the newest note with all its strokes.
- **For screen readers and tests** the ink layer is a group named "Scribbles: 2 notes" (or
  "no notes", "1 note"). The count includes notes with an absent anchor. Each drawn note is an
  image named after its anchor: "Note 1 on Mauga", "Note 2 on row S", "Note 3 on Unranked",
  "Note 4 on the frame".

## The ink value in the address

`/rank/<set>/<tag>?state=<list>&ink=1.<data>`. A list without scribbles has no `ink=`. A
template page without `state=` gets `?ink=` alone.

### Format version 1

`ink=1.<data>`: the version, a dot, and the lz-string of a text (`compressToEncodedURIComponent`,
as in the list's link). The text is one note after another:

```
note    = "~" anchor stroke+
anchor  = "f"                the frame
        | "t"                the Unranked tray
        | "r" DD             a row: its place from the top, 0 to 99
        | "i" DD id          an item: the length of its id, 1 to 256, then the id as it is
stroke  = "." colour step+
colour  = "r" | "b" | "c"    red, blue, contrast
step    = D D                dx + 31 and dy + 31, each from -31 to 31 grid units
        | "_" DDD DDD        dx + 131072 and dy + 131072, for a longer step
D       = one digit of A-Z a-z 0-9 - _ (0 to 63); DD and DDD are numbers in base 64
```

- A grid unit is 1/32 of a tile. A step is counted from the point before. The first step of a
  note is counted from its anchor's origin, and the first step of a later stroke from the last
  point of the stroke before.
- The id of an item is written as it is, after its length: it needs no escaping.
- Example: `~iADana.rnnvv` is one note on the item `ana`: a red stroke from (0.25, 0.25) to
  (0.75, 0.75) of its tile.

### Reading a value

The value comes from a link, so `decodeInk` (`lib/scribble/format.ts`) treats it as untrusted
input. It never throws. It returns the notes, or one reason:

| Reason | The value |
| --- | --- |
| `too-long` | has more than 1,000,000 characters |
| `format` | is no text, has no version before a dot, or its text breaks the grammar above |
| `version` | has another version than 1: any other whole number without a zero in front, such as `2.` or `1000.` |
| `data` | is not complete lz-string data, or its text would have more than 150,000 characters (checked before decompressing, `lib/state/lz.ts`) |
| `anchor` | names an anchor outside the four kinds, a row from 100 on, or an item id of no length or of more than 256 characters |
| `points` | has more points than the ink supply (500), or a point further than 65,535 grid units from its anchor |

A version has one spelling: `1.`. A zero in front (`01.`, `0.`) is no version, and the reason
is `format`.

**The text of a link is only read.** lz-string stops at its end code and ignores what follows,
and a small step may be written in the wide form, so many texts decode to the same notes. That
is harmless, because the app never passes the text on. From a value, only numbers (into SVG
path data) and one of the three colours reach the page; an item id is compared with the ids of
the list and never rendered. The value that the app shares (Copy link, Copy Markdown, Facebook,
X) and writes to the address and the history is always `encodeInk` of the decoded notes
(`inkOfAddress` in `lib/scribble/ink.ts`): `1.` and characters from `A-Z a-z 0-9 + - $`. The
text of the link itself is used for two things: to compare, and to count the length of the
address. Opening a link never rewrites the address.

The limits (`INK_LIMITS`) never refuse what the pen writes: a pen drawn to its end with one
point in each note, each on an item with an id of 256 characters, still fits
(`tests/unit/lib/scribble/format.test.ts`). Raising a limit is safe. Lowering one, or the ink
supply, can break links people already shared: never lower them.

**A link whose ink cannot be read** opens its list as usual, without ink, and one line says
"The scribbles in this link could not be shown." (`InkNotice`, where the notice "Images from
other sites" shows; hidden in Zen). The address keeps the value until the person changes
something: a change to the list or a label setting writes the address without it, and a new
stroke replaces it. The Share panel treats such a list as a list without scribbles.

### Lengths

Measured with drawn strokes (20 runs each), for `ink=` with its value:

| Ink | Characters |
| --- | --- |
| a light note: 45 points, a circle and a word | about 220 (160 to 270) |
| a usual recording: 150 points, circles on tiles and a few words | about 500 (460 to 540) |
| a full pen, 500 points of words | about 1,190 (1,150 to 1,220) |
| a full pen, 500 points, words and circles on 12 tiles | about 1,300 (1,250 to 1,340) |

About 2.4 characters for each point. lz-string costs length on point data, and more on a short
value: measured on the fixtures, its output is 2% longer than the text for a full pen, 15% for
a usual recording and 52% for one small note (50 characters become 76). It makes repeated item
ids shorter (the fixture of ids: 41% shorter), and it turns any id into characters an address
takes. The largest value the
pen could ever write (500 notes of one point, each on an item with a 256-character id of
letters outside ASCII) has 488,000 characters; no real list comes near it.

### Fixtures

`tests/fixtures/scribble/ink-v1.json` holds ink values with the notes each one decodes to.
`tests/unit/fixtures/ink-v1.test.ts` checks that every value still decodes to its notes, and
that the notes encode back to the value. The file is **append-only**, like the link fixtures:
never edit, reorder or delete an entry (`npm run check:fixtures` checks it). A failing entry
means the app broke links with scribbles: fix the app.

The entry `ink-v1-overwatch-tank-items` names two items of the OVERWATCH tank template by their
real ids, and `tests/e2e/scribble.spec.ts` opens it in the editor. The item ids of the earlier
entries are made up for the format: in the app their item notes have no tile.

## History

Browser history is the list's undo (product rule 2), and one history entry for each change.
Ink has one approved exception (owner decision, 2026-11-25): a run of drawing between two
changes to the list is **one** history entry.

- The first ink change of a run adds an entry (`history.pushState`). Each later ink change of
  the run updates that entry (`history.replaceState`). Drawing a stroke, "Remove last note"
  and "Clear scribbles" are ink changes.
- A change to the list ends the run, and so do Back and Forward. The next ink change starts a
  new run with a new entry. A change to the list keeps the ink of the address in the address
  it writes, and adds its one entry as before.
- A label setting (the label position, Show Labels) rewrites the current entry (A3). It does
  not end a run.
- Back removes the whole run, and Forward brings it back. The Zen bar's step count counts a run
  as one step.
- A reload ends the run: the next stroke adds an entry.
- "Clear scribbles" inside the run that drew the notes leaves an entry that looks like the one
  before it. Back from it changes nothing on screen.
- Opening another list (another template, a Freeze Frame file, a link, Recently viewed) writes
  an address without `ink=`: the old list's ink stays behind, one Back step away.
- **Two history calls for each write.** After every `pushState` or `replaceState` of the app,
  the Next.js router writes its own state into the same entry with one `replaceState` (same
  address). So one stroke, or one change to the list, is two calls against a browser's limit.
  The pen guards its own write. The router's call is not the app's to guard: if the browser
  refuses it, the page ends on Next's error screen.
- **A fast burst of strokes.** Browsers limit how often a page may write its history (Safari:
  100 calls in 30 seconds, then a `SecurityError`). The pen writes the address after every
  stroke, and it counts its own writes: at most 20 in 30 seconds (`INK_WRITE_LIMIT` in
  `lib/scribble/writeLimit.ts`), which is 40 of those 100 calls and leaves room for changes to
  the list. `inkWriteDecision` takes the times of the pen's last writes and the time now, and
  answers `'write'` or `'hold'`. A stroke past the limit waits: it stays on screen and in
  memory, exactly like a note whose write the browser refused, and the address has the last
  value that was written. Waiting notes are written by the next thing the person does that may
  write: the next ink change once fewer than 20 writes are 30 seconds old or younger, the pen
  turned off, a change to the list, the Share panel opened, or the page hidden (`pagehide`, or
  `visibilitychange` to hidden). Only the first of these depends on the count; the other four
  write at once. The pen reads the clock only to count: it sets no timer and writes nothing
  later by itself. The entry of the run stays one entry, so Back still removes the whole run.
  Back or Forward while notes wait drops them: Forward then brings back the notes that were
  written.
- **A lower limit.** The local storage key `otb-ink-write-limit` can hold a lower limit as JSON,
  such as `{"writes":2,"windowMs":86400000}`: `writes` from 0 to 20 and `windowMs` from 30,000
  to 86,400,000. It is read at each write and checked (`inkWriteLimitFrom`); anything else
  means the default. It can only make the pen write less often, never more. The end-to-end
  tests use it to reach the limit with three strokes, without drawing 20 and without a clock.
  No test reached a browser's own limit.
- **A history write that the browser refuses.** When a write is refused, or the address does
  not take the value, the notes stay on screen and in memory, for the address they were drawn
  on. They are written with the next ink change, with the next change to the list, when the pen
  turns off, when the Share panel opens, or when the page is hidden. Until then the Share panel
  shares what the screen shows. Back, Forward, or another list at this page (a Freeze Frame
  file, another template) drops them. Next.js learns a new address before the browser takes
  the call, so after a refused write the pen hands it the address of the window again; without
  that, Next.js would write the refused value itself a moment later, in place of the entry
  before the run.

## Share

- **Only when the list has scribbles,** the URL tab of the Share panel puts its buttons in one
  group (owner decision, 2026-11-25). Its top row has the Scribble icon, "Include scribbles",
  a line under it, and a switch, on at first. Under the row: "Copy link" beside "Copy
  Markdown", "OR", then the Facebook and X buttons.
- **Switch on:** "Every button below shares your scribbles too". Each button shares the link of
  the list with the ink value of the address.
- **Switch off:** "Every button below shares the list without your scribbles". Each button
  shares the link without `ink=`. The scribbles stay on the list and in the address.
- "Copy link" copies the link and shows the toast "Link copied to clipboard". It exists only
  in this group (owner decision F5.6).
- The Image tab says "Scribbles are not in the picture." when the list has scribbles.
- Without scribbles the panel is as before: no group, no switch, no "Copy link".
- The switch is `components/ui/switch.tsx`: shadcn's Switch, on `@radix-ui/react-switch` (a
  dependency added for it, owner decision F5.3a).

## Ink over pictures

Solid ink hides the pixels under it. Negative ink keeps them: a reader of a screenshot or of a
video frame can undo it and get the picture back.

- `measureSurface` returns the shown part of every tile picture (`Surface.pictures`): the `img`
  of a tile, or the tile itself when it has none, cut to the scrolling boxes around it.
- `ScribbleLayer` draws the strokes three times, each cut to its own area:
  1. white strokes over the pictures, in a layer with `mix-blend-mode: difference`. Each colour
     channel becomes 255 minus its value;
  2. Red and Blue strokes over the pictures, in a layer with `mix-blend-mode: color`. The result
     takes the hue and the saturation of the ink and keeps the brightness of step 1. Contrast
     strokes are left out of this layer;
  3. solid strokes everywhere else, in the layer that holds the notes and takes the pen.
- The two picture layers are `aria-hidden`, take no pointer events and stay out of a Freeze
  Frame, like the note layer.
- **Undoing it.** With brightness as `0.3 R + 0.59 G + 0.11 B`, the brightness of the picture is
  255 minus the brightness on screen. The colour under Red or Blue ink is gone and is filled in
  from the pixels beside the stroke. Under Contrast ink every channel is 255 minus its value.
- A browser that does not blend with `color` shows solid Red and Blue ink over pictures.

## Places that never get ink

- **Link previews.** The page's preview image address (`app/rank/rankMetadata.ts`) is built
  from `state=` alone, so `/api/og` never sees ink.
- **Recently viewed** stores the path and the `state=` value of a list, in its own format,
  without ink.
- **Freeze Frame.** The picture leaves the ink layer out, and the file's list is the `state=`
  value alone. Its 13,000-character rule counts the list only.
- `proxy.ts` passes `ink=` through its rewrite and its redirects, and decides nothing from it.
- The warning about addresses of more than 2,000 characters counts the whole address, ink
  included.

## How the layer keeps up with the list

`ScribbleLayer` renders nothing unless a note exists, or Zen is on with the pen on. Then it
reads the places of the tiles, rows and tray (`measureSurface`) when the list or a view setting
changes, when the area changes size, when something in it scrolls or ends a transition, and
when a drag ends. It does not read them during a drag: a note joins its tile again at the drop.

The tiles carry `data-scribble-item` (the item id), the item areas `data-scribble-area`, and the
tray `data-scribble-tray`. Rows are found by `data-tier-row`.

## Model-based tests

Three machines in `tests/machines/` describe Scribble (`tests/README.md`, "Model-based tests"):
`scribble.ts` (Zen, the pen and the count of notes), `ink-history.ts` (runs, a change to the
list, Back, Forward and a reload, a write the browser refuses and a note that waits past the
pen's limit: the notes, the Zen bar's step count and the ink value of the address) and `share-scribbles.ts` (the Share panel's switch and what a copied link has).

## Limits

- Link previews and Freeze Frame pictures and files hold no ink.
- A press on the ink layer never reaches the list while the pen is on. The keyboard still moves
  tiles and rows.
- With the pen on, the mouse wheel does not scroll the tray or the rows of a frame layout.
- Touch (owner decision, 2026-11-28: as it is, for now): with the pen on, a finger draws and
  does not scroll the page, also in the plain layout of Zen. There is no palm handling: a
  second pointer is ignored while a stroke is drawn, and a resting hand can start a stroke.
- In the ranking orders In order and Shuffle, a note drawn on a tile of the queue belongs to
  that tile, and hides with it under "Hide the queue".
- A note on the frame keeps its place from the frame's corner in tile sizes. The editor outside
  Zen has more above and between the rows (the tools, Add row), so such a note can sit a little
  off from where it was drawn in Zen. Notes on tiles, rows and the tray keep their places.
