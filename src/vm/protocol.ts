export const encode = (text: string) => bytes64(new TextEncoder().encode(text));
export function bytes64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192)
    result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
export function unbase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
export const decode = (text: string) =>
  new TextDecoder('utf-8', { fatal: true }).decode(unbase64(text));
export type Operation =
  'COMMANDS' | 'LIST' | 'READ' | 'WRITE' | 'MKDIR' | 'DELETE' | 'RENAME' | 'RESIZE' | 'SYNC';
export type Entry = { name: string; size: number; mode: string; type: string };
export function parseEntries(payload: string): Entry[] {
  const text = decode(payload);
  if (!text) return [];
  return text
    .trimEnd()
    .split('\n')
    .map((line) => {
      const [name, size, mode, type] = line.split('\t');
      const decoded = decode(name);
      if (
        !decoded ||
        decoded.includes('/') ||
        decoded.includes('\0') ||
        !/^\d+$/.test(size) ||
        !/^[0-7]+$/.test(mode) ||
        !type
      )
        throw new Error('Invalid guest directory response.');
      return { name: decoded, size: Number(size), mode, type };
    });
}
export function requestLine(id: number, op: Operation, path: string, data = '') {
  if (
    !['COMMANDS', 'LIST', 'READ', 'WRITE', 'MKDIR', 'DELETE', 'RENAME', 'RESIZE', 'SYNC'].includes(
      op,
    ) ||
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !path.startsWith('/') ||
    path.includes('\0') ||
    /[\r\n\t]/.test(data)
  )
    throw new Error('Invalid bridge request.');
  if (new TextEncoder().encode(path).length > 4096 || data.length > 1400000)
    throw new Error('Bridge request too large.');
  return `${id}\t${op}\t${encode(path)}\t${data}\n`;
}
