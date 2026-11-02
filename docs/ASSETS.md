# Boot assets and corresponding sources

Frontend development requires Node 22.12+ and npm. Building the initial VM assets
also uses Python 3.12+, GNU tar/cpio, gzip, truncate, mke2fs and debugfs (e2fsprogs).
No Docker, root mount, qemu, compiler or runtime backend is needed. On Debian/Ubuntu
install `cpio e2fsprogs`; these tools run only during image construction.

```
npm ci
npm run assets
python3 scripts/build-alpine/sources.py
npm run sbom
npm run build
```

The build downloads checksum-pinned Alpine 3.23.7 x86 minirootfs and linux-virt
6.18.60-r0, builds a 64 MiB ext4 root, and generates an initramfs with the modules
needed for IDE/ext4 boot. Firmware is pinned by source commit and SHA-256. WASM
comes from the exact npm lockfile. `public/vm/assets.json` records every output
hash and input URL. Generated binaries and source bundles are excluded from Git.
`npm run assets` must run before a production build; CI does this explicitly.

The public image's hostname is the fixed non-personal `alpine-pocket`; ownership
is root:root. Guest helper scripts are original MIT project code. The serial
shell is root without a password; no network daemon is enabled. Ordinary ash,
vi, top, mount, df and apk are actual Alpine/BusyBox programs.

`public/vm/packages.json` records all installed Alpine package versions, licenses,
origins and packaging commits. The image retains its apk database. The source
collector fetches commit-pinned archives from Alpine’s GitHub mirror, with the
Alpine GitLab repository archive API and web archive service as fallbacks, and extracts each exact packaging
directory (APKBUILD, patches, configs),
then all checksum-listed sources from Alpine's source mirror and verifies SHA-512.
It also includes SeaBIOS rel-1.16.2 and the exact v86 source. It does not execute
APKBUILD. Missing/changed sources cause failure rather than omission.

Distributions must include these corresponding sources and notices alongside
binaries. The workflow generates a same-site `sources/index.html` and source
manifest with sizes/hashes; these files are static, optional downloads and excluded
from service-worker precaching. Do not remove them while distributing the related
binary version. For releases, archive the exact assets, source bundle, lockfile,
notices and build scripts together. If generated assets change, preserve backups
and evaluate snapshot/disk compatibility before changing the image ID.

Initial online requests fetch the application and mandatory boot assets. AI model
weights are never bundled; only optional ONNX runtime files are shipped and cached
on request. The model revision and license are displayed/documented separately.

## Offline package installation

There is no guest internet. On a connected machine obtain signed x86 APKs for
Alpine v3.23 plus every dependency, respecting their own redistribution terms.
Import files through Files (1 MiB per file currently), then run for example:

```
apk add --no-network /root/example.apk
```

Do not disable signature checks to bypass compatibility problems. Packages larger
than the current import cap need a future chunked transfer transport or an
intentionally rebuilt image. No curated extra package set is bundled yet.

Downloads use bounded retries for transient failures and atomic cache installation.
Packaging archives are validated before caching; HTTP access-policy failures try
the alternate upstream. Source checksums remain mandatory on both paths.

VM input caches are keyed by the pinned SHA-256. Downloads are validated before
atomic installation; incomplete or mismatched files never enter the cache. Alpine
removes older APKs from its rolling package directory, so a 404 requires a reviewed
pin update and matching corresponding sources, never an unverified latest fallback.
Kernel package versions, licenses and source commits are read from the verified
APK control metadata rather than maintained separately in the image builder.
The 6.18.60 kernel update keeps the existing disk schema and app/storage IDs.
Existing saved disks are retained; no snapshot compatibility across kernel updates
is promised. Export important guest files before restoring older machine snapshots.
