# The item extractor

For contributors and agents: "Extract items from a picture…" turns one picture, such as a
screenshot of a game menu or a wiki list, into a new list with one item for each area that the
person marks. Everything runs in the browser. The picture and its crops never reach the server.

## What people see

- **Entry.** Add images › "Extract items from a picture…", with the items that bring pictures
  in. The menu item shows only on a desktop: a fine pointer and a window at least 1,024 pixels
  wide (`DESKTOP_QUERY` in `components/useDesktop.ts`). A drop or a paste on the editor itself
  still adds one tile, as before.
- **The picture.** "Choose a picture", a drop on the dialog or a paste in the dialog. A later
  picture replaces the first one.
- **Step "1 Items".** The picture fits the dialog, with a border around each item found and
  the line "42 items found". When none is found: "No items found. Draw a border around one
  item." A drag on empty picture draws a border; a drag inside a border moves it; the selected
  border has eight handles. Each border is a button named "Item 12 of 42", numbered row by row.
  Arrow keys move the focused border by one picture pixel, Shift and an arrow key resize it, and
  Delete or Backspace removes it.
  - "Same size for all" (on by default) gives every border the same change of each edge when
    one border is resized, by handle or by keyboard.
  - "Find items of this size" takes the selected border and adds every other area of that size.
    Existing borders stay.
  - **Fit**: the first item as it is in the picture, then "Whole item" (default: the whole item
    in a square tile, with empty sides) and "Square cut" (the tile is full and the rest is cut
    away). With "Square cut" each border shows the square that is kept. A drag inside that
    square moves it; with "Same size for all" every square moves the same way.
  - The tiles beside the picture show the items in reading order. A click selects the border;
    each tile has a remove button.
  - Limits, said only when reached: at most 300 borders in one picture ("Up to 300 items in one
    picture.") and at least 24 picture pixels on each side ("An item is at least 24 pixels wide
    and tall.").
- **Step "2 Names"** (optional). The current item shows large, with some of the picture around
  it. The name field has the focus: Enter stores the name and goes to the next item, Shift+Enter
  goes back, an empty field and Enter skips the item. After the last item the focus moves to the
  main button. Text with several lines, pasted into the field, names this item and the following
  ones, one line each. A strip of small tiles marks the named items; a click jumps to one. An
  item without a typed name gets the file name and its number ("screenshot 12"), shown in grey
  in the field.
- **Create.** "Create a list with 42 items" works in both steps. It opens a new blank list
  (`/rank`, "Custom Tier List") with every item in Unranked, as one history entry, the way an
  opened snapshot file opens its list, and records it in Recently viewed. The line beside the
  button repeats the device image tip: "Your images stay in this browser. A link shares their
  names; a downloaded Freeze Frame shares the images too."

## The picture is untrusted input

1. `checkPictureFile` (`components/extractorPicture.ts`) sniffs the type from the bytes (PNG,
   JPEG, WebP or GIF), refuses AVIF and HEIC, and reads the declared size from the header. A
   picture above the pixel caps of `lib/images/imageCheck.ts` is refused before it is decoded.
   The messages are those of "From your device" (`DEVICE_IMAGE_REFUSAL_MESSAGES`). SVG and other
   formats are refused: the extractor works on raster pictures only.
2. The object URL is made only from the Blob of the sniffed type (`previewableImage`).
3. The picture decodes in an `Image` element (its natural size is checked against the caps
   again) and, for the detector, through `createImageBitmap`, off the main thread. Pictures wider
   than 2,560 pixels are scaled to 2,560 for detection only.
4. Each crop is drawn on a canvas from the full-size picture, at most 512 pixels on its longest
   side, saved as WebP (PNG where the browser cannot write WebP), and stored through
   `addDeviceImages`, which runs `prepareImageForStore` and the device image store, like "From
   your device".

## The detector (`lib/extract/`)

Plain TypeScript: pixels in (`{width, height, data}` with RGBA bytes), boxes with scores out. No
React, DOM, canvas or WebAssembly. It is a port of the stage 0 prototypes, and gives the same
boxes on the sample screenshots when the prototype sorts tied scores in a stable order.

| File | What it does |
| --- | --- |
| `picture.ts` | The working picture: 1,280 pixels wide, scaled by pixel area like OpenCV's `INTER_AREA`, and grey values |
| `lines.ts` | Edge masks (neighbour differences over 7), closing and opening with OpenCV's kernel anchors, line runs, and sums along rows and columns |
| `modes.ts` | The most voted values of a histogram (the size vote) |
| `rectangles.ts` | For one size, a score at every position from its four sides; local maxima; completing rows and columns; regular spacing; content entropy |
| `detect.ts` | `findItems(picture)`: the size vote, seeds, grid completion and the choice among heights. `findItemsOfSize(picture, box)`: snap the given border to nearby lines (5 pixels), then every rectangle of that size. `readingOrder` |
| `borders.ts` | Border edits for the dialog: add with the limits, move, resize, "Same size for all", the kept square, and the crop plan of each fit |
| `names.ts` | Automatic names, pasted lists of names |

`components/extractorWorker.ts` runs the detector in a Web Worker from the app's own origin
(`useItemDetector`). A run on a 2,560 by 1,440 picture takes about 0.3 to 0.7 seconds, too long
for the main thread. The Content Security Policy has no `worker-src`, so workers fall back to
`script-src 'self'`, which allows the worker's chunk: no policy change. Where a worker cannot
start, the detector runs on the page after one turn of the event loop.

**Quality.** On the 28 sample screenshots with lists, the automatic run finds the right number of
items on 12, and a border given by hand fixes 6 of the 14 tried; 20 of 30 samples end with a
right count. Regular grids with framed tiles work best. Busy art, a menu column beside the items,
weak tile sides on dark pages and staggered layouts need the manual tools.

## Limits and storage

- At most 300 borders in one extraction, and 24 picture pixels on each side.
- The new list must fit a link of 13,000 characters (`MAX_SNAPSHOT_LINK_CHARS`); otherwise the
  dialog says "This list is too long for a link. Remove some items and try again."
- Each crop is a device image, with the store's limits (5 MB each, 100 MB and 2,000 images in
  all). The store removes the least recently used images to make room, never those the list on
  screen shows or those just handed out. An image that still does not fit is left out, and a
  toast "Some images could not be added" names it. When no image could be stored, the dialog
  stays open and shows why.

## Tests

- Unit tests: `tests/unit/lib/extract/`, with pictures drawn by the tests
  (`tests/unit/support/drawn-pictures.ts`).
- End-to-end: `tests/e2e/extractor.spec.ts`, page object `tests/pages/extractor.ts`
  (`tierList.extractor`), drawn PNG pictures from `tests/support/extractor-pictures.ts`, the
  model `tests/machines/item-extractor.ts`, and accessibility scans in light and dark mode
  (`tests/e2e/accessibility.spec.ts`).
- The sample screenshots of the prototypes hold third-party art and stay out of the repository.
