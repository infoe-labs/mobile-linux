# Security and privacy

Commands execute in a real Linux guest with a root shell. Browser isolation is
not a security assessment of v86. Do not treat this as a proven hostile-code
sandbox. A malicious guest can forge helper responses and can modify its disk.
The bridge is a correctness boundary between trusted application code and
untrusted guest data, not an authentication mechanism against guest root.

No analytics, accounts, command logging, remote shell, guest network tunnel or
cloud inference. App downloads contact the static host; explicit model downloads
contact Hugging Face/CDNs. Prompts and terminal output are not sent to servers.
The optional assistant consumes only its input and explicitly approved selections.
Model output is untrusted and never automatically executed.

React escapes guest names/content. No raw guest HTML, eval, command interpolation,
or shell-source execution of filenames. COM2 requests use base64 data and an
allowlist. Terminal escape sequences are interpreted by xterm, whose security
updates must be maintained. Imported snapshots/disks are untrusted emulator inputs;
only import backups you trust. Format validation is not malware screening.

Disk, models, snapshots and preferences are unencrypted browser storage. Other
apps/scripts on the same origin can access them despite namespace separation.
Use a dedicated origin for stronger isolation. Exported snapshots contain guest
RAM (possibly secrets) and complete disk data. Treat exports accordingly.

Data is retained until explicit deletion or browser eviction. No telemetry or
automatic terminal-history storage in the host. Browser disk storage cannot make
promises against eviction or hardware loss. Keep external backups. The app only
clears its own namespace; it does not erase other same-origin applications.

Report issues privately through repository security advisories where available.
Do not post terminal contents, real credentials, personal machine paths or raw
user data in public issues or CI artifacts. Use synthetic reproductions.
