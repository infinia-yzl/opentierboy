# Snapshot files and "Recently viewed"

Two ways to keep lists on this device. Neither sends anything to a server.

- A snapshot file: a Freeze Frame picture that also holds the whole list (`lib/snapshot/`).
- "Recently viewed": the links this browser opened, with pins (`lib/recent/recentLinks.ts`).

## What people see

- **Download** (Share, Image tab, after Capture Preview) saves the picture as a PNG file with
  the list inside: the link Share hands out, the editor page, and the device images the list
  uses. Each device image is drawn again at most 512 pixels on its longest side (256 when all
  images together are too large). When the list does not fit, a message offers the picture
  without the list. This button is new (A10): Copy Image cannot carry the list.
- **Open file** (the folder button next to Share), **dropping a file** onto the editor and
  **pasting** one open files the same way (`components/useSnapshotFiles.tsx`):
  - A file with a list asks "Open the list in this file? Your current list stays one Back step
    away." Open list draws its images again, stores them in the device store (an image whose id
    is taken by another image gets a new id, and the list follows), and goes to the list with one
    `router.push`. Cancel changes nothing.
  - A PNG without a list, any other picture, and a PNG with bytes after its end or a damaged
    minor chunk become items, like "From your device".
  - Anything else shows a plain message (damaged, too large, made by a newer version).
- **Recently viewed** on the landing page, below "Create a New Tier List", shows the lists this
  browser opened, pinned ones first, with pin, unpin and remove, and a one-line hint to use
  bookmarks. It is hidden while empty. The editor records a list when it opens with a link that
  holds a list, and when a snapshot file opens. Edits, and Back and Forward inside the editor,
  record nothing. A list
  without its own title shows its page name, for example "OVERWATCH - Tank".

## Snapshot file

A snapshot file is an ordinary PNG picture of the tier list. It also holds the list itself,
device images included. Opening the file in OpenTierBoy brings the list back.

Snapshot files that people saved must keep opening, exactly like old links. Treat the format
below as a contract.

### Where the list sits in the PNG

- One `iTXt` text chunk with the keyword `opentierboy`, just before the `IEND` chunk.
- The text is compressed with zlib (compression flag 1, method 0).
- The language tag and the translated keyword are empty.
- Image viewers skip text chunks, so the picture shows as usual.

Why `iTXt`: it holds UTF-8 text and can be compressed. `zTXt` holds Latin-1 text only, and
titles and labels can be in any language. `tEXt` cannot be compressed.

Copying the picture to the clipboard loses the chunk: browsers re-encode clipboard images.
Only a downloaded file keeps it.

### The text inside the chunk

JSON, for example:

```json
{"version":1,"state":"3.N4Ig...","path":"/rank/overwatch/tank","images":[{"id":"h3Kx9_Tq2LmZ-a8B","label":"My cat","dataUrl":"data:image/webp;base64,UklGR..."}]}
```

- `version`: the payload version. Today it is 1.
- `state`: the list, as the `?state=` value of a link in a versioned format (`3.` and up).
  The app builds it with `encodeState(list, {format: 3})` and reads it with `decodeState`, so
  the link format's checks and limits apply.
- `path` (optional): the editor page of the list. Opening the file goes there, or to `/rank`
  when it is missing. It follows the same rule as Recently viewed paths (`lib/rankPath.ts`).
- `images`: the device images the list uses. `id` is the image's local id (the `d` of a v3
  item). It follows the device id rule (`isDeviceImageId` in `lib/state/deviceId.ts`): 8 to 64
  characters from `A-Z a-z 0-9 - _`, and never a name such as `__proto__` or `constructor`.
  `dataUrl` is a base64 data URL of a PNG, JPEG, WebP or GIF picture. The first bytes must
  match the declared type. SVG is never accepted, because SVG can carry scripts.
