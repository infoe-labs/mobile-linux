# Copy-over guide for humans and agents

This repository is a foundation, not a complete product or a hosted dependency.
Copy its tracked source into the destination and make a deliberate adaptation.
Do not copy `.git/`, `.env*` files, `.secrets/`, `node_modules/`, `dist/`, local
hook implementations, or test artifacts. Preserve any destination privacy rules
and reconcile its existing files instead of blindly overwriting them. Git hooks
are local and require separate installation; never publish their contents.

Before ordinary development, follow `docs/REPOSITORY_SETUP.md` to establish
local identity/hooks, mandatory PRs, branch protection and CI through `gh`.

Before the first deployment:

1. Read `AGENTS.md`, `README.md`, `docs/STORAGE.md`, and
   `docs/REPOSITORY_SETUP.md`. Preserve their privacy
   requirements and update documentation to describe the resulting product.
2. Give `app.config.js` a unique public, non-personal `appId`. Change package name,
   title/description/theme/Apple metadata in `index.html`, and app branding.
   Replace the original geometric placeholder PNG icons in `public/`, keeping
   the manifest sizes and a maskable icon with artwork inside its safe area.
3. Choose the deployment base before collecting data. Keep manifest ID, start URL,
   scope, worker registration and storage base aligned through `BASE_PATH`.
   Keep each same-origin app in a disjoint directory; avoid a parent-scope worker
   over independently deployed child apps. Use different origins for security.
4. Replace the demo UI and `demo` namespace. Use `createIndexedStore` for feature
   data and `createLocalStore` for small preferences. Name each feature explicitly
   and define retention/deletion. Do not copy an app ID into a separate product
   merely because the source was copied. Never use personal identifiers as names.
5. Keep Tailwind local and components under `src/components/ui`. shadcn components
   are editable source with `components.json` configured for React/JavaScript,
   Tailwind v4, CSS variables and the `@/` alias. Add only needed components with
   `npx shadcn@latest add <component>`, then audit their dependencies and network use.
6. Keep API/third-party/authenticated requests outside shell caching. Extend the
   service worker only with an explicit caching and retention policy. Include new
   bundled asset extensions in `globPatterns` if the product introduces them.
7. Configure GitHub Pages → GitHub Actions, or deploy `dist/` to a static HTTPS
   host. Set the `BASE_PATH` Actions variable for custom domains. The base includes
   a workflow, not account setup or a live deployment. Review workflows before
   enabling them in a destination with different publication requirements.
8. Run `npm ci`, `npm run check`, and repeat build/browser tests with a non-root
   `BASE_PATH`. Install Playwright's Chromium once via `npx playwright install chromium`.
   Verify offline restart, namespace isolation, scoped deletion, storage denial,
   update acceptance, and phone installation on real devices before release.

Manual release checks:

- Visit online and wait for Offline ready; save a synthetic note; go offline,
  close/reopen or reload and confirm local data remains usable.
- Install on Android via Chrome's prompt/menu. On iOS use Safari → Share → Add to
  Home Screen, enable Open as Web App if offered, and verify standalone launch,
  icon, safe areas, rotation, and offline reopen.
- Deploy a changed build with an old tab open. Revisit online/reload to check for
  updates; verify the update prompt, draft protection, and accepted reload.
  There is no background update polling or forced reload.
- Check another app's storage/cache before and after install, updates and demo
  deletion. Confirm only the intended feature scope is erased.
- Simulate denied/full storage and verify generic recoverable feedback without
  loss of unsaved text or sensitive console output.

Local hooks and repository identity never travel with a source copy. Get explicit
approval for a destination-local identity before committing; follow the privacy
checks in `AGENTS.md` before any commit or push.
