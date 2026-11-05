import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import { gzipSync } from 'node:zlib';
import { canTransition } from '../src/vm/state.ts';
import { encode, decode, parseEntries, requestLine } from '../src/vm/protocol.ts';
import { PersistentDisk } from '../src/storage/PersistentDisk.ts';
test('boot state requires guest readiness and rejects impossible transitions', () => {
  assert(canTransition('preparing', 'booting'));
  assert(canTransition('booting', 'running'));
  assert(!canTransition('downloading', 'running'));
  assert(!canTransition('failed', 'running'));
  assert(canTransition('running', 'paused'));
});
test('guest paths are encoded data, including shell punctuation and trailing newlines', () => {
  const name = '/root/$(touch injected); "snow☃"\n';
  assert.equal(decode(encode(name)), name);
  const line = requestLine(12, 'READ', name);
  assert.equal(line.split('\t').length, 4);
  assert(!line.includes('touch injected'));
  assert.throws(() => requestLine(0, 'READ', '/'));
  assert.throws(() => requestLine(1, 'READ', 'relative'));
  assert.throws(() => requestLine(1, 'WRITE', '/x', 'injected\n'));
});
test('filesystem metadata validation and Unicode names', () => {
  const result = parseEntries(encode(`${encode('雪\nfile')}\t42\t600\tregular file\n`));
  assert.deepEqual(result, [{ name: '雪\nfile', size: 42, mode: '600', type: 'regular file' }]);
  assert.throws(() => parseEntries(encode(`${encode('../escape')}\t42\t600\tregular file`)));
});
test('disk writes persist independently of RAM snapshots and incompatible images preserve records', async () => {
  globalThis.indexedDB = indexedDB;
  let failed = false;
  const seed = new ArrayBuffer(8192);
  new Uint8Array(seed)[100] = 45;
  const compressedSeed = gzipSync(new Uint8Array(seed));
  const originalCompression = globalThis.CompressionStream;
  globalThis.CompressionStream = undefined;
  let disk;
  try {
    disk = await PersistentDisk.open(
      seed,
      'test-image',
      () => {
        failed = true;
      },
      compressedSeed.buffer.slice(
        compressedSeed.byteOffset,
        compressedSeed.byteOffset + compressedSeed.byteLength,
      ),
    );
  } finally {
    globalThis.CompressionStream = originalCompression;
  }
  await new Promise((resolve) =>
    disk.set(4090, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), resolve),
  );
  await disk.flush();
  const reopened = await PersistentDisk.open(new ArrayBuffer(8192), 'test-image', () => {});
  assert.deepEqual([...new Uint8Array(reopened.buffer, 4090, 9)], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(new Uint8Array(reopened.buffer)[100], 45); // original seed survives a changed download
  assert(!failed);
  await assert.rejects(
    () => PersistentDisk.open(new ArrayBuffer(8192), 'other-image', () => {}),
    /version differs/,
  );
  const again = await PersistentDisk.open(new ArrayBuffer(8192), 'test-image', () => {});
  assert.equal(new Uint8Array(again.buffer)[4090], 1);
  const replacement = new ArrayBuffer(8192);
  new Uint8Array(replacement)[0] = 99;
  await again.replace(replacement);
  const restored = await PersistentDisk.open(new ArrayBuffer(8192), 'test-image', () => {});
  assert.equal(new Uint8Array(restored.buffer)[0], 99);
  assert.equal(new Uint8Array(restored.buffer)[4090], 0);
});
import { GuestBridge } from '../src/vm/GuestBridge.ts';
import { importSnapshot } from '../src/storage/BackupManager.ts';
test('dedicated bridge matches IDs and supports cancellation without parsing terminal output', async () => {
  const sent = [];
  let ready = 0;
  const bridge = new GuestBridge(
    (s) => sent.push(s),
    () => ready++,
  );
  const feed = (s) => [...s].forEach((c) => bridge.accept(c.charCodeAt(0)));
  await assert.rejects(() => bridge.request('LIST'), /not ready/);
  feed('ordinary shell prompt\n');
  assert.equal(ready, 0);
  feed('AP1\t0\tREADY\t1\n');
  assert.equal(ready, 1);
  const result = bridge.request('READ', '/root/a');
  const id = sent[0].split('\t')[0];
  feed('AP1\t999\tOK\twrong\n');
  feed(`AP1\t${id}\tOK\t${encode('actual')}\n`);
  assert.equal(decode(await result), 'actual');
  const controller = new AbortController();
  const cancelled = bridge.request('LIST', '/', '', controller.signal);
  controller.abort();
  await assert.rejects(() => cancelled, /cancelled/);
  bridge.dispose();
});
test('snapshot imports reject invalid headers and oversize data before touching a VM', async () => {
  await assert.rejects(() => importSnapshot(new File(['bad header'], 'bad.snapshot')), /signature/);
  await assert.rejects(() => importSnapshot({ size: 1537 * 1024 * 1024 }), /limit/);
  const blob = new Blob(['APSNAP01', new Uint32Array([99999])]);
  await assert.rejects(() => importSnapshot(new File([blob], 'bad.snapshot')), /header/);
});
test('64 MiB persistent disks expand without changing original offsets or saved blocks', async () => {
  const { IDBFactory } = await import('fake-indexeddb');
  globalThis.indexedDB = new IDBFactory();
  const seed = new ArrayBuffer(67108864);
  new Uint8Array(seed)[100] = 41;
  const disk = await PersistentDisk.open(seed, 'growth-fixture', () =>
    assert.fail('write failure'),
  );
  await new Promise((resolve) => disk.set(8192, new Uint8Array([99]), resolve));
  await disk.flush();
  const grown = await PersistentDisk.open(new ArrayBuffer(536870912), 'growth-fixture', () =>
    assert.fail('write failure'),
  );
  assert.equal(grown.byteLength, 536870912);
  assert.equal(new Uint8Array(grown.buffer)[100], 41);
  assert.equal(new Uint8Array(grown.buffer)[8192], 99);
  assert.equal(new Uint8Array(grown.buffer)[67108864], 0);
});

