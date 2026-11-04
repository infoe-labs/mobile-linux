import type { Snapshot } from '../vm/V86Controller';
const chunkBytes = 8 * 1024 * 1024;
interface Store {
  get(key: string): Promise<unknown>;
  setMany(entries: Iterable<[string, unknown]>, options: { ttlMs: null }): Promise<unknown>;
  removeMany(keys: Iterable<string>): Promise<unknown>;
}
type StoredSnapshot = Omit<Snapshot, 'state' | 'disk'> & {
  binaryStorage: 'chunks-v1';
  stateBytes: number;
  diskBytes: number;
};
function chunkCount(bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > 1024 * 1024 * 1024)
    throw new Error('Invalid snapshot payload size.');
  return Math.ceil(bytes / chunkBytes);
}
export async function saveStoredSnapshot(store: Store, id: string, snapshot: Snapshot) {
  const { state, disk, ...metadata } = snapshot;
  // All chunks and the descriptor commit together; interrupted writes leave no partial snapshot.
  function* records(): Generator<[string, unknown]> {
    for (const [kind, bytes] of [
      ['state', state],
      ['disk', disk],
    ] as const) {
      for (let i = 0; i < chunkCount(bytes.byteLength); i++)
        yield [`${id}:${kind}:${i}`, bytes.slice(i * chunkBytes, (i + 1) * chunkBytes)];
    }
    yield [
      id,
      {
        ...metadata,
        binaryStorage: 'chunks-v1',
        stateBytes: state.byteLength,
        diskBytes: disk.byteLength,
      },
    ];
  }
  await store.setMany(records(), { ttlMs: null });
}
export async function loadStoredSnapshot(store: Store, id: string): Promise<Snapshot> {
  const value = await store.get(id);
  if (!value || typeof value !== 'object') throw new Error('Snapshot unavailable.');
  const stored = value as Snapshot | StoredSnapshot;
  if ('binaryStorage' in stored) {
    const { binaryStorage, stateBytes, diskBytes, ...metadata } = stored;
    if (binaryStorage !== 'chunks-v1') throw new Error('Unsupported snapshot storage format.');
    async function read(kind: string, size: number) {
      const count = chunkCount(size);
      const bytes = new Uint8Array(size);
      for (let i = 0; i < count; i++) {
        const chunk = await store.get(`${id}:${kind}:${i}`);
        if (
          !(chunk instanceof ArrayBuffer) ||
          chunk.byteLength !== Math.min(chunkBytes, size - i * chunkBytes)
        )
          throw new Error('Snapshot payload incomplete.');
        bytes.set(new Uint8Array(chunk), i * chunkBytes);
      }
      return bytes.buffer;
    }
    return {
      ...metadata,
      state: await read('state', stateBytes),
      disk: await read('disk', diskBytes),
    };
  }
  if (!(stored.state instanceof ArrayBuffer) || !(stored.disk instanceof ArrayBuffer))
    throw new Error('Invalid snapshot payload.');
  return stored;
}
export async function removeStoredSnapshot(store: Store, id: string) {
  const value = (await store.get(id)) as StoredSnapshot | undefined;
  const keys = [id];
  if (value?.binaryStorage === 'chunks-v1') {
    for (const [kind, size] of [
      ['state', value.stateBytes],
      ['disk', value.diskBytes],
    ] as const)
      for (let i = 0; i < chunkCount(size); i++) keys.push(`${id}:${kind}:${i}`);
  }
  await store.removeMany(keys);
}
