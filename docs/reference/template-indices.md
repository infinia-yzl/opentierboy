# Template indices and community templates

For contributors and agents: how the editor lists and opens templates that other people
publish. A template is a Freeze Frame file (`docs/reference/snapshot-files.md`). An index is a
small JSON file that lists templates. The visitor's browser fetches both. The server does not
see any index or template.

## What people see

- **Community templates** is a button at the bottom of the template picker ("From template").
  It opens a dialog.
- **Your indices**: the visitor pastes the address of an index and clicks "Check index". The
  dialog shows the index's name, its source, the number of templates and this notice:
  "Templates in this index come from other people. OpenTierBoy does not review them." "Add
  index" stores the address in this browser. "Remove" takes it out again. A browser keeps at
  most 10 indices. The list starts empty: OpenTierBoy ships without a built-in index.
- **The list of templates** shows the entries of every index, with a search field (title, game,
  author) and "Refresh". Each index shows its own name and the source that its address gives:
  `github.com/owner/repository` in lowercase, or `gist.github.com/id`. An index cannot choose
  that source text. A gist's source leaves the owner out, because the gist host may answer for
  any owner name.
- **A click on a template** fetches the file, checks its size and checksum, and hands it to the
  existing file opening (`openFiles` in `components/useSnapshotFiles.tsx`). The dialog "Open
  the list in this file?" asks as usual, and the list opens with one new history entry.
- The entries are text only. The dialog does not load any picture before the visitor opens a
  template.

## The index format (a contract)

```json
{
  "format": 1,
  "name": "Example templates",
  "maintainer": "name or handle",
  "contact": "where to report a template",
  "updated": "2026-11-22",
  "templates": [
    {
      "id": "overwatch-heroes",
      "title": "Overwatch heroes",
      "game": "Overwatch",
      "author": "name or handle",
      "file": "https://raw.githubusercontent.com/owner/repository/main/overwatch-heroes.png",
      "bytes": 1482113,
      "sha256": "64 hex characters",
      "images": 45,
      "updated": "2026-11-22"
    }
  ]
}
```

| Field | Rule |
| --- | --- |
| `format` | Required. The number 1. A later whole number gives "made for a newer OpenTierBoy". |
| `name` | Required. 1 to 80 characters of plain text. |
| `maintainer`, `contact`, `updated` | Optional. Text of at most 60 and 200 characters, and a real day as `YYYY-MM-DD`. |
| `templates` | Required. A list of at most 500 entries. |
| `id` | Required. 1 to 64 characters from `a-z`, `0-9` and `-`, with a letter or digit at each end, unique in the index. |
| `title` | Required. 1 to 100 characters of plain text. |
| `game`, `author` | Optional. At most 60 characters of plain text each. |
| `file` | Required. The https address of a `.png` file on an allowed host. |
| `bytes` | Required. The exact size of the file, from 1 to 25 MB (the Freeze Frame limit). |
| `sha256` | Required. The SHA-256 checksum of the file, as 64 hex characters. |
| `images`, `updated` | Optional. A count from 1 to 500, and a day. |

- Plain text means: normalised to NFC, single spaces, and free of control characters,
  direction marks and invisible characters (`lib/templates/text.ts` lists the ranges). The
  joiner and the variation selectors of emoji are allowed. Markup in a text stays text.
- Unknown fields are dropped, so a later version can add fields.
- An entry that breaks a rule is skipped and counted. A broken structure refuses the whole index.
- The golden file `tests/fixtures/templates/index-format-1.json` fixes the meaning of format 1.
  Treat it like the link fixtures: add files, and leave existing ones as they are.

## Security rules

