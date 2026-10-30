# Agent privacy and commit policy

This is a public, pseudonymous repository. Treat every tracked file, commit,
tag, pull request, release artifact, and CI log as permanently public.

## Privacy-centric development

Privacy is a design requirement for every feature. Read `README.md` before
adding data collection, persistence, logging, caching, or network requests.

- Collect and retain only the data necessary for the requested feature. Prefer
  in-memory processing and define cleanup and expiration for retained data.
- Keep personal data, credentials, request/response bodies, and user content out
  of logs, diagnostics, analytics, test fixtures, and error reports. Use synthetic
  test data and generic operational messages.
- Audit dependency logging, telemetry, caches, and outbound requests. Disable
  unnecessary collection and document required external services.
- Treat service-worker caches, browser storage, and offline data as retained
  data. Minimize their contents and provide expiration and deletion behavior.
- Keep secrets out of client bundles, public assets, service workers, and caches.
- Document actual data flows and retention as features are implemented; do not
  claim privacy guarantees that the implementation has not established.

## Repository setup and PR-only delivery

Read `docs/REPOSITORY_SETUP.md` before setup, GitHub configuration, or publication.
On a new repository, use `gh` to verify the destination and enable PR-only `main`
with required CI and admin enforcement. Preserve stronger existing rules. A
source copy does not copy server settings or local hooks. Only an explicitly
approved empty-repository bootstrap may establish main directly; ordinary work
uses a feature branch and PR. Never bypass protection, approve your own PR,
weaken checks, or infer a server-created merge identity from local Git settings.
Verify approved public author/committer metadata before and immediately after
merge. Keep production deployment restricted to trusted main.

## Identity safety

- Use only the repository-local Git author and committer identity already
  configured and approved by the local identity hooks.
- Never infer an identity from the operating-system user, hostname, global Git
  configuration, GitHub login, shell prompt, home directory, or another
  repository.
- Never replace the configured identity or add a new identity without explicit
  user approval.
- If no repository-local identity is configured, stop before committing and
  obtain explicit user approval for the identity. Do not copy another
  repository's identity into Git configuration.
- Never bypass commit or push hooks with `--no-verify` or an equivalent option.
- GitHub-created commits must use the project's public alias and GitHub's
  private `noreply` address. Audit their metadata immediately after merging.

## Information that must remain local

Do not commit, paste into PR text, emit into CI logs, or publish in release
metadata any personal name, personal email, account name, system username,
hostname, IP address, physical location, absolute local path, shell prompt,
secret, token, local environment file, or local hook implementation.

Local hooks belong under `.git/hooks`; they must never be copied into the
repository. Secrets and machine-specific deployment configuration must remain
in ignored local files.

## Required checks before publishing

Before every commit and push:

1. Inspect the staged diff for identity data, secrets, local paths, and machine
   details.
2. Confirm the pending commit's author and committer match the approved
   repository-local identity.
3. Run the local privacy hooks normally and stop if they reject the operation.
4. Inspect every commit in the outgoing range, including metadata and tracked
   contents, before pushing.

If a privacy check fails, do not weaken or bypass it. Fix the offending content
or identity. A local hook may be narrowly updated only when it rejects an
already-approved public GitHub `noreply` merge identity; such updates must stay
local and must not permit personal identities.

## Base-layer reuse and architecture

- This repository is intended to be referenced or copied into future app repos.
  Read `docs/REUSE.md` and `docs/STORAGE.md` before adapting it.
- Keep React/Vite, locally compiled Tailwind CSS and shadcn/ui as the UI stack.
  Reusable browser modules belong in `src/lib`; product UI belongs in components.
- Give each copied product a unique public app ID. Scope every browser storage
  identifier by app ID, base path, feature namespace, and data version. Use the
  supplied adapters. Never clear all origin storage/caches or service workers.
- Namespaces prevent accidental collisions, not same-origin access. Document
  origin-wide permissions/quotas and use separate origins for security isolation.
- Keep worker scope, manifest paths and storage base aligned for subpath hosting.
  Cache only explicitly approved public assets. Retention changes and schema
  versions require an explicit migration/deletion plan.
- Preserve Android installation and iOS home-screen guidance, Apple metadata,
  touch icon, standalone display, responsive layout and safe-area spacing.
- Run `npm test`, `npm run build`, and `npm run test:e2e` for relevant changes.
  Verify non-root deployment builds and offline reloads. Never represent browser
  emulation as real Android/iOS installation testing.
