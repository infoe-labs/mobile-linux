import type { Snapshot } from '../vm/V86Controller';
type StoredSnapshot = Omit<Snapshot, 'state' | 'disk'> & {
  binaryStorage: 'blobs-v1';
  state: Blob;
  disk: Blob;
};
// Blob payloads avoid Chromium's per-record serialized ArrayBuffer size limit.
export function encodeSnapshot(snapshot: Snapshot): StoredSnapshot {
  return {
    ...snapshot,
    binaryStorage: 'blobs-v1',
    state: new Blob([snapshot.state]),
    disk: new Blob([snapshot.disk]),
  };
}
export async function decodeSnapshot(value: unknown): Promise<Snapshot> {
  if (!value || typeof value !== 'object') throw new Error('Snapshot unavailable.');
  const stored = value as Snapshot | StoredSnapshot;
  if ('binaryStorage' in stored) {
    const { binaryStorage, ...metadata } = stored;
    if (
      binaryStorage !== 'blobs-v1' ||
      !(stored.state instanceof Blob) ||
      !(stored.disk instanceof Blob)
    )
      throw new Error('Unsupported snapshot storage format.');
    return {
      ...metadata,
      state: await stored.state.arrayBuffer(),
      disk: await stored.disk.arrayBuffer(),
    };
  }
  if (!(stored.state instanceof ArrayBuffer) || !(stored.disk instanceof ArrayBuffer))
    throw new Error('Invalid snapshot payload.');
  return stored;
}
