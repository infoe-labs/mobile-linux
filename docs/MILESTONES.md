# Implementation milestones

Status is based on observed tests, not browser capability assumptions.

| Phase | Implemented and tested | Outstanding |
| --- | --- | --- |
| 0 — Research | Actual upstream licenses/API inspection; no LinuxOnTab code copied; pinned runtime/image inputs; source collector | Independent release compliance review |
| 1 — Linux | Genuine kernel, ext4 root, ash, uname/os-release verified in Node, Chromium and WebKit | Physical Safari/phone boot |
| 2 — Terminal | xterm, fit/search, copy/paste, sticky keys, font/themes, Visual Viewport, safe areas, responsive layout | Physical keyboards, IME and installed mobile viewport tests |
| 3 — Persistence | IDB block writes, guest sync, cold restart without RAM snapshot, manual snapshots and restore verified in Chromium and WebKit | Fault injection for quota loss, browser process kill during write, cross-device backups |
| 4 — Files | Dedicated COM2 helper, real listing/edit/create/import/export/rename/delete, binary transfers up to 1 MiB | Large/chunked files, non-UTF-8 Linux names, recursive search |
| 5 — Offline | Explicit Workbox VM/shell precache; offline cold boot verified; scoped manifest paths and Actions pipeline | Actual Pages deployment and phone install |
| 6 — Completion | Real ash Tab/history; Compose guest command/path suggestions plus common flags and in-memory history; unit tested | Complex quoting, live cwd tracking, full shell-aware suggestions |
| 7 — Local AI | Explicit pinned model download, scoped cache, worker WASM inference, offline text generation and unload verified in Chromium and WebKit | Mobile memory validation, model quality evaluation, WebGPU provider, richer model tiers |
| 8 — Reliability | Type checking, lint, unit/browser tests, storage scope and compatibility checks, privacy/source documentation | Full physical-device/failure matrix; production release assessment |

No phase is claimed universally complete across iOS/Android. Source builds,
desktop verification and mobile emulation cannot satisfy physical acceptance.

## Next technical priority

Run the documented physical iPhone/Android keyboard and termination tests, then
validate allocation/headroom on a lower-memory phone with AI disabled. Preserve
and export real guest data before any image or disk-format change. Add fault
injection and chunked transfer before expanding optional UI features.
