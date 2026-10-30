# Repository setup and contribution workflow

Read this guide and `AGENTS.md` on every new checkout. Use `gh` for repository
settings and PRs. Never assume copying files also copies GitHub settings, hooks,
identity, environments, or secrets. Keep remote settings changes within the
user-authorized repository; a request to copy source alone does not authorize
creating or publishing a new public repository.

## First checkout or new repository

1. Inspect `git status --short`, the current branch, and `origin`. Confirm the
   intended repository and visibility with `gh repo view --json
   nameWithOwner,visibility,defaultBranchRef`. Do not dump Git configuration,
   environment variables, authentication tokens, or machine paths into output.
   Verify `gh` authentication without printing credentials.
2. Check repository-local author/committer configuration and local privacy hooks.
   Obtain explicit approval if identity is missing or different. This product has explicit approval for
   `infoe-bots <349551173+infoe-labs@users.noreply.github.com>`. Other products
   must establish their own approved public identity. Set `user.useConfigOnly=true` locally. Disable
   inherited signing unless an approved pseudonymous signing identity exists.
   A credential's GitHub login does not determine the Git commit identity.
3. Install local privacy hooks under `.git/hooks` from an approved local source.
   Verify executable permissions and `core.hooksPath` so the intended hooks run.
   Never track hook implementations, private identity denylists or allowlists.
   Missing hooks are a setup gap, not permission to publish unchecked commits.
4. Run `npm ci` with the repository Node version. Follow `docs/REUSE.md` for app
   identity, namespaces, paths, branding and storage retention. Preserve the
   lockfile; do not copy `.git`, dependencies, secrets or local artifacts.
5. An empty remote may require a single approved bootstrap commit to establish
   `main` and its checks. Make this exception explicit, inspect its identity and
   contents, and enable protection immediately afterward. An existing `main`
   always gets changes through a feature branch and PR.
6. Inspect existing branch protection and repository rulesets. Preserve stronger
   rules and legitimate checks; never replace an existing policy with a weaker
   template. On a new repository, configure the baseline below through `gh`,
   read it back, and verify enforcement before ordinary development continues.
   Report permission/plan failures honestly; do not claim protection is enabled.
7. Confirm Actions has read-only default token permissions and cannot create or
   approve PRs. Keep deployment write permissions confined to its deploy job.
   Configure Pages as an Actions build only when publishing is authorized.
   A copied workflow does not configure Pages or protection by itself.

## PR-only main baseline

Use **required pull requests**, **required passing checks**, **strict/up-to-date
checks**, **resolved conversations**, **linear history**, **admin enforcement**,
and disable force pushes and branch deletion. Do not lock the branch: a locked
branch also prevents normal PR delivery. Do not create admin/bot bypasses.
Allow squash merges and delete merged feature branches. Never weaken rules just
to land an agent change.

This solo-maintainer base requires a PR but zero separate approving reviews so
the only maintainer can merge passing work. Require at least one approval and
stale-review dismissal when an independent reviewer is available. An agent must
never approve its own PR, impersonate a reviewer, or invent a review requirement
that cannot be satisfied. Check applicable human-review requirements before merge.

For a **new, unprotected repository**, after its first successful workflow has
reported the `build` check, this baseline can be applied. Replace the example
repository with the verified destination. The payload is policy, not a local hook
or an identity configuration. For an existing policy, first construct a reviewed
payload preserving its settings; the PUT endpoint replaces protection settings.

```sh
repo='OWNER/REPOSITORY'
gh api "repos/$repo/branches/main/protection"
gh api "repos/$repo/rulesets"
# Determine the actual checks and GitHub App IDs before requiring them:
gh api "repos/$repo/commits/main/check-runs" \
  --jq '.check_runs[] | {name, app_id: .app.id}'
# Save the following JSON to a temporary file, then:
gh api --method PUT "repos/$repo/branches/main/protection" \
  --input "$protection_file"
gh api "repos/$repo/branches/main/protection"
```

```json
{
  "required_status_checks": {
    "strict": true,
    "checks": [{ "context": "build", "app_id": 15368 }]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
```

