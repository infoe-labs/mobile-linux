# Testing and observed limits

Run Node 22.12+ (`nvm use`), build assets, then:

```
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
BASE_PATH=/mobile-linux/ npm run build
BASE_PATH=/mobile-linux/ npm run test:e2e
RUN_AI=1 npm run test:e2e -- --grep 'optional model'
node scripts/verify-boot.mjs
```

`CHROME_PATH` can select an existing Chromium executable for local checks.
Only synthetic fixtures are used. Standard tests do not download model weights;
RUN_AI explicitly enables the optional ~185 MB test. Browser test contexts discard
their synthetic data on close. Test artifacts are ignored and not uploaded by CI.

Automated coverage:

- Boot state transitions and rejection of impossible states.
- Unicode/control-character filename protocol encoding and malformed metadata.
- Namespace isolation, scoped deletion, expiry and unavailable storage.
- Cross-block IDB commit/reopen without RAM state, incompatible-image preservation.
- Deterministic completion from supplied real guest metadata.
- Actual kernel boot and serial shell commands in Chromium and WebKit.
- File edit through helper, reload/disk recovery, RAM+disk snapshot save/restore.
- Offline cold boot, unrelated app preference preservation, no external core requests.
- Manifest/start/scope/icon paths and narrow viewport layout.
- Optional offline local model generation and worker unload.

The browser reload test destroys the VM instance with no saved RAM snapshot.
It does not simulate arbitrary power failure in the middle of an IDB transaction.
Fake IndexedDB tests do not prove real disk durability against hardware loss.

## Physical device release matrix (all pending)

Test iPhone Safari and installed Home Screen, Android Chrome and installed PWA,
desktop Safari, plus at least one low-memory phone. Record device class/browser
version and observations without personal identifiers.

1. Boot, run uname/os-release, vi, top, Ctrl+C, Tab, arrows, hardware keyboard,
   Unicode/IME, selection/copy/paste. Open/close keyboard; rotate and scroll.
2. Create a synthetic file, sync, kill the app, reopen. Repeat during active writes;
   observe journal recovery and report any loss without pretending zero loss.
3. Save/restore/export/import a snapshot and disk backup, including corrupt headers,
   wrong runtime/RAM/image, low quota and interrupted writes.
4. Install, wait for cache completion, airplane mode, fully close/reopen and boot.
5. Background during boot/inference/snapshot. Observe suspension, heat and battery.
6. Deny persistence; simulate eviction and storage denial. Verify visible errors,
   preserved backups, and no deletion of another same-origin application's data.
7. Update with a running guest, paused guest, active write, dirty editor and loaded
   AI. Ensure explicit safe update and no silent disk migration.
8. Interrupt model download, retry from cache, infer offline, unload/cancel, delete.
   If allocation fails, verify Linux remains usable with AI unloaded.

Do not mark iOS/Android acceptance complete based on Playwright WebKit or viewport
emulation. Manual install and keyboard behavior require the operating system.
