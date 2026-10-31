# Link format v3

A shared link holds the whole list in its `?state=` value. Version 3 is the next format after
v0, v1 and v2. It adds what the older formats could not hold:

- the row template (3, 5 or 7 rows, or custom rows);
- where tier labels sit (left, right or top);
- whether item labels show;
- images from a web address ("link images");
- images from a device, by their local id ("device images").

Status: the app writes v3 links since the Phase 5b wiring step, and reads every format (see
"How the app uses v3").

Old links keep working. v0, v1 and v2 links decode exactly as before, and their decoder
(`lib/state/decoders/legacy.ts`) is unchanged.

## The format

A v3 value is `3.` followed by lz-string `compressToEncodedURIComponent` of compact JSON:

```
?state=3.<payload>
```

The JSON has these keys. A key that holds its default is left out.

| Key | Meaning | Values | Default (left out) |
| --- | --- | --- | --- |
| `t` | title | a string | empty title |
| `tp` | row template | `3`, `5` or `7` | custom rows |
| `lp` | tier label position | `"left"`, `"right"`, `"top"` | `"left"` |
| `sl` | item labels shown | `false` | labels shown |
| `r` | rows, top to bottom | a list of at least one row | always written |

A row is a list: `[id, name, items]`. The id is left out (`[name, items]`) when the omission
rule below allows it. The last row is the Unranked row, as in the app.

An item is one of:

| Item | Written as | Example |
| --- | --- | --- |
| image-set item | its item id, as a string | `"image-overwatch-ana.webp"` |
| an id with a label | `{"i": id, "c": label}` | `{"i":"image-overwatch-gone.webp","c":"Gone hero"}` |
| link image | `{"u": address, "c": label}` | `{"u":"https://i.imgur.com/abc123.png","c":"Wrecking Ball"}` |
| device image | `{"d": local id, "c": label}` | `{"d":"k3j9x0a1b","c":"my cat"}` |

`c` is left out when the label is empty. An image-set item never stores a label: the image set
holds it. The app writes `{"i", "c"}` only for an id that names no image-set item, such as a
removed image from an old link, so its label stays (A45). Without a label such an id is a plain
string. The id in `i` can be any non-empty text: the device id rule does not apply to it.

Tier ids, item ids and image addresses are never empty. A device image's local id follows the
device id rule (A40): 8 to 64 characters from `A-Z`, `a-z`, `0-9`, `-` and `_`, and never the
name of an `Object.prototype` member such as `__proto__` or `constructor`. The device image
store (Phase 5c) creates ids of 16 such characters. `lib/state/deviceId.ts`
(`isDeviceImageId`) holds the rule.

### Example

A 5-row list with a title, tier labels on top, rows S and B swapped (so those two rows write
their tier id), one link image and one device image:

```json
{"t":"My picks 🎮","tp":5,"lp":"top","r":[
  ["S",["image-overwatch-ana.webp",{"u":"https://i.imgur.com/abc123.png","c":"Wrecking Ball"}]],
  ["tier-b","A",[{"d":"k3j9x0a1b","c":"my cat"}]],
  ["tier-a","B",[]],
  ["C",[]],["F",[]],
  ["",["image-overwatch-mau.webp"]]]}
```

The link value is the JSON above on one line, compressed:

```
3.N4IgLiBcILIJ4AIAOBLAxgawM4MDwbg6-ZABpwkoBWEgGzOjAHsySAnKAbTZAGVjOUBbAIYBzAKYBaegDdRzAO6CwaABbjBAO0EA6OaIBGTUAFcoIZWDBIskAPQ2UWgcKPMtaevxuC9aAIwAmAGYtJHVhYhA0UwB1ZlFMFDCEACFBKioQAF8AXWyiTjAUWXE9CIBBXlAAE1MMQIArAE4ADwAGQV9SkijofkQ0RSzc-PAi5jUI5N5hzgBhabzOADEFkd4QAREJaVkFJVUhIx19MlzszKA
```

`tests/unit/lib/state/v3-format.test.ts` checks this example in both directions.

## Tier ids and the omission rule

Every row has a tier id, such as `tier-s` or `uncategorized`. The app needs the ids when the
list switches to another row template: items go to the row with the same id. Rows keep their
ids when they are dragged, and labels stay in place (product rule 6), so after a drag the ids
no longer match their positions.

**Rule:** a row leaves out its id only when the id equals the row template's id at that row's
position. In every other case the row writes its id.

The template ids come from `tierTemplates` in `models/Tier.ts`:

