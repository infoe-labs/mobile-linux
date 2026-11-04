# Browser-only Alpine packages

The app runs Alpine 3.23.7 **x86/i686** on v86 0.5.472 with kernel 6.18.60-0-virt.
Initially it had no configured NIC, retained network driver, route or network
backend. Changing resolv.conf alone could not fix it. IndexedDB stores ext4 block
changes, with the original compressed disk seed retained across app upgrades.

The new VirtIO NIC uses v86's built-in fetch backend. Kernel drivers, static
addressing, a route and v86's synthetic DNS are configured on cold boot. Synthetic
DNS answers do not establish real internet connectivity. This backend accepts
guest HTTP on port 80; it cannot carry guest TLS or arbitrary TCP. WISP and
WebSocket network relays were evaluated and excluded for package management.
Service Workers and WASM do not grant raw sockets.

## Supported workflow

Select 512 MB guest RAM before booting to compile Go, then use real shell commands:

```sh
apk update
apk add go
go version
cat > /tmp/hello.go <<'GO'
package main
import "fmt"
func main() { fmt.Println("Hello from Alpine Go!") }
GO
go run /tmp/hello.go
apk add curl git
```

There is no fake apk wrapper. The original Alpine package manager resolves
packages from unchanged, signed Alpine indexes, downloads APKs, verifies Alpine
signatures against the guest's distribution keys, and installs into ext4. The
browser additionally checks each artifact against its build SHA-256 pin.
Never use `--allow-untrusted` or disable verification to make an installation work.

The shipped repository snapshot includes **go, curl, git and their dependencies**.
Indexes list other upstream packages, but archives outside the bundle return an
explicit unavailable response. This is a static subset, not unrestricted access
to Alpine repositories. Installed curl/git do not gain general networking; Go
module downloads are also unavailable. Local compilation uses real guest binaries.

## Why bundle repositories?

Direct GET requests for v3.23 main/community x86 indexes on the Alpine CDN and
several official dl-* mirrors returned no Access-Control-Allow-Origin for the
GitHub Pages origin. A normal browser opened on the production origin could not
read either CDN index. No upstream configuration changes or CORS bypass are used.

At build time, genuine Alpine APK dependency resolution selects the supported
closure. Original signed indexes are committed as static binary assets; a lock
pins archive URLs, sizes and hashes. CI downloads these public archives into the
Pages build. At runtime an allowlisted adapter maps only
`http://packages.pocket.invalid/{main,community}/x86/...` to this app's own
`packages/` assets. The outer request uses the page's HTTPS origin and deployment
base. No server process, remote proxy, gateway, DNS service or third-party relay
participates. The independent optional SSH bridge is not used by this feature.

Index assets have a `.bin` suffix on the host to prevent automatic gzip decoding
by static servers. The guest receives the original bytes and normal filenames.
Upstream HTTPS wget remains unsupported; failure there is expected even when apk
works. Only public repository filenames are accepted; guest URLs and errors are
not logged.

## Downloads, offline use and retention

The package bundle is about 122 MiB compressed and 343 MiB fully installed. It is
excluded from the service-worker precache. The Packages panel reports downloads
and offers an explicit offline bundle download. Each offline download replaces the previous bundle cache to bound its size.
Cached snapshots remain fixed until replaced or expired; replace the cache after
an app update to obtain its newer package snapshot. Download caches use the app ID,
base path, feature `packages`, version 1, and a 30-day expiry. Expired entries are
removed on access, startup, and hourly while the app is open. Closed apps cannot
schedule cleanup. Delete package download cache removes only that scope.
Partial failed caches can be deleted with the same button. Browser eviction can
remove them sooner. Normal online installs do not retain archive response bodies
in this app's cache. Installed files remain on the guest disk until removed by
`apk del`, disk reset, or browser eviction; historical backups retain their copies.

A cached bundle allows offline `apk update` and supported installation. After
installation, running installed packages needs no archive cache. The browser never
executes downloaded APKs in the host context: they are data supplied to guest apk.

## Disk migration and limits

New disks are 512 MiB. Existing 64 MiB seeds are preserved and extended with zeros;
existing block offsets are unchanged. The guest mounts/replays its ext4 journal,
then grows the filesystem with resize2fs. Storage namespace/version and image ID
remain unchanged. The original stored seed plus block changes remains the source
of truth. A failed expansion opens a recovery shell rather than replacing files.
Export a disk backup before upgrading important workspaces. Old disk exports can
be restored and expanded; RAM snapshots with the previous virtual hardware are
preserved but rejected for restore. Cold boot from disk instead.

Go compilation can be slow in emulation. Guest RAM plus disk and temporary browser
buffers can exceed 1 GiB. Small phones may not have enough memory or storage;
allocation/quota failures are reported where the browser permits recovery, but an
OS-killed tab cannot report an error. Snapshots include the larger disk and can be
particularly expensive. Physical Android/iOS installation tests remain required.

## Maintain the static snapshot

On Linux with x86 ELF execution support, explicitly run:

```sh
python3 scripts/packages/refresh.py go curl git
npm run assets
python3 scripts/build-alpine/sources.py
npm run sbom
```

Review signed index changes, package versions, dependency closure and lock hashes.
The updater uses pinned Alpine tools/keys and verifies archive signatures. Ordinary
CI only downloads the locked artifacts and checks hashes; it never refreshes the
snapshot. If upstream removes a pinned archive, the build fails and a reviewed
snapshot update is needed. Corresponding sources/notices include the distributed
package bundle. No credentials or machine-specific configuration belong in assets.

## Diagnostics

These commands remain useful and safe to run in the guest:

```sh
uname -a
uname -m
cat /etc/alpine-release
ip addr
ip route
cat /etc/resolv.conf
nslookup dl-cdn.alpinelinux.org
timeout 5 wget -S https://dl-cdn.alpinelinux.org/
apk update
```

Expect i686, an active VirtIO interface and synthetic DNS after this change.
Expect direct guest HTTPS to fail. Successful apk uses the separate restricted
HTTP-to-same-origin-fetch path described above.

Go uses a separate 128 MiB tmpfs for temporary compilation files, removed when
the VM is destroyed. The profile defaults GOMAXPROCS to 1 and GOFLAGS to -p=1
for the single emulated CPU. Go build caches remain inside the persistent guest
disk; use `go clean -cache` to delete them. RAM snapshots can retain temporary
files and process memory.

Validation commands: `npm test`, `npm run build`, `npm run test:e2e`, and
`RUN_PACKAGES=1 npm run test:e2e -- --grep "Go installs" --project chromium`.
The explicit Go compilation test can take many minutes under CPU emulation.
Repeat the build and browser checks with `BASE_PATH=/test-subpath/` before
publishing. Browser emulation is not a real phone installation test.
