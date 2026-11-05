# Compatibility

Verified here: desktop headless Chromium and WebKit, real v86 boot, guest commands, IndexedDB
disk restart, shared file edits, snapshot save/restore, offline cold boot, narrow
viewport layout, manifest subpath paths, and optional offline WASM model inference.
No physical phone or installed PWA was available for verification.

| Platform | Expected path | Verification |
| --- | --- | --- |
| Current Chrome desktop | WASM VM, IndexedDB, PWA, optional AI | Automated Chromium passed |
| Current Safari desktop | Same single-thread architecture | Automated Linux WebKit passed; native Safari pending |
| iPhone Safari / Home Screen | Web Locks, IndexedDB, WASM; keyboard viewport handling | Physical device required |
| Android Chrome / installed | Same baseline; install prompt where offered | Physical device required |
| Low-memory devices | Start at 96 MB RAM, keep AI unloaded | Physical device required |

Secure context, WebAssembly, IndexedDB, Web Locks, TextEncoder/Decoder and
DecompressionStream(gzip) are required. There is no SharedArrayBuffer or WebGPU
requirement. Unsupported storage ownership APIs produce a visible boot error.
Private mode, eviction, origin changes and user site-data deletion can lose data.

The keyboard uses xterm's input textarea, Visual Viewport height, safe areas,
scrollable accessory keys and sticky Ctrl/Alt/Shift. Actual iOS keyboard selection,
IME, rotation, installed viewport and hardware-key behavior remain release tests.
Unicode filenames work through UTF-8; invalid UTF-8 text is not edited by Files.
The guest locale and BusyBox limit Unicode editing independently of xterm.

One real serial shell is supported. No independent PTYs, GUI desktop, browser
raw TCP/UDP, general guest internet, unrestricted APK downloads, background execution guarantee,
or OPFS disk is claimed. Terminal copy/paste depends on clipboard permissions;
OS selection and native paste remain fallbacks.

AI works without WebGPU but needs much more memory than the guest RAM setting.
Desktop offline inference passed; smaller phones may fail allocation. Unload AI
before snapshots/updates; use Linux without AI when memory is scarce.

Optional SSH uses standard secure WebSockets to a user-operated bridge, not
Direct Sockets. Automated tests exercise the guest SSH protocol, interactive
shell, host-key verification and cancellation in Chromium/WebKit using a routed
WebSocket endpoint; separate Node tests exercise the actual TLS bridge. Physical
phone networking, certificates, background suspension and installed PWA behavior
remain manual checks. See [SSH setup](docs/SSH.md).

Package support uses the bundled signed repository subset over same-origin fetch.
Go installation and Hello World compilation passed in desktop Chromium (about
5.4 minutes for the initial test, including installation). This is x86 emulation,
not native phone compilation. Select 512 MB guest RAM for Go; total browser memory
can exceed 1 GiB. Physical phone memory limits and installed-PWA behavior remain
unverified. See [package limitations and verification](docs/PACKAGES.md).