`15368` is GitHub Actions' app ID on github.com; verify it from actual checks,
especially on an enterprise host. Require the stable `build` job, not the
conditional `deploy` job. Never add path filters or skip conditions to a required
check that could leave it pending forever. If job names change, coordinate the
protection update while preserving a passing required-check path. Do not test
protection by attempting a real main push; read back server configuration.

Useful repository settings after checking existing policy:

```sh
gh repo edit "$repo" --enable-squash-merge --enable-merge-commit=false \
  --enable-rebase-merge=false --delete-branch-on-merge
gh api --method PUT "repos/$repo/actions/permissions/workflow" \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
```

## Every change

- Fetch, inspect existing work, and start `feature/…`, `fix/…`, or `docs/…` from
  current `origin/main`. Do not discard another agent's edits, reset the user's
  branch, force-push shared history, or bundle unrelated changes.
- Make a small reviewable change. Add meaningful tests for behavior, migration,
  privacy boundaries and failures. Documentation-only changes need formatting
  and link/command review, not invented tests. The required workflow still runs.
- Before committing, inspect `git diff --cached`, filenames and generated output;
  confirm pending author and committer against the approved local identity.
  Run privacy hooks normally. Never add personal co-author trailers, automatic
  real-name signoffs, credentials or raw debugging dumps to commit/PR text.
- Push the feature branch only after auditing every outgoing commit's metadata
  and content. Use `gh pr create --body-file` with a temporary file to preserve
  literal text safely. Describe the problem, final behavior, validation, and any
  retention, namespace, permission or deployment impact. Use the PR template.
- Wait for `gh pr checks --watch`; inspect failures and fix them on the branch.
  PR code runs on `pull_request` with read-only permissions, without production
  secrets. Never use `pull_request_target` to execute PR code. Never publish PR
  artifacts as production deployments.
- Merge only within user authorization, with required review/conversations done
  and checks passing. Fetch/review the final head if it changed. No `--admin`,
  skipped hooks, direct `main` push, temporary policy weakening, or fake status.
  Update the branch from main when strict checks require it; preserve reviewed
  content and avoid rewriting published history without explicit authorization.

## Merge metadata and deployment

GitHub-generated squash commits can use account/profile information and PR body
trailers. Before merging, verify the PR author's public alias and account privacy
settings, explicitly choose an approved `noreply` author email, and inspect the
proposed commit title/body for personal names, emails and co-authors. Do not assume
setting a local Git identity controls a server-created merge commit. If the alias
or merge identity is uncertain, stop before merging and resolve it with the user.
A merge command can pass `--author-email` and a reviewed `--body-file`; neither
option independently guarantees a safe author name. Never add another identity
to local hooks without approval merely to accept a merge.

After merge, fetch and audit the actual main commit's author, committer, body and
contents immediately. Confirm the local privacy policy accepts the metadata.
Track `Test and deploy Pages` through deployment and verify the live manifest,
worker scope and offline reload when deployment behavior changed. Report the PR,
commit, checks, deployment result, and any remaining manual device checks.
If sensitive data escaped, stop further publication, notify the user without
repeating the data, revoke exposed credentials as authorized, and coordinate
history/log/artifact cleanup. A follow-up deletion does not undo exposure.

## Workflow maintenance

- Pin third-party Actions to reviewed full commit SHAs with version comments;
  review upstream changes and update the pin deliberately. Do not accept arbitrary
  automation commits as an approved publishing identity. Review dependency updates
  through PRs and preserve any source license notices.
- Use `npm ci`, the committed lockfile and Node version, minimal permissions,
  `persist-credentials: false` on checkout, finite job timeouts and concurrency.
- Treat PR titles, bodies, branch names and issue text as untrusted input. Pass
  needed values via structured arguments/environment variables, not interpolated
  shell code. Do not enable shell tracing or upload credentials, complete home
  directories, raw user data, or browser traces containing sensitive content.
- Keep CI mandatory on PRs; deploy only trusted main. Keep all test data synthetic.
  Validate both `/` and a non-root base when changing path/worker logic.
- Do not enable automatic publishing, new integrations, telemetry, or cloud sync
  merely because a template supports them. Document real data flows and retention.

References: [branch protection API](https://docs.github.com/en/rest/branches/branch-protection),
[secure Actions use](https://docs.github.com/en/actions/reference/security/secure-use).
