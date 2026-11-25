# Proof log

Each row is one deliberate break. A walk or a test must turn red against it, which proves that the check reads the value.

Most breaks are a wrong expected value in a model file under `tests/models/`. The run was the walk of that model in Chromium, and `git checkout` restored the file afterwards.

Recorded on 2026-11-22. The model rows ran against commit `80d0c1f`, and their line numbers belong to that commit. Three rows say "fixed later": at `80d0c1f` their result was GREEN, and a later commit of the same pull request fixed the check.

"n steps" is the count of events before the state check failed.

## Totals

| Result | Rows |
|---|---|
| RED: the walk failed on the changed value | 120 |
| GREEN: the walk passed, so the check has a gap | 5 |

At `80d0c1f` the totals were 110 RED and 8 GREEN.

## Open gaps

| Models | Gap |
|---|---|
| `add-from-template`, `remove-and-undo`, `device-images`, `recently-viewed` | A state check asserts a toast where the model expects one. Where the model expects none it asserts nothing, since a toast of an earlier step can still show. |
| `device-images` | The field `browser` selects the tab that the check reads. A wrong `'this'` reads the main tab, which shows the same list. |

## Breaks outside the model files

| Break | Turned red |
|---|---|
| App: every label forced to the left (`components/DragDropTierList.tsx`) | The history walk, once its check read the label position (fixed later). Three hand-written tests in `history.spec.ts` and `share-panel.spec.ts`. |
| App: Undo puts a deleted item at the end of its row (`lib/tierList.ts`) | One unit test in `tierList.test.ts`. Part 1 of the remove-and-undo walk, at step 2. |
| App: a row stack shows on an empty row (`components/RowHandle.tsx`) | All 4 parts of the mouse-drag walk. |
| Test: "position 2 of 3" changed to "1 of 3" | "writes no history entry and no new URL when the user moves an item right and back with the keyboard and drops it" |
| Test: toast title changed | "renders the toast "Item restored" when the user clicks Undo in the toast "Item deleted"" |
| Test: "Show Labels" changed to "Hide Labels" | "renders row labels on top when the page opens a v3 link with lp top" |
| Test: expected item `first` changed to `second` | "renders the toast "Files not added" when the user pastes an image right after dropping a list file" |

## zen-layout

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| layoutOf (layout) | zen-layout.ts:22 `zen.on` -> `zen.on === 'wide' ? 'tall' : zen.on` | RED | 11 steps: Layout button name expected "Layout: 9:16", got "Layout: 16:9" |
| listChangedIn | :26 `=== 'changed'` -> `=== 'opened'` | RED | 0 steps: items of row A expected 1 item, got none (toHaveText) |
| ZEN_FRAME_NAMES.editor | :10 `null` -> `'Frame 16:9'` | RED | frame region "Frame 16:9" not found (first editor state) |
| ZEN_FRAME_NAMES.wide | :11 `'Frame 16:9'` -> `'Frame 16:10'` | RED | 11 steps: Frame accessible name expected "Frame 16:10", got "Frame 16:9" |
| ZEN_FRAME_NAMES.tall | :12 `'Frame 9:16'` -> `'Frame 9:17'` | RED | 19 steps: expected "Frame 9:17", got "Frame 9:16" |
| ZEN_FRAME_NAMES.overlay | :13 `'Frame 16:9'` -> `'Frame 16:10'` | RED | 26 steps: expected "Frame 16:10", got "Frame 16:9" |
| ZEN_LAYOUT_NAMES.editor | :6 `'Editor'` -> `'16:9'` | RED | Layout button expected "Layout: 16:9", got "Layout: Editor" |
| ZEN_LAYOUT_NAMES.wide | :6 `'16:9'` -> `'9:16'` | RED | 11 steps: expected "Frame 16:9", got "Frame 9:16" |
| ZEN_LAYOUT_NAMES.tall | :6 `'9:16'` -> `'Editor'` | RED | 19 steps: Frame 9:16 not found |
| ZEN_LAYOUT_NAMES.overlay | :6 `'Overlay · green key'` -> `'16:9'` | RED | 26 steps: frame cover colour expected rgb(0, 177, 64), got rgb(255, 255, 255) |

