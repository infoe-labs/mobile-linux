import { useState } from 'react';
import { vm } from '../vm/V86Controller';
import { decode, parseEntries, type Entry } from '../vm/protocol';
import { completeDraft } from './CompletionEngine';
import { terminal } from './TerminalController';
export function CommandDraft() {
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [commands, setCommands] = useState<string[]>([]);
  const [directory, setDirectory] = useState('/root');
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const suggest = async () => {
    setBusy(true);
    try {
      if (vm.state !== 'running') throw new Error('Boot Alpine first.');
      let names = commands;
      if (!names.length) {
        names = decode(await vm.bridge!.request('COMMANDS'))
          .split('\n')
          .filter((name) => /^[a-zA-Z0-9._+-]+$/.test(name));
        names = [...new Set(names)];
        setCommands(names);
      }
      const word = draft.split(/\s+/).at(-1) || '';
      const parent = word.includes('/') ? word.slice(0, word.lastIndexOf('/') + 1) : '';
      const path = parent.startsWith('/') ? parent : directory.replace(/\/$/, '') + '/' + parent;
      let entries: Entry[] = [];
      try {
        entries = parseEntries(await vm.bridge!.request('LIST', path));
      } catch {
        /* Commands still work if directory is unavailable. */
      }
      setSuggestions(completeDraft(draft, names, entries, history));
      setError('');
    } catch {
      setError('Completion unavailable. Use terminal Tab for the shell’s current directory.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="command-draft">
      <label>
        Completion directory
        <input
          aria-label="Completion directory"
          value={directory}
          onChange={(e) => setDirectory(e.target.value)}
        />
      </label>
      <div className="row">
        <input
          aria-label="Command draft"
          placeholder="Compose a command; Enter never executes here"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void suggest();
            }
          }}
        />
        <button disabled={busy} onClick={() => void suggest()}>
          {busy ? 'Loading…' : 'Suggest'}
        </button>
        <button
          disabled={!draft || vm.state !== 'running'}
          onClick={() => {
            terminal.insert(draft);
            setHistory([...history, draft].slice(-100));
            setDraft('');
            setSuggestions([]);
          }}
        >
          Insert
        </button>
      </div>
      <div className="suggestions">
        {suggestions.map((s) => (
          <button key={s} onClick={() => setDraft(s)}>
            {s}
          </button>
        ))}
      </div>
      {error && <small role="status">{error}</small>}
    </div>
  );
}
