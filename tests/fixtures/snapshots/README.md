# Golden Freeze Frame files

Freeze Frame files that the app made with Download. People keep these files, so every one of
them must keep opening, like old links (CLAUDE.md, "Snapshot files"). Both the files and
`snapshots.json` are **append-only**: never edit, replace or delete a file or an entry.

- `snapshots.json` lists each file with its SHA-256, how it was made, and the list it opens:
  the page, the title, the rows with their item labels, the device pictures and the link images.
- `tests/unit/snapshot/golden.test.ts` checks each file's hash and reads it with the app's
  reader. `tests/e2e/snapshot-files.spec.ts` ("Golden Freeze Frame files") opens each file in the editor, as a visitor would.
- `npm run check:fixtures` refuses a changed or deleted entry in `snapshots.json`; the hash in the
  entry then refuses a changed file.

To add a file: build a list in the app, Capture Preview, Download, and copy the file here under
a new name (`<browser>-<date>.png`). Add an entry at the end of `snapshots.json`. A file from a
browser that saves its pictures as PNG (Safari) is a useful addition.
