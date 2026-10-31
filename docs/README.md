# Docs

This index lists each doc, who it is for and what it covers. The rules for working in this
repository are in `CLAUDE.md`, and the guide to the end-to-end tests is `tests/README.md`.

| Doc | For | What it covers |
| --- | --- | --- |
| [maintainers/repository-settings.md](maintainers/repository-settings.md) | the owner | GitHub and Vercel settings that only the owner can change |
| [maintainers/releasing.md](maintainers/releasing.md) | the owner | versions, releases and rollbacks |
| [maintainers/image-sets.md](maintainers/image-sets.md) | the owner and agents | the image set pipeline (bot app, npm trusted publishing), adding DEADLOCK, a manual update run, making a set legacy, landscape and portrait images |
| [reference/link-format.md](reference/link-format.md) | contributors and agents | link format v3: the JSON, tier ids, decoder checks, limits, and how the app writes and reads links |
| [reference/images.md](reference/images.md) | contributors and agents | images from links and devices, trusted image sites, the device image store and the Content Security Policy |
| [reference/snapshot-files.md](reference/snapshot-files.md) | contributors and agents | snapshot files (a Freeze Frame PNG with the list inside) and Recently viewed |
| [reference/drag-and-drop.md](reference/drag-and-drop.md) | contributors and agents | the dnd-kit fork in `packages/dnd-kit`, the adapter in `lib/dnd`, and drag performance |
| `media/` | the README | the feature GIFs of the README (`npm run record:gifs` records them) |
