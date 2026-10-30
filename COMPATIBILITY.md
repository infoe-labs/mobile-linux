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
raw TCP/UDP, guest internet, automatic APK download, background execution guarantee,
or OPFS disk is claimed. Terminal copy/paste depends on clipboard permissions;
OS selection and native paste remain fallbacks.

AI works without WebGPU but needs much more memory than the guest RAM setting.
Desktop offline inference passed; smaller phones may fail allocation. Unload AI
before snapshots/updates; use Linux without AI when memory is scarce.