## zen-order

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| RANKING_ORDER_NAMES.pickFreely | zen-order.ts:6 `'Pick freely'` -> `'In order'` | RED | Ranking order button expected "Ranking order: In order", got "Pick freely" |
| RANKING_ORDER_NAMES.inOrder | :6 `'In order'` -> `'Shuffle'` | RED | 5 steps: Up next item expected "Mauga", got "Sigma" |
| RANKING_ORDER_NAMES.shuffle | :6 `'Shuffle'` -> `'Pick freely'` | RED | 9 steps: heading expected "Up next", got "Unranked" |
| orderOf | :16 inOrder reported as 'shuffle' | RED | 5 steps: expected "Ranking order: Shuffle", got "In order" |
| queueHiddenIn | :20 `=== 'hidden'` -> `=== 'shown'` | RED | 5 steps: list "Queue (hidden)" not found |

## zen-steps

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| step | zen-steps.ts:19 `Number(match[1])` -> `=== 2 ? 3 : ...` | RED | step count text expected "3 / 2", got "2 / 2" |
| total | :19 `Number(match[2])` -> `+ 1` | RED | 0 steps: expected "1 / 2", got "1 / 1" |

## history

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| version | history.ts:16 `Number(match[1])` -> `=== 2 ? 3 : ...` | RED | "the items of row A" differs |
| versions | :16 `Number(match[2])` -> `+ 1` | RED | 0 steps: tab history should hold 2 versions, expected 3 got 2 |
| labelPosition | App break: every label forced to the left in `components/DragDropTierList.tsx` | RED | 7 steps: "the label of row S should sit above its items". Fixed later: at `80d0c1f` the check ignored the position. |
| itemLabels | :16 `=== 'shown'` -> `=== 'hidden'` | RED | 0 steps: row S items text expected/received differ (toHaveText) |

## leaving

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| page | leaving.ts:28 `'home.fromOpened': {page: 'home'}` -> `editor(1)` | RED | 2 steps (CLICK_HOME, HOME_ANSWERS, BROWSER_BACK path): toHaveURL of the editor address failed on Home |
| version | :22 `'editing.changed': editor(2)` -> `editor(1)` | RED | row F / items list differ (toEqual) |
| imageAdded | :21 `editor(1, {imageAdded: true})` -> `editor(1)` | RED | 2 steps: Unranked items, 1 extra item (dropped image) received |
| homeAhead | :30 `'back.opened': editor(1, {homeAhead: true})` -> `editor(1)` | RED | 3 steps: history entries expected 12, got 13 |

## editor-rows

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| rows (name) | editor-rows.ts:32 `empty('B')` -> `empty('Z')` in `one` | RED | 4 steps: tier 1 name expected "Z", got "B" |
| rows (items) | :34 five: S items `['Mauga']` -> `[]` | RED | 1 step: items in tier "S" differ |
| rows (order) | :29 three: `empty('A','B')` -> `empty('B','A')` | RED | 1 step: tier 2 name expected "B", got "A" |
| canAdd (false -> true) | :26 nineteen `false` -> `true` | RED | 0 steps: Add row expected enabled, got disabled |
| canAdd (true -> false) | :32 `one` add `false` | RED | 4 steps: Add row expected disabled, got enabled |

## tips

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| shown (value) | tips.ts:30 linkSaveToast.nothingWaits `'linkSave'` -> `'firstDrag'` | RED | 2 steps: first-drag tip not visible |
| shown (null) | :33 noTip.firstDragSeen `null` -> `'linkSave'` | RED | 19 steps: link-save toast not visible |
| stored.seen (list) | :30 deviceImagesToast seen without 'device-images' | RED | 7 steps: stored tips toEqual differs (extra id received) |
| stored.seen (list, noTip) | :34 noTip.linkSaveSeen `seen('first-drag')` | RED | 3 steps: stored toEqual differs |
| stored.seen (null) | :36 tipsOff `seen: null` -> `[]` | RED | 27 steps: stored toEqual differs |
| stored.off | :36 tipsOff `off: true` -> `false` | RED | 25 steps: stored toEqual differs |

## tips-shared-list

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| shown (value) | tips-shared-list.ts:13 sharedListTip `'sharedList'` -> `'linkSave'` | RED | 0 steps: link-save toast not visible |
| shown (null) | :16 noTip.nothingSeen `null` -> `'sharedList'` | RED | 13 steps: shared-list tip not visible |
| stored.seen (list) | :17 noTip.sharedListSeen `seen('shared-list')` -> `seen()` | RED | 1 step: stored toEqual differs |
| stored.seen (null) | :20 tipsOff `seen: []` | RED | 24 steps: stored toEqual differs |
| stored.off | :20 tipsOff `off: false` | RED | 24 steps: stored toEqual differs |

