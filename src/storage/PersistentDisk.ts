import { storageScope } from '../lib/storage.js';
import { appConfig } from '../../app.config.js';

// This adapter intentionally implements v86's loadable-buffer contract.
// Writes become visible to the guest controller only after an IDB transaction commits.
export class PersistentDisk {
  byteLength: number;
  onload?: (event: { buffer: ArrayBuffer }) => void;
  private db!: IDBDatabase;
  private tail: Promise<void> = Promise.resolve();
  failed = false;
  buffer: ArrayBuffer;
  private onFailure: () => void;
  private constructor(buffer: ArrayBuffer, onFailure: () => void) {
    this.buffer = buffer;
    this.onFailure = onFailure;
    this.byteLength = buffer.byteLength;
  }
  static async open(seed: ArrayBuffer, image: string, onFailure: () => void) {
    const disk = new PersistentDisk(seed, onFailure);
    const name = storageScope({
      appId: appConfig.appId,
      basePath: import.meta.env?.BASE_URL ?? '/',
      namespace: 'disk',
      version: 1,
    });
    disk.db = await new Promise((resolve, reject) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('blocks');
        r.result.createObjectStore('meta');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = r.onblocked = () =>
        reject(new Error('Disk storage unavailable. Close other tabs and retry.'));
    });
    // Retain the original compressed seed with the disk. A later app build
    // must never apply old block offsets to a newly generated seed layout.
    const stored = await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
      const read = disk.db.transaction('meta', 'readonly').objectStore('meta').get('seed');
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(new Error('Disk seed unavailable.'));
    });
    let compressed: ArrayBuffer;
    if (stored) {
      if (!(stored instanceof ArrayBuffer)) throw new Error('Invalid stored disk seed.');
      compressed = stored;
      disk.buffer = await new Response(
        new Blob([stored]).stream().pipeThrough(new DecompressionStream('gzip')),
      ).arrayBuffer();
      if (disk.buffer.byteLength !== disk.byteLength)
        throw new Error('Stored disk seed has an invalid size.');
    } else
      compressed = await new Response(
        new Blob([seed]).stream().pipeThrough(new CompressionStream('gzip')),
      ).arrayBuffer();
    const tx = disk.db.transaction(['blocks', 'meta'], 'readwrite');
    const meta = tx.objectStore('meta');
    if (!stored) meta.put(compressed, 'seed');
    let mismatch = false;
    const r = meta.get('image');
    r.onsuccess = () => {
      if (r.result && r.result !== image) {
        mismatch = true;
        tx.abort();
      } else meta.put(image, 'image');
    };
    const cursor = tx.objectStore('blocks').openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return;
      const offset = Number(c.key),
        value = c.value;
      if (
        !(value instanceof Uint8Array) ||
        value.length !== 4096 ||
        offset % 4096 ||
        offset < 0 ||
        offset + value.length > disk.byteLength
      ) {
        tx.abort();
        return;
      }
      new Uint8Array(disk.buffer, offset, value.length).set(value);
      c.continue();
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(
          new Error(
            mismatch
              ? 'Disk image version differs. Export your disk before migrating.'
              : 'Disk data is invalid; original records preserved.',
          ),
        );
    });
    return disk;
  }
  load() {
    this.onload?.({ buffer: this.buffer });
  }
  get(start: number, len: number, fn: (data: Uint8Array) => void) {
    fn(new Uint8Array(this.buffer, start, len));
  }
  get_and_cache(start: number, len: number, fn: (data: Uint8Array) => void) {
    this.get(start, len, fn);
  }
  get_from_cache(start: number, len: number) {
    return new Uint8Array(this.buffer, start, len);
  }
  set(start: number, data: Uint8Array, done: () => void) {
    const copy = data.slice();
    this.tail = this.tail
      .then(async () => {
        if (this.failed) return;
        const first = Math.floor(start / 4096) * 4096;
        const end = Math.ceil((start + copy.length) / 4096) * 4096;
        const staged = new Uint8Array(end - first);
        staged.set(new Uint8Array(this.buffer, first, end - first));
        staged.set(copy, start - first);
        const tx = this.db.transaction('blocks', 'readwrite', { durability: 'strict' });
        for (let offset = first; offset < end; offset += 4096)
          tx.objectStore('blocks').put(staged.slice(offset - first, offset - first + 4096), offset);
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(new Error('Disk commit failed.'));
        });
        new Uint8Array(this.buffer, first, staged.length).set(staged);
        done();
      })
      .catch(() => {
        this.failed = true;
        this.onFailure();
      });
  }
  flush() {
    return this.tail.then(() => {
      if (this.failed) throw new Error('Disk writes failed. Export a recovery backup.');
    });
  }
  get_buffer(fn: (buffer: ArrayBuffer) => void) {
    fn(this.buffer);
  }
  // Disk bytes are captured separately in the snapshot envelope; v86 keeps its device state.
  get_state() {
    return [this.byteLength];
  }
  set_state(state: [number]) {
    if (state[0] !== this.byteLength) throw new Error('Snapshot disk size mismatch.');
  }
  async reset() {
    await this.flush();
    const tx = this.db.transaction(['blocks', 'meta'], 'readwrite', { durability: 'strict' });
    tx.objectStore('blocks').clear();
    tx.objectStore('meta').clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error('Disk reset failed.'));
    });
  }
  async replace(bytes: ArrayBuffer) {
    await this.flush();
    if (bytes.byteLength !== this.byteLength) throw new Error('Disk size mismatch.');
    const tx = this.db.transaction('blocks', 'readwrite', { durability: 'strict' }),
      store = tx.objectStore('blocks');
    store.clear();
    for (let offset = 0; offset < bytes.byteLength; offset += 4096)
      store.put(new Uint8Array(bytes.slice(offset, offset + 4096)), offset);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error('Disk restore failed.'));
    });
    this.buffer = bytes.slice(0);
  }
}
