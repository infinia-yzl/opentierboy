# Images from links and devices

This page explains the building blocks for custom images. They are library code only. The
app does not use them yet. A later step wires them into the editor.

| Module | What it does |
| --- | --- |
| `lib/images/linkImage.ts` | Checks an image address from a link. |
| `lib/images/trustedSites.ts` + `trusted-image-sites.json` | Sites whose images load without asking. |
| `scripts/check-trusted-sites.mjs` + `scripts/tracker-list.pin.json` | Fails when a trusted site is a known tracker. |
| `lib/images/deviceStore.ts` | Keeps images from the device in the browser (IndexedDB). |
| `lib/images/imageCheck.ts` | Loads an image once to check it, and gives label-tile data. |
| `lib/security/csp.ts` | Builds the Content Security Policy header. |

## Images from a link

The visitor's browser loads these images. Our server never fetches them.
`checkLinkImageUrl(address)` accepts an address only when all of these hold:

- It starts with `https://`. Other schemes (`http`, `data`, `javascript`, `blob`...) are refused.
- The host is a domain name. IP addresses are refused in every notation, also tricks such
  as `https://2130706433/` or `https://[::ffff:127.0.0.1]/`.
- The host is not `localhost`, a name without a dot (`router`), a private or reserved name
  (`.local`, `.internal`, `.lan`, `.home.arpa`, `.test`...) or a service that turns a name into
  an IP address (`127.0.0.1.nip.io`).
- There is no user name, no password and no port other than 443.
- It has at most 2,000 characters.

It returns the address in its normal form (store this one), the host, and the domain to show
people. International names appear in punycode (`xn--bcher-kva.de`), so a look-alike letter
from another alphabet cannot imitate a familiar site. A refused address comes with a reason
code, such as `ip-address` or `not-https`.

One limit: a public name can still point at a private address in DNS. The browser cannot
see that. This is acceptable because images from untrusted sites only load after the visitor
agrees.

## Trusted image sites

`trusted-image-sites.json` lists the sites whose images load without asking: thefinals.wiki,
cdn.deadlock.wiki, static.wikia.nocookie.net, upload.wikimedia.org and i.imgur.com.

- A host matches exactly. `i.imgur.com` does not match `imgur.com` or `x.i.imgur.com`.
- An entry with `"subdomains": true` also matches names under it. Only thefinals.wiki has it,
  because the wiki serves its images from `www.thefinals.wiki`. Such an entry must be a
  registrable domain: a public suffix such as `github.io` or `co.uk` would trust everyone's
  sites under it, so the file check and `npm run check:trusted-sites` refuse it.
- Every entry needs a `reason`.

To add a site, add an entry, then run `npm run check:trusted-sites`. The check fails when the
host, a parent name of it, or any name under its registrable domain is on the Disconnect
tracker list (https://github.com/disconnectme/disconnect-tracking-protection, file
`services.json`).

### Why the repository has no copy of the tracker list

The Disconnect list is under the CC BY-NC-SA 4.0 licence. That licence forbids commercial
use. OpenTierBoy is under the AGPL licence, which lets anyone fork it and use it
commercially. A copy of the list inside the repository would give those forks a file they may
not use. So the repository keeps only a pin: `scripts/tracker-list.pin.json` names the
repository, the commit, the file and its SHA-256.

The check downloads that exact file at that exact commit with git, into `.cache/tracker-list/`
(git ignores this folder). It refuses the file when the SHA-256 differs from the pin. Without
network it prints a warning and passes, so `npm run check` still works offline. In CI
(`CI=true`, which GitHub Actions sets) a failed download fails the check.

To move the pin to a newer list:

1. `git clone --depth 1 https://github.com/disconnectme/disconnect-tracking-protection.git`
2. In that clone, `git rev-parse HEAD` gives the commit and `sha256sum services.json` the SHA-256.
3. Put both, the commit date and today's date in `scripts/tracker-list.pin.json`.
4. Run `npm run check:trusted-sites`.

## Images from the device

`openDeviceStore()` keeps images in IndexedDB, in the visitor's browser only.

- Each image gets a local id of 16 letters, digits, `-` or `_`. A v3 link stores the id and
  the label. Other people who open the link do not have the image and see a label tile.
- `isDeviceImageId` is the shared rule for these ids: 8 to 64 letters, digits, `-` or `_`,
  and never a name such as `__proto__`. The v3 link format and the snapshot file use the same
  function (amendment A40).
- The store keeps the image bytes, never a `blob:` URL.
- It accepts PNG, JPEG, WebP, GIF and AVIF, judged by the file's first bytes. Other formats
  (SVG, HEIC, BMP) must be converted first, for example drawn on a canvas and saved as PNG.
- Limits: 5 MB per image, 100 MB and 2,000 images in total. When a new image does not fit,
  the images used least recently are removed first. Images of the list on screen can be
  protected with the `keep` option.
- Without IndexedDB (private modes, blocked storage, the server) it keeps images in memory
  until the page closes. `store.persistent` is then false.
- Call it only from effects and event handlers, never while rendering.

Safari deletes a site's stored data, IndexedDB included, after 7 days of Safari use without
a visit to that site (Intelligent Tracking Prevention). Web apps added to the home screen are
exempt. Other browsers may clear storage when the disk is nearly full. So device images are a
convenience. The link stays the only save, and the snapshot file (Freeze Frame download)
carries the images themselves.

## Checking that an image loads

`checkImage(address)` loads the image once, without sending a referrer. It gives up after 10
seconds and refuses images wider or taller than 8,192 pixels or larger than 32 megapixels.
A browser cannot cap the download size of an image from another site, so these are the caps
it can apply.

When an image fails, the result carries label-tile data: the item's label, or a name made
from the file name (`74px-Abrams_vertical.png` gives "Abrams vertical"), and the domain. The
link preview (OG image) can use `labelFallback` for its label tiles too.

## Content Security Policy

`contentSecurityPolicyHeader()` builds this header:

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' https: data: blob:; object-src 'none'; base-uri 'self';
frame-ancestors 'none'; form-action 'self'
```

- The plan said to leave `script-src` out, so that the inline scripts of Next.js and the
  theme switcher keep working. Without `script-src`, browsers apply `default-src 'self'` to
  scripts and block those inline scripts. So the header states
  `script-src 'self' 'unsafe-inline'`, which keeps the plan's intent.
- Fonts: next/font downloads the Google fonts at build time and serves them from the site
  itself. No font host is needed.
- Connections: the app only talks to its own site. No other host is needed. If link images
  are ever read with `fetch()`, `connect-src` must add `https:`. Reading a `data:` or `blob:`
  URL with `fetch()` (for example to re-encode snapshot images) needs `data:` and `blob:` in
  `connect-src` too.
- No `'unsafe-eval'` in production. zod 4 runs `new Function("")` when it builds a schema, to
  test whether eval works, and the browser reports that as a violation. So app code imports
  `z` from `lib/zod.ts`, which turns that off (`jitless`). Never import from `zod` directly.
- Options: `dev` (adds `'unsafe-eval'` for `next dev`), `vercelToolbar` (adds the Vercel
  Toolbar hosts for preview deployments), `reportOnly` (reports problems and blocks nothing,
  for a trial), `extend` (adds sources).