## appearance

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| mode | appearance.ts:31 light reported as 'dark' | RED | 1 step: body background expected rgb(12,10,9), got white |
| font | :32 modern reported as 'classic' | RED | 0 steps: font-family expected /Nunito Sans/, got Geologica |
| gameColours | :33 `=== 'on'` -> `=== 'off'` | RED | 0 steps: Share colour expected rgb(13,98,181), got rgb(182,61,11) |
| tileSize | :34 compact/comfortable swapped | RED | 0 steps: tile width expected 48, got 80 |
| labelsShown | :35 `'WithLabels'` -> `'WithoutLabels'` | RED | 0 steps: caption expected hidden, got visible |
| STORED_THEME.light | :40 `['light']` -> `['dark']` | RED | 1 step: "the stored theme" false |
| STORED_THEME.dark | :41 `['dark']` -> `['light']` | RED | 3 steps: "the stored theme" false |
| STORED_THEME.system | :42 `[null, 'system']` -> `['light']` | RED | 0 steps: "the stored theme" false |

## add-from-template

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| sets | add-from-template.ts:30 both `['tank','support']` -> `['tank']` | RED | 7 steps: Unranked item count expected 13, got 24 |
| picker (value) | :35 'picker.packages' `'Packages'` -> `'OVERWATCH'` | RED | 1 step: OVERWATCH picker page not found |
| picker (null) | :34 closed `null` -> `'Packages'` | RED | 0 steps: Packages page not found |
| toast (value) | :38 tankAdded `'Items Added'` -> `'No New Items'` | RED | 3 steps: "No New Items" toast not found |
| toast (value 2) | :40 nothingAdded -> `'Items Added'` | RED | 5 steps: Undo button of "Items Added" not found |
| toast (null -> toast) | :34 closed `null` -> `'Items Added'` | RED | 0 steps: Undo button not found |
| toast (toast -> null) | :38 tankAdded `'Items Added'` -> `null` | GREEN | Open. The check asserts a toast where the model expects one. Where the model expects none it asserts nothing, since a toast of an earlier step can still show. |
| TEMPLATE_SETS.tank.example | :7 `'Mauga'` -> `'Mercy'` | RED | 3 steps: "Mercy" in Unranked expected 1, got 0 |
| TEMPLATE_SETS.tank.tag | :7 `'tank'` -> `'sup'` | RED | 3 steps: Unranked count expected 11, got 13 |
| TEMPLATE_SETS.support.example | :7 `'Mercy'` -> `'Mauga'` | RED | 3 steps: "Mauga" expected 0, got 1 |

## remove-and-undo

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| rows (oneItemDeleted) | remove-and-undo.ts:28 `S: ...slice(1)` -> `slice(0, 1)` | RED | 1 step: row S texts differ |
| rows (itemsReset) | :29 Unranked `.sort()` -> `.sort().reverse()` | RED | 1 step: Unranked texts differ |
| rows (allItemsRemoved) | :30 Unranked `[]` -> `['Reinhardt']` | RED | 2 steps: Unranked expected 3 items fewer |
| rows (restored) | :68 restored rows -> `ROWS_AFTER[removal]` | RED | 2 steps: row S differs |
| rows (opened) | :60 `before.rows` -> `ROWS_AFTER.oneItemDeleted` | RED | 0 steps: row S differs |
| asOpened | :60 `asOpened: true` -> `false` | RED | 0 steps: page expected not to have the opened URL |
| dialog | :62 `path === 'confirming'` -> `'opened'` | RED | 0 steps: alertdialog count expected 1, got 0 |
| toastWithUndo (text) | :22 oneItemDeleted `'Item deleted'` -> `'Items Reset'` | RED | 1 step: Undo button in "Items Reset" toast not found |
| toastWithUndo (toast -> null) | :72 `path === 'undoOffered' && removal !== 'allItemsRemoved' ? ... : null` (also tried whole field `null`) | GREEN | Open. The check asserts a toast where the model expects one. Where the model expects none it asserts nothing, since a toast of an earlier step can still show. |
| newEntries | :73 `path.startsWith('undone.') ? 2 : 1` -> `1 : 1` | RED | 2 steps: expected 3 history entries, got 4 |
| newEntries (0) | :62 opened `newEntries: 0` -> `1` | RED | 0 steps: expected 3, got 2 |

## link-images

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| heldImages | link-images.ts:38 `first` heldImages [BLUE] -> [NAVY] | RED | 0 steps: Navy tile not found (expectLabelTiles toContainText images.example.org) |
| addedImages | :39 `greenAdded` addedImages [GREEN] -> [NAVY] | RED | 1 step: poll of requests to the other site expected ArrayContaining blue+navy, got green+blue |
| trustedImages | :38 `first` trustedImages [RED] -> [GREEN] | RED | 0 steps: "Green should load" |
| waiting | :48 `waiting: site === 'waiting'` -> `!==` | RED | 0 steps: notice region "Images from other sites" expected count 0, got 1 |
| answer | :47 `site === 'waiting' ? null` -> `? 'answering'` | RED | 0 steps: "images.example.org should hold its answer" |

