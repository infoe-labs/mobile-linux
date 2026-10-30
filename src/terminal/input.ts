/** Suggestions may contain hostile control bytes. Insertion must never submit a line. */
export function safeInsertion(text: string) {
  return [...text]
    .map((c) =>
      c === '\n' || c === '\r' ? ' ' : c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? '' : c,
    )
    .join('');
}
export function quotePath(path: string) {
  return /^[a-zA-Z0-9_./@%+=,:-]+$/.test(path) ? path : "'" + path.replace(/'/g, "'\\''") + "'";
}
