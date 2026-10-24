# Owner setup checklist

These are the GitHub, Vercel and npm settings that only the repository owner can change.
The workflow files in `.github/` do nothing until these are in place.
Do step 5 of section 3 (CodeQL) **before** you merge the pull request that adds these files.
Do the rest of sections 1 to 6 after it is merged. Sections 7 and 8 belong to later phases.
Each step says where the setting is and what to choose.

## Names at a glance

| Name | Kind | Where | Used by |
| --- | --- | --- | --- |
| `checks` | required status check | ruleset for `main` | `ci.yml` |
| `e2e (chromium)` | required status check | ruleset for `main` | `ci.yml` |
| `CLAUDE_CODE_OAUTH_TOKEN` | repository secret | opentierboy | `claude-review.yml` |
| `vercel-e2e` | environment | opentierboy | `playwright.yml` |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | environment secret in `vercel-e2e` | opentierboy | `playwright.yml` |
| `OTB_BOT_APP_ID` | repository secret | opentierboy and each official image repo | image pipeline (Phase 4) |
| `OTB_BOT_PRIVATE_KEY` | repository secret | opentierboy and each official image repo | image pipeline (Phase 4) |

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
   - `checks` (type check, lint, unit tests)
   - `e2e (chromium)` (end-to-end tests in Chromium, the API tests and the phone layout)

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

`claude-review.yml` asks Claude to review each pull request and comment on bugs, security
problems and broken project rules. It uses your Claude subscription. It skips itself, without
failing, while the secret below is missing. It also skips drafts, forks, and pull requests
opened or updated by bots (Dependabot, the image pipeline bot).

Claude reviews a pull request once. The code-review plugin skips a pull request that already
has a comment from Claude, so later pushes are not reviewed again. To get a new review,
delete Claude's comment, then push again or re-run the "Claude review" job.

1. Install the Claude GitHub App: https://github.com/apps/claude → **Install** → choose
   **Only select repositories** → `opentierboy`.
2. On your computer, run `claude setup-token` and sign in. It prints a long-lived token.
3. GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
   Name: `CLAUDE_CODE_OAUTH_TOKEN`. Value: the token from step 2.
4. To pause the reviews, delete the secret. The workflow then skips itself.

## 5. Labels

GitHub: **Issues → Labels → New label**. GitHub and Dependabot skip labels that do not exist,
so create any of these that are missing:

- `agent-task`: added by the "Agent task" issue form.
- `dependencies`, `npm`, `github-actions`: added to Dependabot pull requests.

## 6. Tests against Vercel deployments

`playwright.yml` runs the end-to-end tests against every successful Vercel deployment. It runs
only for deployments that Vercel's GitHub App (`vercel[bot]`) reports.

1. Vercel: **Project → Settings → Git**. Keep **deployment_status Events** on. The workflow
   starts from these events.
2. Vercel: **Project → Settings → Build and Deployment**. The **Build Command** must stay
   `npm run build` (the default). Image preparation runs inside the build.
3. If Vercel Deployment Protection is on for previews: Vercel **Project → Settings →
   Deployment Protection → Protection Bypass for Automation** → create a secret and copy it.
4. GitHub: **Settings → Environments → New environment**. Name: `vercel-e2e`.
   - Deployment branches and tags: **No restriction**. Preview deployments come from any
     branch.
   - Under **Environment secrets**, add `VERCEL_AUTOMATION_BYPASS_SECRET` with the value
     from step 3. Skip this if Deployment Protection is off.
5. Vercel: **Project → Settings → Security**. Keep **Git Fork Protection** on.
6. **Never approve a Vercel deployment of a fork's pull request without reading its changes
   first.** A deployment runs `playwright.yml` from the fork's code, and that run can read
   the `vercel-e2e` secret.
7. Optional, safer: Vercel also sends a `vercel.deployment.success` event
   (`repository_dispatch`). GitHub always runs that kind of workflow from the file on `main`,
   so a fork cannot change it. Switching needs a small change to `playwright.yml`; ask for it
   if you want it.

## 7. Later: bot app for the image pipeline (Phase 4)

The image pipeline opens pull requests when a new image set version is published. It
needs its own GitHub App. Do this when the Phase 4 pull request is ready.

1. GitHub: your profile **Settings → Developer settings → GitHub Apps → New GitHub App**.
   - Name: for example `OpenTierBoy Bot`. Homepage URL: `https://opentierboy.com`.
   - Webhook: turn **Active** off.
   - Repository permissions: **Contents: Read and write**, **Pull requests: Read and
     write**. Metadata becomes Read-only automatically. Leave everything else at No access.
   - Where can this app be installed: **Only on this account**.
2. After creating it, note the **App ID**. Click **Generate a private key**. A `.pem` file
   downloads.
3. Click **Install App** → your account → **Only select repositories** → `opentierboy`,
   `image-set`, `image-reachthefinals`, `image-overwatch` and `image-deadlock`.
4. In each of those repositories, add two repository secrets (**Settings → Secrets and
   variables → Actions**):
   - `OTB_BOT_APP_ID`: the App ID.
   - `OTB_BOT_PRIVATE_KEY`: the full contents of the `.pem` file.
5. Delete the `.pem` file from your computer after adding it everywhere.
6. Pull requests from the bot never merge on their own. You review and merge each one.

## 8. Later: npm trusted publishing for image sets (Phase 4)

Image set packages publish from GitHub Actions with npm trusted publishing (no npm token).

1. `image-deadlock` does not exist on npm yet, and trusted publishing can only be set up
   for an existing package. Publish its first version by hand from your computer:
   `npm login`, then `npm publish --access public` in the `image-deadlock` folder.
2. For each image set (`image-set`, `image-reachthefinals`, `image-overwatch`,
   `image-deadlock`): npmjs.com → the package → **Settings → Trusted Publisher** →
   **GitHub Actions**:
   - Organization or user: `infinia-yzl`
   - Repository: the image repository name, for example `image-overwatch`
   - Workflow filename: `release.yml` (the file name only, without `.github/workflows/`)
   - Environment name: leave empty
3. Publish once through the workflow to confirm it works. A new trusted publisher setting
   expires if nothing publishes through it within 2 days.
4. Then, on the same npm settings page, under **Publishing access**, choose
   **Require two-factor authentication and disallow tokens** → **Update Package Settings**.
5. Do not publish images with landscape or portrait shapes before the drag and drop
   update (Phase 5e) is merged. Until then, such tiles show letterboxed and link previews
   crop them.