## link-dialog

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| dialog (closed vs empty/refused/...) | link-dialog.ts:30 `'open.empty'` {dialog:'empty'} -> {dialog:'refused'} | RED | 1 step: dialog alert expected /starts with https:\/\//, not found |
| added (closed, null vs image) | :28 `closed` added null -> {image: PICTURE, picture: true} | RED | 0 steps: Unranked tray expected count 1, got 0 |
| added.image | :37 `'added.picture'` image PICTURE -> WEB_PAGE | RED | 21 steps: Unranked item "Broken" not visible |
| added.picture | :37 `'added.picture'` picture true -> false | RED | 21 steps: tile "Green" expected to contain i.imgur.com, got "Green" |
| checking.image | :32 `'open.checkingPicture'` image PICTURE -> WEB_PAGE | RED | 7 steps: "the address typed should be https://upload.wikimedia.org/broken.png" |
| failed.message | :35 `'open.notAPicture'` regex /^The image did not load -> /^Zzz did not load | RED | 3 steps: alert text expected /^Zzz did not load.../ |

## device-images

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| browser | :28 `'thisBrowser.redUnranked'` 'this' -> 'new' | RED | 5 steps: "the new browser should be open" (shown page is null) |
| browser (opposite direction) | :32 `'newBrowser.redUnranked'` 'new' -> 'this' (also tried `newBrowser.redRanked`) | GREEN | Open. The value selects the tab that the check reads, and the main tab shows the same list. |
| ranked | :29 `'thisBrowser.redRanked'` ['red'] -> [] | RED | 6 steps: tier S items expected only Mauga, got Mauga + red-square |
| unranked | :28 `'thisBrowser.redUnranked'` ['red'] -> ['blue'] | RED | 5 steps: Unranked items text mismatch |
| toast | :23 `'thisBrowser.noImages'` toast false -> true | RED | 0 steps: "Items Added" toast not found |
| toast (opposite direction) | :24 `'thisBrowser.redAdded'` toast true -> false | GREEN | Open. The check asserts a toast where the model expects one. Where the model expects none it asserts nothing, since a toast of an earlier step can still show. |

## share-panel

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| tab | share-panel.ts:28 `open === 'urlTab' ? 'URL' : 'Image'` swapped | RED | 1 step: tab "Image" aria-selected expected true, got false |
| captured | :29 `picture !== 'none'` -> `=== 'none'` | RED | 11 steps: "Captured tier list" image not visible |
| pictureDeviceImages | :30 `deviceImagesIn(picture, now)` -> 0 | RED | 21 steps: "the list in the downloaded file" (only read after DOWNLOAD) |
| clipboardDeviceImages | :31 `deviceImagesIn(clipboard, now)` -> 0 | RED | 14 steps: "the list in the copied link" |
| deviceImages | :32 `deviceImages: now` -> 0 | RED | 4 steps: Unranked count expected 13, got 14 |
| capturing | share-panel.ts:32 `capturing` -> `capturing: false` | RED | 3 steps: list "Capture steps" expected count 0, got 1 |
| tab while capturing | :27 `panel.capturing` -> `'imageTab'` | RED | 4 steps: tab "Image" not found (the panel is closed after Escape) |

The two rows on capturing were recorded on 2026-11-25, when the machine got its capturing state. Their line numbers belong to the commit that added it.

## shared-link

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| list | shared-link.ts:54 `list` -> opposite list (rows left as is) | RED | 0 steps: "the link in the address bar" |
| rows | :39 and :45 row S items ['Mauga', RED.label] -> [RED.label, 'Mauga'] (both lists, one sed) | RED | 0 steps: "items in S" |
| deviceImageKept | :54 `browser === 'maker'` -> `!== 'maker'` | RED | 0 steps: "My cat should show the placeholder" |
| waiting | :54 `site === 'waiting'` -> `!==` | RED | 0 steps: notice region expected count 0, got 1 |

