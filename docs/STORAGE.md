# Storage contract

All identifiers encode a tuple of **app ID, deployment base path, feature
namespace, data version**. JSON tuple encoding avoids delimiter collisions.
localStorage keys use that tuple as an exact prefix. Each IndexedDB store uses
its own database name derived from the tuple and a single `records` object store.
The service-worker shell cache has a separate `shell` namespace and uses the
registration scope path. Keep the app ID stable after launch.

```js
import { createIndexedStore, createLocalStore } from '@/lib/storage';
import { appConfig } from '../../app.config';

const scope = {
  appId: appConfig.appId,
  basePath: import.meta.env.BASE_URL,
  namespace: 'drafts',
  version: 1,
};
const drafts = createIndexedStore(scope);
await drafts.set('current', { text: 'Example' }, { ttlMs: 86_400_000 });
const draft = await drafts.get('current'); // undefined if absent or expired
await drafts.remove('current');
await drafts.prune(); // delete expired records in this scope
await drafts.clear(); // delete all records in this scope only

const preferences = createLocalStore({ ...scope, namespace: 'preferences' });
preferences.set('contrast', 'high', { ttlMs: null }); // explicitly retained until deletion
preferences.get('contrast');
preferences.clear();
```

IndexedDB is the default for app data, supports structured clones, and is
asynchronous. Writes resolve only after transaction completion. localStorage is
synchronous, JSON-only, and intended for small non-sensitive preferences. No
automatic fallback changes your retention or consistency contract. Handle thrown
errors/rejected promises: denied access, private browsing, storage pressure,
transaction aborts, and quota failures are possible. Keep unsaved input in memory
and give generic feedback; do not log payloads or raw exceptions.

Each write requires a positive `ttlMs`, or explicit `null` for retention until
deletion. Expiry is enforced on reads and by `prune()`. Call prune on startup and
periodically while active. Closed apps have no scheduled cleanup guarantee.
A record read into UI memory is not automatically withdrawn when its disk TTL
expires. Features needing a visible deadline must also expire their UI state.
The demo limits input to 10,000 characters and checks cleanup every minute.

Storage is not encrypted. Namespaces do not isolate scripts or other apps on the
same origin, prevent XSS, or separate browser quotas. Use separate origins for
security boundaries. Service workers have path scopes, but localStorage,
IndexedDB, Cache Storage, persistence permissions, and eviction are origin-wide.
Never call `localStorage.clear()`, sweep all databases/caches, unregister all
service workers, or request `Clear-Site-Data` as feature-level deletion.

`storageEstimate()` returns origin-wide usage/quota information when supported.
`requestPersistence()` must be wired to an explicit user action if needed; the
browser may deny it. Persistence is not backup. Eviction, user site-data deletion,
private-mode exit, or changing origin can erase data. Do not promise durability.
There is no automatic cloud backup, sync, or conflict resolution.

Data version is separate from app releases and IndexedDB's internal schema
version (currently 1). Bumping it deliberately creates a new storage namespace;
it does not migrate or delete old records. For breaking data changes, document
old scope → new scope mapping, validate/transact conversion, handle failure, and
delete the old scope only after successful migration. Include every historical
scope in a product-wide erase flow. The base offers feature-level clear only.
Changing app ID or base path likewise leaves old data behind: plan migration or
retirement before changing either on an existing deployment.

Workbox owns revision cleanup within this app's precache. Do not add global cache
cleanup. New runtime caching requires a separate feature namespace, explicit
allowlist, expiration, size bound, and scoped deletion. Do not cache authenticated
or personalized responses. Add outbox/sync only with an explicit product design
for replay, authentication, retention, duplicates, and conflicts.

## Alpine Pocket data scopes

The product replaces the demo with `disk`, `snapshots`, `model`, and `preferences`
namespaces (data version 1). All persist until explicit deletion/eviction; user
files have no automatic expiry. Disk reset clears only disk records. Individual
snapshots can be deleted. Delete model clears only the app/base-scoped model
cache, including its inference runtime. No terminal or prompt logging is added.
Inference runtime URLs include the exact locked ONNX version so app upgrades do
not reuse incompatible compiled binaries. Model weight revisions are pinned.
