# SSH through your own bridge

Type `ssh tester@ssh.example.com` in Alpine. A connection approval panel asks for
`wss://ssh.example.com:8443/` and a bridge access token. No connection is opened
until Allow connection is pressed. This is application consent, not a browser
raw-socket permission. There is no MITM or host-key bypass.

The target machine needs the included Node bridge and an existing SSH server.
There is no hosted relay provided by this project. The phone must be able to reach
the bridge through your own network/VPN/firewall configuration. A PWA cannot reach
an inaccessible machine or bypass NAT just by pressing Connect.

## Run the bridge on the target

Install Node 22.12+ and run `npm ci --ignore-scripts` in `scripts/ssh-bridge`.
Provision a TLS certificate trusted by the phone for the bridge hostname. An
untrusted self-signed certificate will not work in the PWA; there is no certificate
bypass. Keep certificates, private keys, tokens, and deployment settings outside
tracked files. Generate a token with `openssl rand -hex 32` into a private file.
Configure these environment variables in your service manager:

| Variable | Meaning |
| --- | --- |
| `BRIDGE_CERT_FILE` | Local TLS certificate chain file |
| `BRIDGE_KEY_FILE` | Local TLS private key file |
| `BRIDGE_TOKEN_FILE` | Local file containing a random access token, at least 32 characters |
| `BRIDGE_ORIGIN` | Exact PWA origin, e.g. `https://infoe-labs.github.io` (no path or trailing slash) |
| `BRIDGE_SSH_HOST` | Exact hostname supplied to the guest `ssh` command |
| `BRIDGE_SSH_PORT` | SSH target port, default 22 |
| `BRIDGE_TCP_HOST` | Fixed TCP destination, default loopback; never taken from browser input |
| `BRIDGE_BIND` | Listener interface; defaults to loopback, set explicitly for phone access |
| `BRIDGE_PORT` | TLS listener port, default 8443 |

Run `npm start` in that directory. Use a dedicated app origin when possible:
origin checks cannot distinguish other apps hosted under the same origin.
Restrict network access to the bridge to intended clients. The access token grants
access to this fixed SSH endpoint; normal SSH authentication is still required.
The bridge caps simultaneous connections, frame sizes, buffers, authentication
wait, inactivity, and session lifetime. It is a small reference service, not an
audited Internet-facing access gateway. Review its deployment before exposure.

## Client behavior

The bundled client is Dropbear dbclient, not OpenSSH. Supported wrapper syntax:

```sh
ssh [-p port] [-l user] [-i key] [-t|-T] [user@]host [command...]
```

Default user is `root`. IPv6 literals use no brackets. OpenSSH configuration,
ProxyJump, agent forwarding, and port forwarding are not exposed by this wrapper.
Private keys must be in a format supported by dbclient. Normal unknown-host
fingerprint confirmation and changed-host rejection remain enabled. Verify the
fingerprint using an independent trusted source before accepting it.

One SSH connection can use COM3 at a time. Scripts invoking this `ssh` wrapper
also request approval; terminal text is not parsed to detect commands. Ctrl-C,
Cancel SSH, Disconnect SSH, page exit, or pausing Alpine closes the transport.
No automatic reconnection or retry replays credentials or commands. Backgrounding
or locking a phone can suspend the app; use a remote session manager if desired.
Physical iOS and Android installation and networking tests are still required.

## Data flow and retention

Dropbear in Alpine performs SSH encryption, authentication, and host-key checking.
A framed serial transport carries its encrypted byte stream to the browser, which
forwards it over WSS. The bridge forwards bytes to its fixed TCP destination.
The bridge learns connection metadata and the SSH protocol's public handshake;
it does not terminate SSH encryption or receive decrypted passwords/commands.
Bridge authentication uses a separate access token inside the TLS connection.

The browser keeps bridge URL/token in memory for the current attempt; the token
field is cleared after connecting. No bridge settings, payloads or tokens are
written to browser storage, service-worker caches, analytics, or application logs.
The bridge logs only generic startup/failure messages and has no session storage.
Any infrastructure/access logging you add is outside these defaults. Strings in
managed memory cannot be guaranteed securely erased.

Alpine remains a persistent, unencrypted Linux disk: shell history, known_hosts,
keys and files saved there may persist in disk backups and RAM snapshots. Pausing
disconnects SSH before snapshots, but does not scrub guest memory or terminal
scrollback. Delete guest files and historical backups/snapshots deliberately.

## Existing disks and updates

Cold boot installs only an app-owned ephemeral payload under `/opt/pocket-ssh`
from the checksum-verified initramfs. Its files live on a small tmpfs and disappear
when the VM is destroyed. A symlink is added at `/usr/local/bin/ssh` only if absent;
existing user commands and SSH keys/configuration are preserved. SSH preserves the stored disk seed and storage schema. The package feature
extends existing disks separately; see [disk migration](PACKAGES.md#disk-migration-and-limits). Old RAM snapshots predate the new UART and payload;
their restore is rejected without deletion. Cold boot from disk instead. To recover
unsaved RAM-only work, use a compatible older app build with the exported snapshot.

The transport uses bounded, acknowledged 768-byte serial frames. It is intended
for interactive use and modest command output, not high-throughput file transfer.
A stalled/over-capacity transport disconnects rather than retaining unlimited data.

## Validate from a phone on your LAN

Use Node 22.12+, install dependencies with `npm ci`, and build guest assets with
`npm run assets`. For development, run:

```sh
DEV_HTTPS_CERT=.secrets/dev-cert.pem DEV_HTTPS_KEY=.secrets/dev-key.pem npm run dev -- --host 0.0.0.0
```

Provision these ignored local files yourself: the certificate must include the
computer's LAN IP in its subject alternative names, and the phone must trust its
issuing CA. Open the HTTPS URL using that IP and the port Vite prints. Plain HTTP
on a LAN IP is not a secure context and cannot run the required browser APIs.
The variables configure only the development server; no key enters the client
bundle. Set the bridge's exact `BRIDGE_ORIGIN` to this HTTPS origin, including the
port. Give the bridge its own trusted TLS configuration and set `BRIDGE_BIND` to
`0.0.0.0` if the phone must reach it over the LAN.
