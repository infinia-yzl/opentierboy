# Image sets

For the owner: the image set pipeline (the bot app, npm trusted publishing), adding DEADLOCK, a
manual update run, and the decision on landscape and portrait images. The rules for image ids
and image sets are in `CLAUDE.md` ("Image id contract" and "Image sets").

## 1. Bot app for the image pipeline

When an official image set (THE FINALS, OVERWATCH, later DEADLOCK) publishes a new version,
its repository tells OpenTierBoy, and `image-set-update.yml` opens a pull request with the
update. A GitHub App (the "bot") pushes that branch and opens the pull request. The same app
lets the image repositories send the notice and open their weekly wiki extract pull requests.

1. GitHub: your profile **Settings → Developer settings → GitHub Apps → New GitHub App**.
   - Name: for example `OpenTierBoy Bot`. Homepage URL: `https://opentierboy.com`.
   - Webhook: turn **Active** off.
   - Repository permissions: **Contents: Read and write**, **Pull requests: Read and
     write**. Metadata becomes Read-only automatically. Leave everything else at No access.
   - Where can this app be installed: **Only on this account**.
2. After creating it, note the **App ID** (or the **Client ID**; either works). Click
   **Generate a private key**. A `.pem` file downloads.
3. Click **Install App** → your account → **Only select repositories** → `opentierboy`,
   `image-set`, `image-reachthefinals`, `image-overwatch` and `image-deadlock`.
   The workflows ask for less than the app may do: each run gets a token for one repository
   with only the permissions that step needs.
4. In each of those repositories, create an environment named `bot`: **Settings →
   Environments → New environment** → name `bot`.
   - **Deployment branches and tags**: **Selected branches and tags** → add `main` only.
     Only workflow runs on `main` can then read the bot's secrets.
   - Under **Environment secrets**, add (not as repository secrets):
     - `OTB_BOT_APP_ID`: the App ID or Client ID from step 2.
     - `OTB_BOT_PRIVATE_KEY`: the full contents of the `.pem` file.
5. Delete the `.pem` file from your computer after adding it everywhere.
6. Pull requests from the bot never merge on their own, and none of the workflows enables
   auto-merge. You review and merge each one. CI runs on them like on any pull request.
   Leave **Allow GitHub Actions to create and approve pull requests** off
   (`docs/maintainers/repository-settings.md`, section 2): the bot app does not need it.
7. Without the secrets, nothing breaks: `image-set-update.yml` keeps the prepared change as a
   run artifact and opens no pull request, and Dependabot's weekly `image-sets` group still
   proposes new versions. If both the bot and Dependabot open a pull request for the same
   version, merge the bot's (it registers new item ids) and close the other.

## 2. npm trusted publishing for image sets

Image set packages publish from GitHub Actions with npm trusted publishing (no npm token).
The full steps are in each image repository's `MIGRATION.md`; this is the short version.

1. In each image repository, create an environment `npm-publish` (**Settings →
   Environments**) with **Deployment branches and tags** set to `main` only. Optionally add
   yourself as a required reviewer, so every release waits for your click.
2. `image-deadlock` does not exist on npm yet, and trusted publishing can only be set up
   for an existing package. Publish its first version by hand from a clean checkout of
   `main`: `npm ci`, `npm run validate -- --release`, `npm login`, then
   `npm publish --access public`. Then ask for the change that adds DEADLOCK to OpenTierBoy
   (section 3): the first version is added by hand, later versions arrive through the bot.
3. For each image set (`image-set`, `image-reachthefinals`, `image-overwatch`,
   `image-deadlock`): npmjs.com → the package → **Settings → Trusted Publisher** →
   **GitHub Actions**:
   - Organization or user: `infinia-yzl`
   - Repository: the image repository name, for example `image-overwatch`
   - Workflow filename: `release.yml` (the file name only, without `.github/workflows/`)
   - Environment name: `npm-publish`
4. Publish once through the workflow to confirm it works. A new trusted publisher setting
   expires if nothing publishes through it within 2 days.
5. Then, on the same npm settings page, under **Publishing access**, choose
   **Require two-factor authentication and disallow tokens** → **Update Package Settings**.

## 3. Adding DEADLOCK

`image-deadlock` is not on npm yet. Once its first version is published (section 2, step 2),
one pull request adds it. `CLAUDE.md` ("Image sets", "Adding DEADLOCK") lists the steps.
The workflow refuses packages that are not on the official list, so the first version cannot
come through it.

## 4. A manual update run

To run an update by hand: **Actions → Image set update → Run workflow**, with the package
(for example `image-overwatch`) and the exact version (for example `1.3.0`). It accepts
only official sets and plain `x.y.z` versions, and never a downgrade.

## 5. Landscape and portrait images: your decision

Tiles show landscape and portrait images at their shape, but link previews still draw every
image as a square and crop it. The image repositories refuse such images on release while
`src/set-config.json` has `"allowNonSquare": false`, and OpenTierBoy's unit tests
(`tests/unit/rules/image-shapes.test.ts`) fail on an update that brings one. Set
`allowNonSquare` to `true`, and remove that guard test, once cropped link previews are fine
for you (or once link previews draw shapes).
