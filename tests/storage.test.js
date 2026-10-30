import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createIndexedStore, createLocalStore, storageScope } from '../src/lib/storage.js';
import { normalizeBase } from '../app.config.js';

class MemoryStorage {
  data = new Map();
  get length() {
    return this.data.size;
  }
  key(index) {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key) {
    return this.data.get(key) ?? null;
  }
  setItem(key, value) {
    this.data.set(key, value);
  }
  removeItem(key) {
    this.data.delete(key);
  }
}
const base = { appId: 'test-app', basePath: '/test/', namespace: 'notes', version: 1 };
const variants = [
  base,
  { ...base, appId: 'other' },
  { ...base, basePath: '/other/' },
  { ...base, namespace: 'notes:other' },
  { ...base, version: 2 },
];

for (const backend of ['local', 'indexed']) {
  test(`${backend}: isolation, scoped deletion, explicit retention, expiry and cleanup`, async () => {
    const memory = new MemoryStorage();
    const factory = new IDBFactory();
    const stores = variants.map((scope) =>
      backend === 'local' ? createLocalStore(scope, memory) : createIndexedStore(scope, factory),
    );
    for (let i = 0; i < stores.length; i++)
      await stores[i].set('same:key', { owner: i }, { ttlMs: null });
    for (let i = 0; i < stores.length; i++)
      assert.deepEqual(await stores[i].get('same:key'), { owner: i });
    await stores[0].clear();
    assert.equal(await stores[0].get('same:key'), undefined);
    for (let i = 1; i < stores.length; i++)
      assert.deepEqual(await stores[i].get('same:key'), { owner: i });
    await assert.rejects(async () => stores[0].set('missing-policy', 'x'), /ttlMs/);
    await assert.rejects(async () => stores[0].set('invalid-policy', 'x', { ttlMs: -1 }), /ttlMs/);
    const now = Date.now;
    try {
      Date.now = () => 100;
      await stores[0].set('expired', 'x', { ttlMs: 10 });
      await stores[0].set('cleanup', 'x', { ttlMs: 10 });
      await stores[0].set('retained', 'y', { ttlMs: null });
      Date.now = () => 111;
      assert.equal(await stores[0].get('expired'), undefined);
      await stores[0].prune();
      assert.equal(await stores[0].get('cleanup'), undefined);
      assert.equal(await stores[0].get('retained'), 'y');
      await stores[0].remove('retained');
      assert.equal(await stores[0].get('retained'), undefined);
    } finally {
      Date.now = now;
    }
  });
}
test('tuple encoding avoids delimiter ambiguity and scope validation rejects invalid values', () => {
  assert.notEqual(
    storageScope({ ...base, appId: 'a:b', namespace: 'c' }),
    storageScope({ ...base, appId: 'a', namespace: 'b:c' }),
  );
  assert.throws(() => storageScope({ ...base, version: 0 }));
  assert.throws(() => storageScope({ ...base, namespace: '' }));
  assert.throws(() => normalizeBase('/no-trailing-slash'));
  assert.equal(normalizeBase('/repo/'), '/repo/');
});
test('IndexedDB supports structured clones and reports unavailable storage', async () => {
  const store = createIndexedStore(base, new IDBFactory());
  await store.set('date', new Date(100), { ttlMs: null });
  assert.equal((await store.get('date')).getTime(), 100);
  await assert.rejects(createIndexedStore(base, null).get('x'), /unavailable/);
});
test('local storage failures are surfaced and never silently downgraded', () => {
  const store = createLocalStore(base, {
    setItem() {
      throw new Error('QuotaExceeded');
    },
  });
  assert.throws(() => store.set('x', 'y', { ttlMs: null }), /QuotaExceeded/);
});
