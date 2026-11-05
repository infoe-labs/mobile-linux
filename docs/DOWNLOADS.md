# Browser-assisted file downloads

Updated cold boots provide `browser-fetch https://host/file`. Connection failures
from the app-provided curl/wget wrappers and failed HTTPS `git clone` attempts
open the same approval dialog. Existing user-managed commands are preserved.
This is command integration, not observation of arbitrary encrypted TCP traffic.
Programs using their own network libraries do not automatically trigger it.

The original command exits with its actual failure status. Approve **Fetch and
import into Alpine** to try browser fetch with credentials omitted, no HTTP cache,
no redirects and a 60-second timeout. CORS restrictions still apply. On failure,
use **Download in browser**, then select the saved file. A GitHub repository root
is offered as an archive of HEAD: files only, without history or submodules.
Inspect files and extract/install/use them explicitly inside Alpine. No downloaded
file or script is automatically executed, and the failed command is not replayed.

Transfers use bounded chunks with 128 MiB per file and 256 MiB per selection.
File names are sanitized and prefixed with a random identifier. Imported files
persist under `/root/Downloads`, including in backups, until removed by the user.
Handled failures remove partial transfers; abrupt termination may leave `.part`
files there. Device Downloads have separate device-managed retention/deletion.

Request URLs are held in host memory until the dialog closes and are not logged
or cached by this feature. Command URLs can still remain in guest shell history,
RAM snapshots and disk backups. A user-approved request discloses its URL and
normal network metadata to its destination. Browser-managed downloads may use
that site's existing browser login state. Fetch does not forward guest headers,
cookies or credentials. Private repositories and authenticated download flows
may require the separate manual browser download/import path.

This runs on a static host without a relay. It does not grant the guest sockets,
make `git clone` succeed, or provide transparent networking to every application.
Cold boot after updating so the new guest wrappers and helper are installed.
