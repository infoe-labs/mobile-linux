/** Inflate directly into the disk buffer instead of collecting another full-size response. */
export async function inflateDisk(
  compressed: ArrayBuffer,
  target: ArrayBuffer,
  expected = target.byteLength,
) {
  if (expected < 1 || expected > target.byteLength) throw new Error('Invalid disk seed size.');
  const bytes = new Uint8Array(target);
  bytes.fill(0);
  const reader = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
    .getReader();
  let offset = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.length > expected) throw new Error('Disk seed exceeds its declared size.');
      bytes.set(value, offset);
      offset += value.length;
    }
    if (offset !== expected) throw new Error('Disk seed has an invalid size.');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