| Template | `tp` | Ids, top to bottom |
| --- | --- | --- |
| 3 rows | `3` | `tier-s`, `tier-a`, `tier-b`, `uncategorized` |
| 5 rows | `5` | `tier-s`, `tier-a`, `tier-b`, `tier-c`, `tier-f`, `uncategorized` |
| 7 rows | `7` | `tier-ss`, `tier-s`, `tier-a`, `tier-b`, `tier-c`, `tier-d`, `tier-f`, `uncategorized` |
| custom | left out | none: every row writes its id |

So:

- A 5-row list that nobody reordered writes no ids at all.
- After rows S and B swap places, only those two rows write their ids.
- A row below the template's last position (for example an added row) writes its id.
- With custom rows, every row writes its id.

`lib/state/templates.ts` holds a copy of these ids (`ROW_TEMPLATE_TIER_IDS`) and the rule
(`defaultTierId`). `tests/unit/lib/state/templates.test.ts` fails if the copy and
`models/Tier.ts` ever differ. These id lists are part of the format: never change or reorder
them. A new row template needs a new `tp` value.

A row without an id at a position where the template has none (for example under custom
rows) is invalid, and the link does not decode.

## Writing a list: always the same text

`encodeV3(list)` writes the same text for the same list, every time. Fields are written in a
fixed order (`t`, `tp`, `lp`, `sl`, `r`), and every default is left out.

Decoding a v3 value and encoding the result gives back the same text (A1c). The app relies on
this: opening a link and saving it unchanged must not change the address.

A hand-made link can hold defaults written out (`"lp":"left"`), keys the decoder does not
know, or an id that could be left out. It still decodes. Encoding it gives the short form,
and from then on the text stays the same.

`decodeState` always reports the three layout fields for a v3 link (`rowTemplate`,
`labelPosition`, `showLabels`), with their defaults filled in, and fills in left-out tier ids.
It never reports an empty title. Legacy links report no layout fields: the app keeps using
its own defaults for them.

## What the decoder checks

The decoder is strict about types and sizes:

- the JSON must be an object with a list of rows in `r`;
- strings must be strings, `tp` must be 3, 5 or 7, `lp` one of the three positions, `sl` true
  or false;
- each row must have 2 or 3 entries, each item must be a string or an object with exactly one
  of `i`, `u` and `d`;
- tier ids, item ids and image addresses must not be empty;
- a device image id must follow the device id rule (code `bad-device-id` when it does not);
- every limit below must hold.

Anything else gives `null` (the app then treats the link like any broken link). The decoder
never throws. `readV3Payload` also says why a value failed, as a short code such as
`bad-row-count`; the code never contains link content.

The decoder does **not** check:

- **Image addresses.** A link image's address is passed on exactly as stored. The app must
  check every address before it loads the image (Phase 5c, `lib/images/linkImage.ts`), and the
  server must never fetch it (A8, A36).
- **Duplicates.** The same item or the same tier id twice stays twice. The app removes
  duplicate items when it builds the list (A32), and `uniqueTierIds` (`lib/listLink.ts`) makes
  duplicate tier ids unique (A38, Phase 5a).
- **Content of strings.** Titles and labels can hold any text. The app must show them as
  plain text.

### What is ignored

- **Keys the decoder does not know**, at the top level and inside link and device items.
  This lets a later version add keys: older code skips them. Unknown keys disappear when the
  app saves the list again.
- **Characters after the end of the compressed data**, such as a `.` or `)` that stuck to a
  link pasted into a chat message.
- **Spaces in place of `+`.** `URLSearchParams` turns `+` into a space; the decoder reads a
  space as `+`.

Rows are lists, so they cannot take new keys. New row data needs a new top-level key (for
example a list of row colours), or a new version.

## Limits

A v3 link beyond any of these limits does not decode (A29, A43). The limits protect the
editor, the page metadata and the link preview from hand-made links. They never refuse a real
list: the largest list the app ships (all 430 items in 7 rows) has 16,000 characters of JSON
and a 6,381-character link. Lengths count UTF-16 code units (an emoji often counts 2).

| Limit | Value |
| --- | --- |
| characters after `3.` | 1,000,000 |
| characters of JSON after decompression | 1,000,000 |
| rows (including Unranked) | 1 to 100 |
| items in all rows together | 5,000 |
| device image id | 8 to 64, URL-safe characters only (device id rule) |

Titles, tier names, labels, tier ids, item ids and link image addresses have no length cap
(A43). The editor lets people type text of any length, so a cap would make the app write
links it then refused to open. The JSON cap bounds every string, and the link preview shortens
long text before it draws it. Legacy links follow the same policy (`lib/legacyLinkLimits.ts`).