## freeze-frame-load

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| browser | freeze-frame-load.ts:37 `'newBrowser.fileList.otherSiteWaits'` 'new' -> 'same' | RED | 7 steps: "no request should reach images.example.org while its image waits" (reads the wrong tab's requests; the state's page itself is unchanged). Note: this field only selects the request log and two count checks. |
| list | :25 `'sameBrowser.editor.listMade'` 'mixedBag' -> 'changed' | RED | 0 steps: title expected "Changed later", got "Mixed bag" |
| link | :27 `'sameBrowser.editor.fileSaved'` 'fileOwn' -> 'newPictureId' | RED | 2 steps: picture id expected /^snap-/, got a plain id |
| dialog | :33 `'sameBrowser.home.asking'` 'home' -> 'editor' | RED | 4 steps: dialog expected "Your current list stays one Back step away." got the home text |
| captured | :26 `'sameBrowser.editor.captured'` true -> false | RED | 1 step: URL expected home pattern /^[^?]*\/$/ |
| otherSite | :25 `'sameBrowser.editor.listMade'` 'loads' -> 'waits' | RED | 0 steps: items in tier "A" (label tile instead of picture) |

## snapshot-files

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| list | snapshot-files.ts:25 `'editor.fileList'` list 'fileList' -> 'ownList' | RED | 9 steps: heading expected "Before", got "Snapshot list" |
| dialog | :18 `'editor.before.lists.ownList'` dialog null -> 'asking' | RED | 0 steps: dialog "Open the list in this file?" not found |
| message | :21 `'editor.before.brokenFileMessage'` 'brokenFile' -> 'notAPicture' | RED | 29 steps: toast "...: This file is not a picture." not visible |

## recently-viewed

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| pinned | recently-viewed.ts:30 `'tanksPinned.supportUnlisted'` view('tanks', null) -> view('support', null) | RED | 5 steps: recent links text mismatch |
| recent | :28 `'nonePinned.tanksRecent'` view(null,'tanks') -> view(null,'support') | RED | 1 step: recent links text mismatch |
| pinRefused | :31 `'tanksPinned.supportRecent'` false -> true | RED | 6 steps: toast "You can pin up to 20 lists" expected count 1, got 0 |
| pinRefused (opposite direction) | :32 `'tanksPinned.supportPinRefused'` true -> false | GREEN | Open. The check asserts a toast where the model expects one. Where the model expects none it asserts nothing, since a toast of an earlier step can still show. |
| recentLinkNames order (helper) | :54 added a second `...(recent ...)` before OTHER_RECENT_LISTS | RED | 1 step: recent links text mismatch |

## keyboard-drag

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| shownIn | keyboard-drag.ts:30 `carrying(...)`: `shownIn: over` -> `from` | RED | 6 steps: items in row A |
| linkIn | :30 `carrying(...)`: `linkIn: from` -> `over` | RED | 6 steps: "the link should hold the tile in its row" (expected A, got Unranked) |
| `carried` | :30 `carrying(...)`: `carried: true` -> false | RED | Fixed later. 1 step: held handles expected 0, got 1. |
| `carried` (opposite) | :29 `resting(...)`: `carried: false` -> true | RED | Fixed later. 0 steps: held handles expected 1, got 0. |
| heard | :34 `Dropped ${item} in` -> `on` | RED | 7 steps: announcer text expected "Dropped Mauga on row A..." got "in" |
| order | :25 `aFirst` ['A','S','Unranked'] -> ['A','Unranked','S'] | RED | 6 steps: "tier 2 name" expected Unranked, got S |

## mouse-drag

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| items | :26 `'winstonInS.maugaFirst'` rows([M,W]..) -> rows([W,M]..) (also `winstonInA.maugaInS` W moved to Unranked: RED at 22 steps, items in tier "A") | RED | 10 steps: items in tier "S" |
| order | :36 `aFirst` ['A','S','Unranked'] -> ['A','Unranked','S'] | RED | 14 steps: "tier 2 name" expected Unranked, got S |

## scribble

Recorded on 2026-11-26, against the commit that adds the model.

| Field | Edit | Result | First failing message, or note |
|---|---|---|---|
| NOTE_COUNTS.blank | scribble.ts:10 `blank: 0` -> `1` | RED | 1 step: ink layer expected "Scribbles: 1 note", not found |
| NOTE_COUNTS.oneNote | :10 `oneNote: 1` -> `2` | RED | 3 steps: ink layer expected "Scribbles: 2 notes", got "Scribbles: 1 note" |
| NOTE_COUNTS.twoNotes | :10 `twoNotes: 2` -> `1` | RED | 8 steps: ink layer expected "Scribbles: 1 note", got "Scribbles: 2 notes" |
| penOf | :20 'penOn' reported as 'penOff' | RED | 2 steps: button "Scribble" pressed expected "false", got "true" |
| penOf (Zen off) | :20 'zenOff' reported as 'penOff' | RED | 0 steps: button "Scribble" not found |
