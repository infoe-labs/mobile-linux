/** Collision-resistant identifiers; these are ownership boundaries, not security boundaries. */
export function storageScope({ appId, basePath, namespace, version = 1 }) {
  for (const part of [appId, basePath, namespace]) {
    if (typeof part !== 'string' || !part.trim())
      throw new TypeError('Storage scope requires nonempty strings.');
  }
  if (!basePath.startsWith('/') || !basePath.endsWith('/'))
    throw new TypeError('Invalid storage base path.');
  if (!Number.isSafeInteger(version) || version < 1) throw new TypeError('Invalid data version.');
  return `pwa:${encodeURIComponent(JSON.stringify([appId, basePath, namespace, version]))}:`;
}

function record(value, ttlMs) {
  // Require an intentional retention policy on every write. null means until deletion.
  if (ttlMs !== null && (!Number.isFinite(ttlMs) || ttlMs <= 0)) {
    throw new TypeError('Choose a positive ttlMs or explicit null retention.');
  }
  return { value, expiresAt: ttlMs === null ? null : Date.now() + ttlMs };
}
function keyName(key) {
  if (typeof key !== 'string' || !key.length)
    throw new TypeError('Storage keys must be nonempty strings.');
  return key;
}
const expired = (entry) => entry.expiresAt !== null && entry.expiresAt <= Date.now();

/** Small JSON preferences only. Errors (including quota/denied access) propagate to the caller. */
export function createLocalStore(scope, storage = globalThis.localStorage) {
  const prefix = storageScope(scope);
  const keys = () =>
    Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key) =>
      key?.startsWith(prefix),
    );
  return {
    prefix,
    set(key, value, { ttlMs } = {}) {
      const entry = record(value, ttlMs);
      const serialized = JSON.stringify(entry);
      if (!Object.hasOwn(JSON.parse(serialized), 'value'))
        throw new TypeError('Value must be JSON serializable.');
      storage.setItem(prefix + keyName(key), serialized);
    },
    get(key) {
      const fullKey = prefix + keyName(key);
      const raw = storage.getItem(fullKey);
      if (raw === null) return undefined;
      const entry = JSON.parse(raw);
      if (expired(entry)) {
        storage.removeItem(fullKey);
        return undefined;
      }
      return entry.value;
    },
    remove(key) {
      storage.removeItem(prefix + keyName(key));
    },
    clear() {
      for (const key of keys()) storage.removeItem(key);
    },
    prune() {
      for (const key of keys()) {
        const entry = JSON.parse(storage.getItem(key));
        if (expired(entry)) storage.removeItem(key);
      }
    },
  };
}

/** Async structured-clone storage. Resolves writes only after the transaction commits. */
export function createIndexedStore(scope, factory = globalThis.indexedDB) {
  const name = storageScope(scope) + 'records';
  async function open() {
    if (!factory) throw new Error('IndexedDB unavailable.');
    return new Promise((resolve, reject) => {
      let blocked = false;
      const request = factory.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('records');
      request.onerror = () => reject(new Error('Unable to open local storage.'));
      request.onblocked = () => {
        blocked = true;
        reject(new Error('Local storage upgrade blocked; close other tabs.'));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) {
          db.close();
          return;
        }
        db.onversionchange = () => db.close();
        resolve(db);
      };
    });
  }
  async function transact(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', mode);
      let result;
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onabort = () => {
        db.close();
        reject(new Error('Local storage transaction failed.'));
      };
      tx.onerror = () => {}; // onabort is the final outcome
      try {
        operation(tx.objectStore('records'), (value) => {
          result = value;
        });
      } catch (error) {
        tx.abort();
        db.close();
        reject(error);
      }
    });
  }
  return {
    name,
    set(key, value, { ttlMs } = {}) {
      const id = keyName(key);
      const entry = record(value, ttlMs);
      return transact('readwrite', (store) => store.put(entry, id));
    },
    get(key) {
      const id = keyName(key);
      return transact('readwrite', (store, done) => {
        const request = store.get(id);
        request.onsuccess = () => {
          const entry = request.result;
          if (!entry) return;
          if (expired(entry)) store.delete(id);
          else done(entry.value);
        };
      });
    },
    remove(key) {
      const id = keyName(key);
      return transact('readwrite', (store) => store.delete(id));
    },
    clear() {
      return transact('readwrite', (store) => store.clear());
    },
    prune() {
      return transact('readwrite', (store) => {
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          if (expired(cursor.value)) cursor.delete();
          cursor.continue();
        };
      });
    },
  };
}

export async function storageEstimate() {
  return globalThis.navigator?.storage?.estimate?.() ?? null;
}

/** Call only after an explicit user gesture; persistence is browser-controlled and origin-wide. */
export async function requestPersistence() {
  return globalThis.navigator?.storage?.persist?.() ?? false;
}