- Only the first bytes of an image are checked. So the app re-encodes every image through a
  canvas before it stores or shows it: when it writes a snapshot, and again when it opens one.
- Unknown fields are ignored. A later version can add fields, and version 1 readers skip them.

### Limits

Reading a snapshot treats the file as untrusted. Writing refuses anything reading would
refuse, so every file the app writes opens again.

| What | Limit |
| --- | --- |
| File size | 25 MB (check `File.size` before reading the file) |
| Chunks in the file | 10,000 |
| One chunk | 25 MB (some encoders write all image data as one chunk) |
| The snapshot chunk, compressed | 12 MB |
| The text, decompressed | 10 MB |
| `state` | 1 M characters (the v3 decoder has tighter limits of its own) |
| Images | 500 |
| One image data URL | 2 M characters |
| All image data URLs together | 8 M characters |
| Image label | 1,000 characters |
| Image local id | the device id rule: 8 to 64 characters, letters, digits, `-`, `_` |
| `path` | 512 characters, a plain `/rank` path |
| JSON values (objects, arrays and commas outside strings) | 100,000 (a list with 500 images has about 2,000) |

The reader also checks the PNG signature and the CRC of every chunk. It decompresses the text
in small steps and stops at 10 MB, so a tiny file that would expand to gigabytes costs a few
megabytes at most. Before it parses the JSON, it counts the values and the images, so a text
full of millions of tiny values is refused in milliseconds.

### Reasons a file does not open

`readSnapshotFile` returns a reason code. The UI can turn them into messages.

- `no-snapshot`: a valid PNG without a list. Offer to add it as an image item.
- `not-png`: not a PNG at all. It may still be a JPEG or WebP picture to add as an item.
- `bad-structure`, `bad-crc`: also offer to add it as an image item. An ordinary PNG with
  extra bytes after its end, or a damaged minor chunk, still shows as a picture. The image
  check of the add-items flow decides.
- `unsupported-version`: made by a newer OpenTierBoy.
- `file-too-large`, `text-too-large`, `payload-too-large`: too big.
- Anything else (`truncated`, `chunk-too-large`, `too-many-chunks`, `duplicate-snapshot`,
  `bad-snapshot-chunk`, `bad-compression`, `bad-utf8`, `bad-json`, `invalid-payload`): the
  file is damaged or was not made by OpenTierBoy.
- `unsupported`: the browser has no Compression Streams API (very old browsers).

### Adding payload version 2

1. Keep the version 1 parser exactly as it is.
2. Add a parser for version 2 and pick the parser by `version`.
3. Write version 2 only when the app needs a field version 1 cannot hold. A new optional
   field does not need a new version, because version 1 readers ignore unknown fields.

## Recently viewed

A list of tier list links this browser opened. It lives in local storage under the key
`otb-recent-links`.

- Each entry has the page path (`/rank/<set>/<tag>`), the `state` value, the list title and
  the time it was opened.
- Opening the same link again moves it to the top. One entry per link. A trailing `/` and
  spaces for `+` count as the same link.
- Pinned links stay until they are unpinned or removed.
- At most 20 links can be pinned (`RECENT_PIN_LIMIT`). This number is open for your review
  of the UI. If you lower it later, the oldest pins beyond it become ordinary links.
- At most 30 unpinned links are kept (`RECENT_UNPINNED_LIMIT`). The oldest drop off first.
  A link the user just unpinned stays, even when it is the oldest.
- Links longer than 16,384 characters of state are not recorded. The 430-item test list has
  about 12,000.
- Titles are shortened to 200 characters.

Stored data is untrusted. Every read checks it with zod, and bad entries are dropped. Only the
first 100 stored entries are read. Only `/rank` paths are accepted, and no segment may be dots
alone (`..`, or `%2e%2e` encoded), so an entry can never leave `/rank`, point to another site
or run script.
If local storage is blocked or full, the list is empty and changes report
`storage-unavailable`. Nothing throws.