test('snapshot chunks round-trip, delete together, and read previous records', async () => {
  const { saveStoredSnapshot, loadStoredSnapshot, removeStoredSnapshot } =
    await import('../src/storage/SnapshotStorage.ts');
  const { createIndexedStore } = await import('../src/lib/storage.js');
  const { IDBFactory } = await import('fake-indexeddb');
  const store = createIndexedStore(
    { appId: 'synthetic', basePath: '/', namespace: 'snapshots', version: 1 },
    new IDBFactory(),
  );
  const original = {
    format: 1,
    state: new Uint8Array([1, 2]).buffer,
    disk: new ArrayBuffer(9 * 1024 * 1024),
  };
  new Uint8Array(original.disk)[8 * 1024 * 1024] = 42;
  await saveStoredSnapshot(store, 'sample', original);
  assert.deepEqual(await loadStoredSnapshot(store, 'sample'), original);
  await removeStoredSnapshot(store, 'sample');
  assert.equal(await store.get('sample:disk:1'), undefined);
  await assert.rejects(() => loadStoredSnapshot(store, 'sample'), /unavailable/);
  await store.set('previous', original, { ttlMs: null });
  assert.deepEqual(await loadStoredSnapshot(store, 'previous'), original);
  function* failedWrite() {
    yield ['partial', 1];
    throw new Error('synthetic interruption');
  }
  await assert.rejects(
    () => store.setMany(failedWrite(), { ttlMs: null }),
    /synthetic interruption/,
  );
  assert.equal(await store.get('partial'), undefined);
});

test('streamed disk inflation checks exact size and clears expanded space', async () => {
  const { inflateDisk } = await import('../src/storage/diskCompression.ts');
  const compressed = await new Response(
    new Blob([new Uint8Array([1, 2, 3])]).stream().pipeThrough(new CompressionStream('gzip')),
  ).arrayBuffer();
  const disk = new Uint8Array(8).fill(99);
  await inflateDisk(compressed, disk.buffer, 3);
  assert.deepEqual([...disk], [1, 2, 3, 0, 0, 0, 0, 0]);
  await assert.rejects(() => inflateDisk(compressed, new ArrayBuffer(2)), /exceeds/);
  await assert.rejects(() => inflateDisk(compressed, new ArrayBuffer(4)), /invalid size/);
});
