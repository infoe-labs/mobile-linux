# Alpine Pocket

A real Alpine Linux computer in a mobile-first, browser-local PWA. MIT-licensed
application code, built on the requested React/Vite PWA base layer. No account,
remote VM, tunnel, analytics or inference service.

This implementation boots Alpine 3.23.7 x86 with kernel 6.18.59-0-virt in v86,
connects xterm to a real ash shell, and persists its ext4 root disk in IndexedDB.
The file browser operates on guest files through a second serial channel. Optional
SmolLM2 inference runs in a browser Worker and was verified offline in Chromium.
This is a working development release, not a claim of production mobile readiness.

## Run

Node 22.12+, Python 3.12+, cpio and e2fsprogs are required for the asset build.
No Docker or backend is needed.

```sh
npm ci
npm run assets
npm run dev
```

Press **Boot Alpine**. Try `uname -a`, `cat /etc/os-release`, `top`, or
`vi /root/notes`. The default is 128 MB guest RAM, with a 64 MiB writable root.
Linux has no internet connection; `apk add` cannot reach online repositories.

```sh
npm run typecheck
npm run lint
npm test
python3 scripts/build-alpine/sources.py
npm run sbom
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

The source collection step supplies kernel/package/firmware sources alongside
redistributed binaries; see [asset construction and licensing](docs/ASSETS.md).
For an explicit ~185 MB optional model test:

```sh
RUN_AI=1 npm run test:e2e -- --grep 'optional model'
```

## Use

- Real shell: Ctrl/Cmd shortcuts, scrollback, search, selection, copy/paste,
  adjustable fonts/themes, and sticky Ctrl/Alt/Shift with accessory keys.
- Tab invokes ash's genuine completion. Compose offers explicit, non-executing
  command/path/common-flag suggestions from guest directory metadata. Its working
  directory is set explicitly; no guessed shell context.
- Files: browse, directory filter, text edit, create, rename, confirmed delete,
  binary import/export (1 MiB transfer limit). Refresh with Go after shell changes.
- System: pause/sync, stop, named RAM+disk snapshots, restore/export/import,
  disk backup/restore, storage permission, installation guidance and diagnostics.
- Assistant: optional explicit download, local command/error/script explanations,
  editable output, copy/insertion without execution, unload and delete model.

Changes committed to guest disk survive a browser restart without a RAM snapshot.
Unsaved editors and Linux write caches can still be lost on abrupt termination.
Use Pause & sync and export backups. Browser storage is unencrypted and evictable.
Model downloads contact Hugging Face; prompts/files/commands are not uploaded.

## GitHub Pages

The workflow tests PRs and deploys trusted main using Actions Pages. Enable Pages
with GitHub Actions in repository settings. It infers `/repository-name/`; override
`BASE_PATH` for a custom domain. The site URL is https://infoe-labs.github.io/mobile-linux/; check repository Actions for deployment status.

```sh
BASE_PATH=/mobile-linux/ npm run build
BASE_PATH=/mobile-linux/ npm run test:e2e
```

The manifest, worker, boot assets and storage namespaces respect the base path.
After the production app finishes caching, Linux cold-boots offline. AI is a
separate optional download. Updates wait for explicit acceptance with Linux
paused and AI unloaded; disk data is separate from app caches.

iPhone: Safari → Share → Add to Home Screen. Android: Chrome → Install app.
Physical installation/keyboard testing remains pending; desktop emulation is
not evidence of installed iOS/Android behavior. See [compatibility](COMPATIBILITY.md).

## Project status

See [milestones](docs/MILESTONES.md), [testing](TESTING.md),
[architecture](ARCHITECTURE.md), [security/privacy](SECURITY.md),
[third-party notices](THIRD_PARTY_NOTICES.md), and [SBOM](sbom.cdx.json).
There is one real serial shell, no independent PTY tabs. There is no guest network,
background execution guarantee, automatic snapshot, or validated mobile AI tier.

Public contributions must use an explicitly approved pseudonymous Git identity,
synthetic test data and PRs. Keep personal machine paths, usernames, hostnames,
real emails, secrets and raw user content out of commits and public artifacts.
