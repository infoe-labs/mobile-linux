import { quotePath } from './input.ts';
import type { Entry } from '../vm/protocol';
const flags: Record<string, string[]> = {
  ls: ['-la', '-lh', '-a'],
  find: ['-type f', '-type d', '-name ', '-size +10M'],
  grep: ['-n', '-i', '-r'],
  tar: ['-czf ', '-xzf ', '-tf '],
  apk: ['add --no-network ', 'info', 'list --installed'],
  df: ['-h'],
  free: ['-m'],
};
export function completeDraft(
  draft: string,
  commands: string[],
  entries: Entry[],
  history: string[] = [],
): string[] {
  if (!draft || [...draft].some((c) => c.charCodeAt(0) < 32)) return [];
  const suggestions = history
    .filter((line) => line.startsWith(draft) && line !== draft)
    .slice(-3)
    .reverse();
  const parts = draft.split(/\s+/),
    word = parts.at(-1)!;
  if (parts.length === 1)
    suggestions.push(...commands.filter((c) => c.startsWith(word) && c !== word));
  else {
    if (!word || word.startsWith('-'))
      suggestions.push(
        ...(flags[parts[0]] ?? [])
          .filter((f) => f.startsWith(word))
          .map((f) => draft.slice(0, draft.length - word.length) + f),
      );
    const prefix = word.slice(0, word.lastIndexOf('/') + 1),
      name = word.slice(prefix.length);
    suggestions.push(
      ...entries
        .filter((e) => e.name.startsWith(name))
        .map(
          (e) =>
            draft.slice(0, draft.length - word.length) +
            quotePath(prefix + e.name + (e.type === 'directory' ? '/' : '')),
        ),
    );
  }
  return [...new Set(suggestions)].slice(0, 6);
}
