import { storageScope } from '../storage.js';
import { appConfig } from '../../../app.config.js';
const name = storageScope({
  appId: appConfig.appId,
  basePath: import.meta.env.BASE_URL,
  namespace: 'packages',
  version: 1,
});
const ttl = 30 * 24 * 60 * 60 * 1000;
const assetPath = (path: string) => (path.endsWith('.gz') ? path + '.bin' : path);
export async function packageResource(path: string): Promise<Response> {
  const url = new URL(import.meta.env.BASE_URL + 'packages/' + assetPath(path), location.origin)
    .href;
  // Online metadata must match the currently deployed bundle, not an older offline snapshot.
  if (path === 'catalog.json' || path.endsWith('APKINDEX.tar.gz')) {
    try {
      const current = await fetch(url, { credentials: 'omit', cache: 'no-store' });
      if (current.ok) return current;
    } catch {
      /* Use the explicitly downloaded snapshot while offline. */
    }
  }
  try {
    const cache = await caches.open(name);
    const hit = await cache.match(url);
    if (hit) {
      if (Number(hit.headers.get('x-pocket-expires')) > Date.now()) return hit;
      await cache.delete(url);
    }
  } catch {
    /* Optional offline caching must not block online installation. */
  }
  return fetch(url, { credentials: 'omit', cache: 'no-store' });
}
export async function cachePackages(progress: (text: string) => void) {
  const base = import.meta.env.BASE_URL + 'packages/';
  const response = await fetch(base + 'catalog.json', { credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw new Error('Package catalog unavailable.');
  const data = await response.json();
  if (
    !Array.isArray(data.files) ||
    data.files.length > 200 ||
    !Number.isSafeInteger(data.bytes) ||
    data.bytes < 1 ||
    data.bytes > 200 * 1048576
  )
    throw new Error('Package bundle exceeds the offline limit.');
  await caches.delete(name);
  const cache = await caches.open(name);
  try {
    for (const file of data.files) {
      if (!/^(main|community)\/x86\/[a-zA-Z0-9+_.-]+$/.test(file.path)) throw new Error();
      progress(`Caching ${file.path.split('/').at(-1)} (${(file.bytes / 1048576).toFixed(1)} MiB)`);
      const result = await fetch(base + assetPath(file.path), {
        credentials: 'omit',
        cache: 'no-store',
      });
      if (!result.ok) throw new Error();
      if (
        !Number.isSafeInteger(file.bytes) ||
        file.bytes < 1 ||
        file.bytes > 128 * 1048576 ||
        !result.body
      )
        throw new Error();
      const bytes = new Uint8Array(file.bytes);
      const reader = result.body.getReader();
      let offset = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (offset + value.length > bytes.length) {
          await reader.cancel();
          throw new Error();
        }
        bytes.set(value, offset);
        offset += value.length;
      }
      if (offset !== file.bytes) throw new Error();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (n) =>
        n.toString(16).padStart(2, '0'),
      ).join('');
      if (bytes.byteLength !== file.bytes || hash !== file.sha256) throw new Error();
      await cache.put(
        base + assetPath(file.path),
        new Response(bytes, { headers: { 'x-pocket-expires': String(Date.now() + ttl) } }),
      );
    }
    await cache.put(
      base + 'catalog.json',
      new Response(JSON.stringify(data), {
        headers: { 'x-pocket-expires': String(Date.now() + ttl) },
      }),
    );
    progress('Package bundle available offline for 30 days, subject to browser eviction.');
  } catch {
    throw new Error(
      'Offline download failed or storage is full. Delete the partial package cache and retry.',
    );
  }
}
export async function deletePackageCache() {
  await caches.delete(name);
}
export async function prunePackageCache() {
  if (!(await caches.has(name))) return;
  const cache = await caches.open(name);
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (Number(response?.headers.get('x-pocket-expires')) <= Date.now())
      await cache.delete(request);
  }
}
