# Owner setup checklist

These are the GitHub, Vercel and npm settings that only the repository owner can change.
The workflow files in `.github/` do nothing until these are in place.
Do step 5 of section 3 (CodeQL) **before** you merge the pull request that adds these files.
Do the rest of sections 1 to 6 after it is merged. Sections 7 and 8 belong to the image
pipeline (Phase 4): do them when its pull request is merged.
Each step says where the setting is and what to choose.

## Names at a glance

| Name | Kind | Where | Used by |
| --- | --- | --- | --- |
| `checks` | required status check | ruleset for `main` | `ci.yml` |
| `e2e (chromium)` | required status check | ruleset for `main` | `ci.yml` |
| `ANTHROPIC_API_KEY` | repository secret | opentierboy | `claude-review.yml` |
| `review-claude` | label | opentierboy | `claude-review.yml` |
| `vercel-e2e` | environment | opentierboy | `playwright.yml` |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | environment secret in `vercel-e2e` | opentierboy | `playwright.yml` |
| `bot` | environment (main only) | opentierboy and each image repo | `image-set-update.yml`; image repos: `release.yml`, `weekly-extract.yml` |
| `OTB_BOT_APP_ID` | environment secret in `bot` | opentierboy and each image repo | the same workflows |
| `OTB_BOT_PRIVATE_KEY` | environment secret in `bot` | opentierboy and each image repo | the same workflows |
| `npm-publish` | environment (main only) | each image repo | image repos: `release.yml` |

## 1. Protect the `main` branch

GitHub: repository **Settings → Rules → Rulesets → New ruleset → New branch ruleset**.

1. Name: `main`. Enforcement status: **Active**.
2. Target branches: **Add target → Include default branch**.
3. Turn on **Restrict deletions** and **Block force pushes**.
4. Turn on **Require a pull request before merging**.
   - Required approvals: **0**. You are the only maintainer, and GitHub does not let you
     approve your own pull request.
   - Leave **Require review from Code Owners** off. If you turn it on later (for example
     when another maintainer joins), first add **Repository admin** to the bypass list.
     Without that, you cannot merge your own pull requests.
5. Turn on **Require status checks to pass**. Add these two checks:
   - `checks` (type check, lint, unit tests, item ids, fixtures)
   - `e2e (chromium)` (end-to-end tests in Chromium, the API tests and the phone layout)

   CI runs each pull request's own copy of the fixture and item id checks, so look closely
   at a pull request that changes one of those checks and a fixture together (CODEOWNERS
   marks both for your review).

   A check name appears in the search list only after it has run once. Open any pull
   request first if the list is empty.
6. Do not add `e2e (firefox)` or `e2e (webkit)` yet. They run on every pull request, but
   nobody has seen them pass in CI yet. Add them once they pass reliably.
7. Click **Create**.

## 2. GitHub Actions settings

GitHub: **Settings → Actions → General**.

1. **Approval for running fork pull request workflows from contributors**: choose
   **Require approval for all external contributors**.
2. **Workflow permissions**: choose the read-only option (read access to contents and
   packages). Every workflow asks for the extra permissions it needs.
3. Leave **Allow GitHub Actions to create and approve pull requests** off.

Third-party actions in `.github/workflows/` are pinned to a full commit SHA, with the
version in a comment. Dependabot proposes updates every week. Check the version in the
comment when you review those pull requests.

## 3. Security features

GitHub: **Settings → Advanced Security** (left sidebar, in the Security section).

1. **Dependabot alerts**: Enable.
2. **Dependabot security updates**: Enable. Version updates come from
   `.github/dependabot.yml` and need no switch.