The threat model behind these rules is in the project notes of the maintainer ("Template
indices: threat model and security design").

1. **Data only.** Text from an index is rendered as React text. An address from an index is
   used for one thing: a request through `fetchBytes`. It does not become a link or a picture
   source.
2. **Allowed hosts.** `trusted-template-hosts.json` lists the hosts. A host matches exactly.
   `next.config.ts` puts exactly these hosts into `connect-src`
   (`templateConnectSources()`), and `npm run check:trusted-sites` checks them against the
   tracker list. A new host is one entry in that file. A host with a path rule of its own also
   needs an entry in `SOURCE_RULES` (`lib/templates/address.ts`).
3. **Address check.** `checkTemplateAddress` applies the rules of `checkLinkImageUrl` (https,
   a domain name, the default port, at most 2,000 characters), then the host list, then the
   path: plain path parts, `.json` for an index and `.png` for a file, and an address free of
   query and fragment. A percent escape is refused when it stands for a letter, a digit,
   `. _ ~ -`, a slash or a control character, so one file has one accepted spelling of its
   path. GitHub's raw host needs `/owner/repository/ref/path`, and the gist host needs
   `/owner/id/raw/file` or `/owner/id/raw/revision/file`.
4. **One fetch module.** `lib/templates/fetchBytes.ts` is the only app module that calls
   `fetch()` for another site (ESLint enforces it; the OG route may load its own files). Its
   request is a GET without custom headers, with `credentials: 'omit'`,
   `referrerPolicy: 'no-referrer'`, `redirect: 'error'` and `cache: 'no-store'`. It reads the
   answer in pieces and stops at the byte limit. It also stops when the host sends nothing for
   15 seconds (index) or 30 seconds (file), and after 30 seconds (index) or 10 minutes (file)
   in total. The dialog has a Cancel button for a file. Custom headers would cause a preflight
   request, which GitHub's raw host refuses. ESLint also keeps `XMLHttpRequest`, `EventSource`,
   `WebSocket` and `sendBeacon` out of app code.
5. **Size and checksum.** `fetchTemplateFile` reads at most `bytes`, requires the exact size
   and compares the SHA-256 value (Web Crypto). The index alone decides which bytes open.
6. **The Freeze Frame path stays in charge.** The checked bytes go through `checkFile` and
   `openFiles`: the snapshot reader's limits, the confirmation dialog and the re-drawing of
   every picture. A file without a list is refused as a template.
7. **Server code stays out.** ESLint blocks imports of `lib/templates` in every file under
   `app/`, in `proxy.ts` and in the modules of the OG route. Only client components in
   `components/` use these modules (`next.config.ts` reads the host list).
8. **Requests only on request.** The app contacts a template host when the dialog is open, for
   the visitor's own indices, and when the visitor checks an address or picks a template.
9. **Block list.** `blocked-templates.json` lists checksums of files, and sources in the form
   the app shows (`github.com/owner/repository`, `gist.github.com/id` or a host). A blocked
   source refuses every index and every template file at that source, whatever branch, letter
   case or file name the address uses. A change takes effect with the next deployment.
10. **Local list.** The index addresses live in local storage under `otb-template-indices`.
    Every read checks the shape with zod and every address with rule 3.

An index is cached in memory for 10 minutes. "Refresh" fetches it again. The content of an
index is not stored between visits.

Known costs, accepted for now: a template is parsed twice (once to check that it has a list,
once by `openFiles`), and a title may still stack many combining marks.

## Modules

| Module | What it does |
| --- | --- |
| `trusted-template-hosts.json` + `lib/templates/hosts.ts` | The allowed hosts and the `connect-src` sources. |
| `lib/templates/address.ts` | Checks an index or file address and derives its source text. |
| `lib/templates/text.ts` | The plain text rule. |
| `lib/templates/indexFormat.ts` | Parses and checks an index (format 1, limits, zod). |
| `lib/templates/fetchBytes.ts` | The one request profile, with byte limit, time limit and cancel. |
| `lib/templates/loadIndex.ts` + `indexCache.ts` | Fetches and parses an index; the 10 minute cache. |
| `lib/templates/templateFile.ts` + `checksum.ts` | Fetches a template file and checks size and SHA-256. |
| `blocked-templates.json` + `lib/templates/blockList.ts` | The block list. |
| `lib/templates/indexList.ts` | The visitor's index addresses in local storage. |
| `lib/templates/messages.ts` | The messages people see. |
| `components/useTemplateIndices.ts` | The index list and the loaded indices for React. |
| `components/CommunityTemplates.tsx` | The dialog. |

## Tests

- Unit tests: `tests/unit/lib/templates/`, one file for each module, with hostile inputs.
- Lint rules: `tests/unit/rules/import-rules.test.ts` (fetch only in `fetchBytes.ts`, server
  code without `lib/templates`).
- End-to-end: `tests/e2e/community-templates.spec.ts`, and two policy tests in
  `tests/e2e/security.spec.ts`. `tests/support/template-sites.ts` answers for the template
  host, so the tests do not reach GitHub.

## Open points

- A gist as the home of an index is allowed by the address check. A read of a gist from a web
  page has not been confirmed with a real gist yet, and the same holds for the gist host's
  answer to a wrong owner name.
- GitHub limits requests without a login. The limits have not been measured with a real index.
- The landing page does not offer community templates yet.
- `PRIVACY.md` does not mention requests to template hosts yet.
