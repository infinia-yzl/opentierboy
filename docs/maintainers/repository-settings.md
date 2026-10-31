# Repository settings

For the owner: the GitHub and Vercel settings that only the repository owner can change.
The workflow files in `.github/` do nothing until these are in place.
Each step says where the setting is and what to choose. Each image set's own repository
documents its own settings.

## Names at a glance

| Name | Kind | Where | Used by |
| --- | --- | --- | --- |
| `checks` | required status check | ruleset for `main` | `ci.yml` |
| `e2e (chromium)` | required status check | ruleset for `main` | `ci.yml` |
| `ANTHROPIC_API_KEY` | repository secret | opentierboy | `claude-review.yml` |
| `review-claude` | label | opentierboy | `claude-review.yml` |
| `vercel-e2e` | environment | opentierboy | `playwright.yml` |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | environment secret in `vercel-e2e` | opentierboy | `playwright.yml` |
| `bot` | environment (main only) | opentierboy | `image-set-update.yml` |
| `OTB_BOT_APP_ID` | environment secret in `bot` | opentierboy | `image-set-update.yml` |
| `OTB_BOT_PRIVATE_KEY` | environment secret in `bot` | opentierboy | `image-set-update.yml` |

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
6. `e2e (firefox)` and `e2e (webkit)` run on every pull request too, and they pass in CI
   (first on #216). Add them as required checks when you want them to block a merge.
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
5. **CodeQL analysis**: this repository uses the advanced setup
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
   Scorecard also publishes its score on the public OpenSSF site (`publish_results: true`).
   The weekly OSV-Scanner run only reports. The pull request scan fails when a pull
   request adds a new known vulnerability.
8. Dependabot version updates (`.github/dependabot.yml`) run weekly. The `image-sets`
   group (all `image-*` packages) also runs weekly: Dependabot cannot give one group its
   own daily schedule. The main path for image set updates is the image-set-update
   workflow, which opens a pull request when a new version is published
   (section 8). Dependabot is the fallback.

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
that reads the secret in step 3.

1. Vercel: **Project → Settings → Git**. Keep **deployment_status Events** on. This workflow
   no longer needs them, but `release.yml` reads the deployment records they create.
2. Vercel: **Project → Settings → Build and Deployment**. The **Build Command** must be
   `npm run build`. If it shows `next build`, override it. npm runs the `prebuild` script
   first: it copies the image sets into `public/images/` and checks that no item id is lost.
   A plain `next build` skips that step and deploys without item images.
3. Only if Vercel Deployment Protection covers production deployments: Vercel **Project →
   Settings → Deployment Protection → Protection Bypass for Automation** → create a secret.
   Then GitHub: **Settings → Environments** → `vercel-e2e` (create it if it is missing) →
   **Environment secrets** → add `VERCEL_AUTOMATION_BYPASS_SECRET` with that secret. Without
   Deployment Protection there is nothing to set: GitHub creates `vercel-e2e` on the first run,
   and the workflow only runs from `main`.
4. Vercel: **Project → Settings → Security**. Keep **Git Fork Protection** on, so a fork's
   pull request deploys only after you approve it.
5. GitHub runs the workflow only once `playwright.yml` is on `main`. After the first
   production deployment, check **Actions → E2E on deployment**.

## 7. Releases

`release.yml` tags each new version once Vercel has deployed it, and creates its GitHub release
(`docs/maintainers/releasing.md`). It needs no secret and no new setting:

1. It runs on Vercel's `repository_dispatch` event `vercel.deployment.success`. Vercel's GitHub
   App sends it after each deployment. GitHub runs it only once `release.yml` is on `main`.
2. Keep **Workflow permissions** read-only (section 2). `release.yml` asks for
   `contents: write` and `deployments: read` itself, in its one job.
3. If you add a tag ruleset later, let GitHub Actions create version tags (plain `X.Y.Z`, such
   as `2.0.0`), or the release fails.
4. After a release, check **Actions → Release**: the run says which tag it created, or why it
   created none. **Run workflow** there repeats the check, for example after a missed event.

## 8. Image set updates

When an image set publishes a new version on npm, its repository tells OpenTierBoy, and
`image-set-update.yml` opens a pull request with the update. A GitHub App (the "bot") pushes
that branch and opens the pull request.

1. Install the bot app on `opentierboy`: GitHub, your profile **Settings → Developer
   settings → GitHub Apps** → the app → **Install App** → add `opentierboy`. The app needs
   **Contents: Read and write** and **Pull requests: Read and write**.
2. GitHub: **Settings → Environments → New environment** → name `bot`.
   - **Deployment branches and tags**: **Selected branches and tags** → add `main` only.
     Only workflow runs on `main` can then read the bot's secrets.
   - Under **Environment secrets**, add `OTB_BOT_APP_ID` (the app's App ID or Client ID) and
     `OTB_BOT_PRIVATE_KEY` (the full contents of the app's private key file).
3. Pull requests from the bot never merge on their own. You review and merge each one, and CI
   runs on them like on any pull request. Leave **Allow GitHub Actions to create and approve
   pull requests** off (section 2): the bot app does not need it.
4. Without the secrets, nothing breaks: `image-set-update.yml` keeps the prepared change as a
   run artifact and opens no pull request, and Dependabot's weekly `image-sets` group still
   proposes new versions. If both open a pull request for the same version, merge the bot's
   (it registers new item ids) and close the other.
5. To run an update by hand: **Actions → Image set update → Run workflow**, with the package
   (for example `image-overwatch`) and the exact version (for example `1.3.0`). It accepts
   only the sets in `imageset.custom.json` that are not legacy, plain `x.y.z` versions, and
   never a downgrade.

## 9. Landscape and portrait images: your decision

Tiles show landscape and portrait images at their shape, but link previews still draw every
image as a square and crop it. OpenTierBoy's unit tests (`tests/unit/rules/image-shapes.test.ts`)
fail on an image set update that brings such an image. Remove that guard test once cropped
link previews are fine for you (or once link previews draw shapes).
