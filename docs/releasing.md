# Versions and releases

OpenTierBoy uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (owner decision,
2026-10-31). Every merge into `main` deploys to production (Vercel). The version is a name for what
is live, so the site does not show it.

## The version

The version lives in `package.json` (and `package-lock.json`). The pull request into `main` that
should ship raises it:

- **Major** (`3.0.0`): people must relearn something, or something goes away. A redesign, a removed
  feature, theme or image set, a changed flow.
- **Minor** (`2.1.0`): something new, and everything else works as before. A new feature, a new
  option, a new image set.
- **Patch** (`2.0.1`): fixes, image updates inside an existing set, wording, performance, security.

A pull request that changes nothing visitors notice (docs, CI, tests) leaves the version as it is.
Shared links never break, so a link format change is never a reason for a major version on its own.

Raise it with `npm version X.Y.Z --no-git-tag-version --ignore-scripts`, which changes both files.

## Releases happen on their own

`.github/workflows/release.yml` runs after each successful Vercel deployment. When the live
production commit carries a version with no tag yet, it tags that commit `vX.Y.Z` and creates the
GitHub release, with notes from the merged pull requests. A deployment whose version already has a
tag does nothing. The workflow explains its safety checks at the top.

So a release needs no manual step: merge the pull request with the new version, and the tag and
release follow once Vercel reports the deployment.

## Rolling back

Vercel's Instant Rollback brings back the previous production deployment within seconds. To find
an older version, use its tag: the tag names the commit, and Vercel lists its deployments by commit.

## 2.0.0, the UI revamp

The revamp is built on `epic/ui-revamp`; PR #202 brings it into `main`. Before merging #202, create
the `v1.0.0` release by hand (GitHub, **Releases → Draft a new release**, tag `v1.0.0`, target
`bf2ff6e`), so the 2.0.0 release notes start from it. The workflow then releases `v2.0.0` once
Vercel deploys the merge.