The limits live in `lib/state/limits.ts` (`V3_LIMITS`). Raising a limit is safe. Lowering one
can break links people already shared, so never lower a limit.

**Why the JSON cap is checked before decompressing.** A short link can expand to a huge text:
each piece of compressed data can repeat everything decoded so far, so the text can grow with
the square of the link length. A 16,000-character link can expand to 32 million characters,
and lz-string builds the whole text before it returns. `lib/state/lz.ts` therefore measures
the decompressed length first, without building the text, and stops at the cap. Only a value
within the cap reaches lz-string. The tests include such a link.

The encoder writes whatever it is given. A list beyond the limits, or with an empty id or a
device image id that breaks the rule, gives a link that does not decode.
`decodeState(encodeV3(list)) !== null` checks whether a list fits.

## Link length compared with v2

The same lists, as the app writes them in v2 and in v3 (the value after `?state=`, including
the `3.` prefix):

| List | v2 | v3 | Change |
| --- | --- | --- | --- |
| all 430 items of every image set, 7 rows, with a title | 6,744 | 6,381 | 5% shorter |
| typical list: 20 Overwatch heroes, 5 rows, with a title | 507 | 392 | 23% shorter |

The 17 real shared links in `tests/fixtures/shared-links.json` (16 to 67 items), written again
by the app: v2 between 479 and 1,617 characters, v3 11% to 23% shorter (for example 952 → 811,
1,617 → 1,439). Over all 25 golden lists the total goes from 26,571 to 23,419 characters.

The v3 links also carry the row template and the layout settings, which v2 cannot store. Most
of the saving comes from writing image-set items as plain strings and leaving out tier ids.
Long lists save less, because lz-string already compresses the repeated parts of v2 well.
`tests/unit/fixtures/links.test.ts` checks these numbers (fixtures `v3-all-items-every-package`
and `v3-typical-20-items`).

## Code

All in `lib/state/` (pure code: lz-string only, so it runs in the browser, on the server and
in the edge OG route):

| File | What it does |
| --- | --- |
| `types.ts` | `CanonicalState` and its items, with the v3 fields |
| `decoders/v3.ts` | `decodeV3Payload`, `readV3Payload` |
| `encoders/v3.ts` | `encodeV3`, `V3_PREFIX` |
| `templates.ts` | the template tier ids and the omission rule |
| `limits.ts` | `V3_LIMITS` |
| `deviceId.ts` | `isDeviceImageId`: the device id rule |
| `lz.ts` | lz-string decompression with a length cap |
| `decode.ts` | `decodeState`: sends `3.` values to the v3 decoder |
| `encode.ts` | `encodeState` (v3 by default, v2 on request), `DEFAULT_WRITE_FORMAT` |

In `CanonicalState`, an item without `kind` is an image-set item (legacy links give every
item in this form). Link images are `{kind: 'link', id, url, content}`: a link image stores no
id, so the decoder uses its address as its id. Device images are
`{kind: 'device', id, content}`, where `id` is the local id.

## How the app uses v3

The app writes every change as a v3 link (`DEFAULT_WRITE_FORMAT` 3 in `lib/state/encode.ts`).
Changing it to 2 makes the app write v2 links exactly as before; the layout settings then stay
out of links.

**Writing** (`encodeListForURL` in `lib/listLink.ts`):

- The row template is the row count without Unranked, as the "Number of Rows" menu shows it:
  3, 5 or 7 rows, else custom.
- Image-set items are written as their id, also when they came in under an old id that
  `image-aliases.json` maps to them.
- An id that names no image-set item keeps its label (A45): an unknown id from a v3 link, or an
  id from a legacy link that is no upload (for example a removed image with a dot in its id).
  It shows its label on the placeholder image and is written as `{"i": id, "c": label}`. If an
  image set ships the id again (or an alias for it), the link shows that image.
- Uploads (custom items) are written as device images by their device image id. Uploads made
  before Phase 5c have ids from `Math.random().toString(36).slice(2, 11)`, which can be shorter
  than 8 characters. Such an id is written as `legacy-<id>`, which is always valid (A42,
  `deviceImageIdForUpload` in `lib/state/deviceId.ts`). The editor uses the same mapping when it
  moves old uploads from localStorage into the device image store. A legacy id that no prefix makes valid is not an
  upload: it is written as `{"i": id, "c": label}` (see above).
- Link images are written with their address and label.

**Reading** (`decodeTierStateFromURL` in `lib/listLink.ts`):

