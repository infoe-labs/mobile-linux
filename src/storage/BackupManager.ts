import type { Snapshot } from '../vm/V86Controller';
export function download(data: Blob, name: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function exportSnapshot(snap: Snapshot) {
  const { state, disk, ...meta } = snap;
  const header = new TextEncoder().encode(
    JSON.stringify({ ...meta, stateBytes: state.byteLength, diskBytes: disk.byteLength }),
  );
  const length = new Uint32Array([header.length]);
  download(new Blob(['APSNAP01', length, header, state, disk]), 'alpine-pocket.snapshot');
}
export async function importSnapshot(file: File): Promise<Snapshot> {
  if (file.size > 512 * 1024 * 1024) throw new Error('Snapshot exceeds 512 MiB import limit.');
  const bytes = await file.arrayBuffer();
  if (new TextDecoder().decode(bytes.slice(0, 8)) !== 'APSNAP01')
    throw new Error('Invalid snapshot signature.');
  const size = new DataView(bytes).getUint32(8, true);
  if (size > 4096 || size + 12 > bytes.byteLength) throw new Error('Invalid snapshot header.');
  const meta = JSON.parse(new TextDecoder().decode(bytes.slice(12, 12 + size)));
  if (
    meta.format !== 1 ||
    !Number.isSafeInteger(meta.stateBytes) ||
    !Number.isSafeInteger(meta.diskBytes) ||
    meta.stateBytes < 1 ||
    meta.diskBytes !== 67108864 ||
    12 + size + meta.stateBytes + meta.diskBytes !== bytes.byteLength
  )
    throw new Error('Invalid snapshot lengths.');
  return {
    ...meta,
    state: bytes.slice(12 + size, 12 + size + meta.stateBytes),
    disk: bytes.slice(12 + size + meta.stateBytes),
  };
}
