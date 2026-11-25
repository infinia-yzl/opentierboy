# Scribble

For contributors and agents: Scribble, the pen of Zen (owner decision, 2026-11-25). People who
record themselves ranking a list write notes around it by hand.

This doc covers step 1, the pen itself. Ink lives in memory, like Zen's ranking order. Step 1
writes no ink into the link, the browser history, the Share panel, a Freeze Frame picture or a
link preview. Those come in later steps (see "Limits of step 1").

- The logic, without React or the browser: `lib/scribble/`.
- The ink layer: `components/ScribbleLayer.tsx`, with `components/scribbleSurface.ts` (it reads
  where the tiles, rows and tray are).
- The pen controls: `components/ScribbleControls.tsx`. The toggle is in `components/ZenBar.tsx`.
- The store: `components/useScribble.ts`. The icon: `components/ScribbleIcon.tsx`.

## What people see

- **The toggle.** The Zen bar has a button "Scribble" after Layout, with the tooltip
  "Scribble (D)". Its icon is a wavy pen stroke (`ScribbleIcon`), never a pencil: the pencil
  means "Edit title". The key D turns Scribble on and off in Zen, except while a text field has
  focus or a menu or dialog is open. Escape turns Scribble off first; a second Escape exits Zen.
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
- **Leaving Zen** hides the ink and turns the pen off. The ink shows again when Zen returns. A
  reload, or opening another template, removes it.

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
- **Points are stored from the anchor, in tile sizes.** For an item, from the tile's corner in
  that tile's own size. For a row, from the start of its item area. For the tray and the frame,
  from their corners. So a note follows its tile to another row, grows and shrinks with the
  tile, and stays right when the layout, the window, Compact tiles or the labels change.
- **An absent anchor.** A note whose item or row is not on the page is not drawn. It keeps its ink
  until it is removed. The same holds for a tile that the queue hides ("Hide the queue"), and
  for a tile or row scrolled out of its scrolling box in a frame layout: the note scrolls with
  its tile and is hidden while the tile is out of view.
- **"Remove last note"** removes the newest note with all its strokes.
- **For screen readers and tests** the ink layer is a group named "Scribbles: 2 notes" (or
  "no notes", "1 note"). The count includes notes with an absent anchor. Each drawn note is an
  image named after its anchor: "Note 1 on Mauga", "Note 2 on row S", "Note 3 on Unranked",
  "Note 4 on the frame".

## How the layer keeps up with the list

`ScribbleLayer` renders nothing unless Zen is on and Scribble is on or a note exists. Then it
reads the places of the tiles, rows and tray (`measureSurface`) when the list or a view setting
changes, when the area changes size, when something in it scrolls or ends a transition, and
when a drag ends. It does not read them during a drag: a note joins its tile again at the drop.

The tiles carry `data-scribble-item` (the item id), the item areas `data-scribble-area`, and the
tray `data-scribble-tray`. Rows are found by `data-tier-row`.

## Limits of step 1

- Ink is not saved: not in the link, the history, the Share panel, Freeze Frame or link
  previews. Back and Forward do not undo ink.
- A press on the ink layer never reaches the list. The keyboard still moves tiles and rows.
- With Scribble on, the mouse wheel does not scroll the tray or the rows of a frame layout.
- In the ranking orders In order and Shuffle, a note drawn on a tile of the queue belongs to
  that tile, and hides with it under "Hide the queue".