- Link images load in the browser from trusted sites (`trusted-image-sites.json`), and from
  other sites once the visitor allows them; until then, and when an image fails, the tile shows
  the label (or, without a label, the site's name). See `docs/reference/images.md`.
- Device images show the image this browser keeps under their id in the device image store.
  Without one, the label shows on the placeholder image, as for an upload in someone else's
  browser.
- An upload or unknown id from a legacy link shows under the id its v3 link writes
  (`legacy-<id>` when the id breaks the device id rule, A42). So the item keeps one id on
  screen across Back and Forward between legacy and v3 versions of a list, and toast Undo never
  adds it twice. Its image is kept in the device image store under that same id.
- Link previews (`/api/og`) draw link images from trusted sites (with caps), and label tiles for
  other link images and for device images. Link image addresses never reach the local image
  inliner (A8, A36).
- `decodeTierStateFromURL` gives a row with a repeated tier id its own id (A38, Phase 5a). Hand-made links
  can also hold empty ids, which v3 refuses: an empty tier id gets a new id (`tier~1`, ...) and
  an empty item id gets one too (`item~1`, ..., keeping its label, written as `{"i", "c"}`). So a
  list opened from any legacy link writes a v3 link that opens again.

**Layout settings (A3).** The label position and label visibility travel in v3 links.

- A change to them replaces the current history entry (`router.replace`), so it adds no Back
  step, as before v3. Row template changes push a new entry, like every change to the list.
  **Owner's decision, 2026-10-25**: option (a), replace. The one place for this choice is
  `LAYOUT_LINK_WRITE` in `lib/tierListReducer.ts`; its other options are `'push'` (a Back step
  per layout change) and `'next-edit'` (the next change to the list writes the layout along).
- A link's layout settings apply when the link is opened fresh: when the editor starts with it.
  That is the first load of the page, a reload, or arriving at the editor from another page
  (also by Back or Forward from another page). Back and Forward between versions of the list
  inside the editor keep the settings on screen, as before (owner, 2026-10-25). So Back after
  "labels on Top" keeps them on Top, while the older history entry's link still holds the older
  settings.
- On a template page without a link, a layout change writes a `?state=` link into the address,
  in place of the current entry.
- Share writes its link from the list and layout on screen (`shareLink` in the store, A46),
  never from the address: the address can lag behind on a slow connection, and after Back it
  holds the older entry's settings while the screen keeps the current ones.

**Opening a link writes nothing** (A1, the store from Phase 5a): opening any link leaves the
address and the history as they are, also when the app would write that list differently
(every v0, v1 and v2 link, and v3 links with defaults written out).

Uploads load in an effect, after the page has started, so the server and the browser render
the same list and an upload shows its image right after a page load (fixed in Phase 5c; the
former known-bug test in `tests/e2e/editor-items.spec.ts` is a normal test now).

`encodeState(list, {format: 2})` and `encodeTierStateForURL` (`lib/listLink.ts`) still write v2.

## Fixtures

`tests/fixtures/state/v3.json` holds v3 links with the exact list each one must decode to
(A25), in the same shape as `generated.json`: `{id, format, description, state, expected}`.
The unit tests check that every `state` decodes to its `expected` list, and that every
`expected` list encodes back to its `state`.

The file is append-only, like every fixture: never edit, reorder or delete an entry. To add
one, write the `expected` list in the decoded form (all three layout fields, every tier id),
set `state` to `encodeV3(expected)`, and append the entry at the end. The tests then check it
in both directions.

## Adding a version 4

1. Add `lib/state/decoders/v4.ts` and register it in `VERSIONED_DECODERS` in
   `lib/state/decode.ts` under the key `'4'`. Values are versioned only when they match
   `/^(\d+)\./` with a registered version; everything else goes to the legacy decoder.
2. Add the new fields to `CanonicalState` as optional fields, so v0 to v3 lists stay valid.
3. Add `encodeV4`, add `4` to `WriteFormat`, and let `encodeState` write it under
   `{format: 4}`. Switch `DEFAULT_WRITE_FORMAT` only when the app is ready for it.
4. Add `tests/fixtures/state/v4.json`. Keep `v3.json` and its tests: v3 links decode forever.
5. Update this document.

Before adding a version, check whether v3 can carry the change. A new top-level key works:
v3 decoders skip keys they do not know. A new value for a known key also works, for example a
new `tp` for a new row template: older v3 code refuses such a link and never misreads it. A new
version is needed when the same JSON would mean something different, because older code would
then misread it.
