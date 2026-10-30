# Alpine Pocket architecture

## Validated foundation

Research date: 2026-10-30. Original implementation on the requested PWA base
layer. See `docs/MILESTONES.md` for measured verification and outstanding work.

A genuine Alpine 3.23.7 x86 userland runs on Alpine's 6.18.59-0-virt Linux
kernel in v86 0.5.472. Direct kernel/initramfs boot mounts a 64 MiB ext4 IDE disk.
No shell command is interpreted by the application. Browser xterm input goes to
COM1; a guest ash process executes it. `uname` and `os-release` were verified
in Node v86, Chromium and WebKit. Firmware and WASM are served from this app's base.

## Upstream audit and alternatives

- [v86](https://github.com/copy/v86), source
  `cc37f35c43bf14865d74ad76879ecf9410f69eb1`, npm `0.5.472`: actual LICENSE is
  BSD-2-Clause. The npm package identifies this same source commit. The shipped
  SeaBIOS and VGA BIOS are separately LGPLv3/third-party components, not covered
  solely by v86's BSD license. Source build script pins SeaBIOS rel-1.16.2.
  Reviewed `src/browser/starter.js`, `src/buffer.js`, `src/ide.js`, `v86.d.ts`,
  examples/serial.html and examples/arch.html. The custom buffer is accepted by
  duck-typed get/set/load methods; IDE completion happens via its write callback.
  Snapshot state calls get_state/set_state. No upstream contribution is submitted.
- [LinuxOnTab](https://github.com/kilian-ai/linuxontab): inspected README and
  recursive tree. README lists component licenses; no repository LICENSE found.
  Its images are LFS objects with separately unestablished provenance. No source,
  images, tunnel clients, WISP endpoints, or social integrations were copied.
- [xterm.js](https://xtermjs.org/): actual npm LICENSE is MIT; local package,
  fit and search addons. No CDN fonts/scripts. Its terminal buffer stays outside
  React; output does not trigger React rendering.
- [WebLLM](https://github.com/mlc-ai/web-llm): actual upstream LICENSE is Apache-2.0.
  WebGPU-oriented inference and model runtime dependencies make it less suitable
  for the initial broad mobile baseline. Kept as a possible later provider.
- [Transformers.js](https://github.com/huggingface/transformers.js): installed
  `4.3.2`, actual LICENSE Apache-2.0, ONNX Runtime MIT. Chosen for an explicitly
  downloaded small q4 model with single-thread WASM inference in a Worker.
  SmolLM2 original weight LICENSE is Apache-2.0, exact revision pinned in code.
- v86's Buildroot/Arch examples validate serial and 9p techniques; Alpine's own
  kernel supports the IDE and ext4 configuration without a custom kernel build.
  A 9p root was considered, but custom block persistence preserves ordinary
  Linux files, package database, hardlinks and filesystem semantics together.
  No custom CPU emulator or unsupported OPFS adapter is introduced.

`THIRD_PARTY_NOTICES.md`, exact npm lockfile and CycloneDX SBOM accompany the
source. Generated assets record URLs/digests; package records remain in the guest.
Public binary releases require corresponding-source compliance; see docs/ASSETS.md.

## Runtime and state

A module singleton V86Controller owns the VM for the application's lifetime.
Navigating sheets never recreates the terminal or emulator. Explicit states:
uninitialized → downloading → preparing → booting → running; saving, paused,
restoring, stopped and failed have validated transitions. COM2 emits a fixed
protocol readiness frame only after root is mounted and the helper starts.
Emulator-loaded alone is not readiness. Boot failure has a 180-second limit.

128 MiB guest RAM by default, selectable 96–256 MiB before boot. Browser process
memory is substantially higher: WASM, 64 MiB in-memory disk, boot buffers,
rendering and snapshots add overhead. No invented host CPU/memory statistics.
Emulator allocation errors surface as failures. No SharedArrayBuffer, COOP/COEP,
worker CPU-emulator fork, or arbitrary Pages response headers are required.

The emulator currently runs on the main thread with v86's scheduling. Inference
runs in a separate Worker; it is optional and can be terminated to free memory.
No VM is automatically paused/background-snapshotted. Users explicitly pause and
sync; browser suspension can interrupt execution and leave unsynced guest caches.

## Durable storage

The root disk has a local custom v86 loadable-buffer adapter backed by IndexedDB
4096-byte blocks. For each write, changed blocks are staged in a single strict
transaction. The guest IDE write callback fires only on commit. A transaction
failure stops emulation without falsely acknowledging the write. Reads use the
in-memory committed disk. Startup overlays committed blocks on the original compressed seed retained with
the disk, so rebuilding app assets cannot change the underlying block layout.
Image ID mismatch refuses boot and preserves old records.

Guest ext4 journaling and periodic `sync` reduce abrupt-close loss; the browser
cannot persist data still in an editor buffer or guest page cache. An explicit
Pause & sync waits for guest sync, emulator stop and the pending write chain.
Web Locks provide exclusive disk ownership across tabs; absence fails safely.
Namespaces derive from app ID + deployment base + feature + data version.
Namespaces do not isolate another script on the same origin. No origin-wide erase.
OPFS is detected for diagnostics, not represented as a disk backend.

Manual snapshots contain v86 machine state plus a consistent copy of disk bytes.
They are distinct from the durable disk. Snapshot metadata includes runtime,
image ID, RAM, date, name, format, sizes. Restore requires exact compatibility.
A named snapshot remains paused after save/restore. Export/import validates the
container header and lengths. Snapshots are large and intentionally manual;
background lifecycle events cannot guarantee enough time to create them.

Disk and snapshots persist until explicit deletion or browser eviction. Model
files persist until Delete model/eviction. Preferences persist until site data is
removed. Terminal scrollback, completion history/drafts and AI exchanges stay in
memory (snapshots naturally include guest RAM). No automatic cloud backup.

## Host–guest protocol

COM1: terminal only. COM2: `AP1<TAB>id<TAB>status<TAB>payload<LF>` responses.
Requests are numeric ID, allowlisted operation, base64 absolute UTF-8 path,
base64 content/destination or validated numeric resize data. Guest scripts never
evaluate a request as code. LIST encodes filenames separately with stat metadata;
READ/WRITE transfer binary base64 up to 1 MiB. COMMANDS enumerates executable guest PATH entries using shell builtins.
MKDIR, RENAME, DELETE, SYNC and
RESIZE operate on the actual root filesystem. Every request has a timeout;
optional AbortSignal rejects host waiting. Cancellation does not undo a guest
operation already submitted. Guest stdout/control data are untrusted. Invalid
responses are rejected, never injected as HTML. The guest is root: this is not
an authenticated boundary against intentionally hostile guest code.

File search filters the current directory. The UTF-8 editor refuses invalid
UTF-8; row export supports binary files. Larger transfers and non-UTF-8 Linux
filenames remain terminal tasks; they are not silently truncated. File transfers
are bounded; huge directories may exceed protocol limits. One serial terminal,
no fictional independent session tabs. Resize updates ttyS0 via the helper.

## Completion and AI

BusyBox ash's real Tab completion and history remain available. Optional Compose
suggestions combine actual executable names, guest directory entries, common
flags and insertion history held in memory. Its directory is explicit because a
host cannot infer the interactive shell's cwd reliably; Tab uses real shell cwd.
Compose does not attempt to parse arbitrary shell quoting or edit an active vi
buffer safely on the user's behalf. Accepted drafts are inserted, never executed.

Model loading is an explicit action. Transformers.js uses an app-owned Cache API
cache for pinned public weights/configuration. ORT WASM/module files are served
locally and cached on demand. No API keys or inference URLs. After load, remote
model fetching is disabled; inference is computed in the worker. Only text in
the assistant input is used. A terminal selection requires explicit confirmation.
No automatic keystroke inference. Tasks include commands, explanations, error
analysis and script drafts. Model output stays editable and must be reviewed;
insertion strips newlines and never sends Enter. No autonomous execution.

SmolLM2 q4 download is approximately 185 MB, plus ~14 MB inference runtime;
400 MB storage headroom is suggested, with runtime memory potentially >700 MB.
WebGPU is diagnosed but not required by this provider. WASM fallback was tested
in desktop Chromium. Desktop verification does not establish mobile feasibility.

## PWA, Pages and networking

Vite base path drives manifest start/scope/ID, worker scope and every asset path.
Base-layer installation guidance, Workbox explicit precache, user-approved updates
and privacy/storage adapters are retained. Required VM assets are in the versioned
precache, AI weights are optional and separate. `.gzip.bin` prevents static hosts
from automatically decoding `.gz` bytes and breaking integrity checks. Unknown
routes/network resources are not cached or redirected to the shell.

Updates require the VM to be paused and AI unloaded. Disk namespaces never change
with an app update. Snapshot incompatibility is refused. A changed image ID needs
an explicit migration/backup workflow; there is no silent disk reset.

Guest networking is absent. Ordinary browser JavaScript cannot provide native raw
TCP/UDP. There is no tunnel, remote VM, WISP relay, analytics or login. Import
architecture-compatible APKs through Files and use `apk add --no-network` inside
Alpine with all dependencies provided. Signatures remain checked by apk; do not
recommend `--allow-untrusted`. Model/initial app downloads make normal HTTPS asset
requests; hosting/CDN providers can see those requests, never command text.