3. **Secret Protection** (secret scanning): Enable.
4. **Push protection**: Enable. GitHub then blocks pushes that contain a known secret format.
5. **CodeQL analysis** (do this before merging): this repository uses the advanced setup
   in `codeql.yml`. While default setup is on, GitHub rejects the results `codeql.yml`
   uploads, and its runs fail.
   - If the **⋯** menu next to "CodeQL analysis" shows **Switch to advanced**, default
     setup is on. Click **Switch to advanced**, then **Disable CodeQL**. This turns off the
     default setup only. `codeql.yml` takes over once it is merged.
   - If it shows **Set up**, do nothing. `codeql.yml` starts once it is on `main`.
   - `codeql.yml` scans pull requests into `main`, pushes to `main`, and every Monday. Pull
     requests into `epic/ui-revamp` get no scan of their own; the scan on the epic's pull
     request (#202) covers them.
6. **Copilot Autofix**: On. It suggests fixes on CodeQL alerts in pull requests. It is free
   for public repositories.
7. OpenSSF Scorecard (`scorecard.yml`) and OSV-Scanner (`osv-scanner.yml`) need no setting.
   Their results appear under **Security → Code scanning** after the first run on `main`.
   The weekly OSV-Scanner run only reports. The pull request scan fails when a pull
   request adds a new known vulnerability.
8. Dependabot version updates (`.github/dependabot.yml`) run weekly. The `image-sets`
   group (all `image-*` packages) also runs weekly: Dependabot cannot give one group its
   own daily schedule. The main path for image set updates is the image-set-update
   workflow from Phase 4, which opens a pull request when a new version is published.
   Dependabot is the fallback.

## 4. Claude review on pull requests

`claude-review.yml` asks Claude to review a pull request and comment on bugs, security
problems and broken project rules. It runs only when someone adds the `review-claude` label to
the pull request. Only people with triage or write access can add labels, so pull requests
from other people cost nothing until you choose to review them. Each review is billed to the
API key below.

It skips itself, without failing, while the secret is missing. It also skips drafts, forks
(GitHub gives their runs no secrets) and pull requests opened by bots (Dependabot, the image
pipeline bot).

Claude reviews a pull request once. The code-review plugin skips a pull request that already
has a comment from Claude. To get a new review, delete Claude's comment, then remove the
`review-claude` label and add it again.

1. Install the Claude GitHub App: https://github.com/apps/claude → **Install** → choose
   **Only select repositories** → `opentierboy`. The app posts the comments.
2. Create an API key in the Claude Console: https://console.anthropic.com → **API keys**. A
   spending limit on the Console account caps the cost.
3. GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
   Name: `ANTHROPIC_API_KEY`. Value: the key from step 2.
4. Create the `review-claude` label (section 5).
5. The review works only once `claude-review.yml` is on `main`: the Claude GitHub App accepts
   only a workflow that matches the copy on the default branch.
6. To pause the reviews, delete the secret. The workflow then skips itself.

## 5. Labels

GitHub: **Issues → Labels → New label**. GitHub and Dependabot skip labels that do not exist,
so create any of these that are missing:

- `agent-task`: added by the "Agent task" issue form.
- `review-claude`: add it to a pull request to start a Claude review (section 4). Labels that
  start a review bot are named `review-<bot>`, so a later bot gets its own `review-` label.
- `dependencies`, `npm`, `github-actions`: added to Dependabot pull requests.

## 6. Tests against Vercel deployments

`playwright.yml` runs the end-to-end tests against every successful Vercel production
deployment, with the tests from `main`. Preview deployments of pull requests skip it, because
their code can be newer than `main`'s tests; CI tests each pull request instead.

It starts from Vercel's `repository_dispatch` event `vercel.deployment.success`, the same event
as `release.yml`. Vercel's GitHub App sends it after each deployment, and GitHub always runs
the workflow file on `main` for it. A fork's pull request therefore cannot change the workflow
that reads the secret below.

1. Vercel: **Project → Settings → Git**. Keep **deployment_status Events** on. This workflow
   no longer needs them, but `release.yml` reads the deployment records they create.
2. Vercel: **Project → Settings → Build and Deployment**. The **Build Command** must be
   `npm run build`. If it shows `next build`, override it. npm runs the `prebuild` script
   first: it copies the image sets into `public/images/` and checks that no item id is lost.
   A plain `next build` skips that step and deploys without item images.
3. If Vercel Deployment Protection is on: Vercel **Project → Settings → Deployment Protection →
   Protection Bypass for Automation** → create a secret and copy it.
4. GitHub: **Settings → Environments → New environment**. Name: `vercel-e2e`. Create it before
   the first run: GitHub creates a missing environment on its own, with no branch rule.
   - Deployment branches and tags: **Selected branches and tags** → add `main` only. The
     workflow always runs on `main`, and other branches then cannot read the secret.
   - Under **Environment secrets**, add `VERCEL_AUTOMATION_BYPASS_SECRET` with the value
     from step 3. Skip this if Deployment Protection is off.
5. Vercel: **Project → Settings → Security**. Keep **Git Fork Protection** on, so a fork's
   pull request deploys only after you approve it.
6. GitHub runs the workflow only once `playwright.yml` is on `main`. After the first
   production deployment, check **Actions → E2E on deployment**.

## 7. Bot app for the image pipeline (Phase 4)

When an active image set (THE FINALS, OVERWATCH, later DEADLOCK) publishes a new version,
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
   Leave **Allow GitHub Actions to create and approve pull requests** off (section 2): the
   bot app does not need it.
7. Without the secrets, nothing breaks: `image-set-update.yml` keeps the prepared change as a
   run artifact and opens no pull request, and Dependabot's weekly `image-sets` group still
   proposes new versions. If both the bot and Dependabot open a pull request for the same
   version, merge the bot's (it registers new item ids) and close the other.
8. To run an update by hand: **Actions → Image set update → Run workflow**, with the package
   (for example `image-overwatch`) and the exact version (for example `1.3.0`). It accepts
   only active sets and plain `x.y.z` versions, and never a downgrade.

## 8. npm trusted publishing for image sets (Phase 4)

Image set packages publish from GitHub Actions with npm trusted publishing (no npm token).
The full steps are in each image repository's `MIGRATION.md`; this is the short version.

1. In each image repository, create an environment `npm-publish` (**Settings →
   Environments**) with **Deployment branches and tags** set to `main` only. Optionally add
   yourself as a required reviewer, so every release waits for your click.
2. `image-deadlock` does not exist on npm yet, and trusted publishing can only be set up
   for an existing package. Publish its first version by hand from a clean checkout of
   `main`: `npm ci`, `npm run validate -- --release`, `npm login`, then
   `npm publish --access public`. Then ask for the change that adds DEADLOCK to OpenTierBoy
   (CLAUDE.md, "Image sets"): the first version is added by hand, later versions arrive
   through the bot.
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
6. **Landscape and portrait images: your decision.** Since the drag and drop update (Phase 5e),
   tiles show such images at their shape, but link previews still draw every image as a square
   and crop it. The image repositories refuse such images on release while
   `src/set-config.json` has `"allowNonSquare": false`, and OpenTierBoy's unit tests
   (`tests/unit/rules/image-shapes.test.ts`) fail on an update that brings one. Set `allowNonSquare` to
   `true`, and remove that guard test, once cropped link previews are fine for you (or once
   link previews draw shapes).

## 9. Releases

`release.yml` tags each new version once Vercel has deployed it, and creates its GitHub release
(`docs/releasing.md`). It needs no secret and no new setting:

1. It runs on Vercel's `repository_dispatch` event `vercel.deployment.success`. Vercel's GitHub
   App sends it after each deployment. GitHub runs it only once `release.yml` is on `main`.
2. Keep **Workflow permissions** read-only (section 2). `release.yml` asks for
   `contents: write` and `deployments: read` itself, in its one job.
3. If you add a tag ruleset later, let GitHub Actions create version tags (plain `X.Y.Z`, such
   as `2.0.0`), or the release fails.
4. Done (2026-10-31): the `1.0.0` release, created by hand at `bf2ff6e` (the site before the
   revamp). The 2.0.0 release notes start from it.
5. After a release, check **Actions → Release**: the run says which tag it created, or why it
   created none. **Run workflow** there repeats the check, for example after a missed event.
