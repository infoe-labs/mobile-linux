import { setCacheNameDetails } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';
import { appConfig } from '../app.config.js';
import { storageScope } from './lib/storage.js';

// Scope path is part of cache ownership. Never remove caches by a generic prefix.
setCacheNameDetails({
  prefix: storageScope({
    appId: appConfig.appId,
    basePath: new URL(self.registration.scope).pathname,
    namespace: 'shell',
    version: 1,
  }),
  suffix: 'shell',
});
self.__WB_DISABLE_DEV_LOGS = true;
// Exact build assets only: no API, navigation fallback, runtime cache, or third-party cache.
precacheAndRoute(self.__WB_MANIFEST, {
  cleanURLs: false,
  directoryIndex: 'index.html',
  ignoreURLParametersMatching: [],
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
// Take control on first install and after an explicitly accepted update.
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Only these bundled inference runtime files are cached on demand. Model weights
// use the same app-owned cache via Transformers.js's custom cache adapter.
const aiCache = storageScope({
  appId: appConfig.appId,
  basePath: new URL(self.registration.scope).pathname,
  namespace: 'model',
  version: 1,
});
const runtimes = ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'].map(
  (name) => new URL('ai/' + appConfig.inferenceRuntime + '/' + name, self.registration.scope).href,
);
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !runtimes.includes(event.request.url)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(aiCache);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    })(),
  );
});
