import type { GuestBridge } from '../../vm/GuestBridge';
import { bytes64, encode } from '../../vm/protocol';
export async function importFiles(
  bridge: GuestBridge,
  files: File[],
  progress: (text: string) => void,
  directory = '/root/.pocket-apks',
) {
  if (!['/root/.pocket-apks', '/root/Downloads'].includes(directory))
    throw new Error('Invalid import directory.');
  const targets: string[] = [];
  if (!files.length || files.reduce((sum, file) => sum + file.size, 0) > 256 * 1048576)
    throw new Error('Choose files totaling at most 256 MiB.');
  for (const file of files) {
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9+_.-]*$/.test(file.name) ||
      (directory.endsWith('.pocket-apks') && !file.name.endsWith('.apk')) ||
      (!file.size && directory.endsWith('.pocket-apks')) ||
      file.size > 128 * 1048576
    )
      throw new Error('Choose valid files no larger than 128 MiB each.');
  }
  try {
    await bridge.request('MKDIR', directory);
  } catch {
    /* Existing upload directory is expected. */
  }
  for (const file of files) {
    const target = directory + '/' + crypto.randomUUID() + '-' + file.name;
    const partial = target + '.part';
    try {
      await bridge.request('WRITE', partial, '');
      for (let offset = 0; offset < file.size; offset += 65536) {
        const bytes = new Uint8Array(await file.slice(offset, offset + 65536).arrayBuffer());
        await bridge.request('APPEND', partial, bytes64(bytes));
        progress(
          `Importing ${file.name}: ${Math.min(offset + bytes.length, file.size)} / ${file.size} bytes`,
        );
      }
      await bridge.request('RENAME', partial, encode(target));
      targets.push(target);
    } catch (error) {
      await bridge.request('DELETE', partial).catch(() => {});
      throw error;
    }
  }
  await bridge.request('SYNC');
  return targets;
}

export const importAPKs = importFiles;
