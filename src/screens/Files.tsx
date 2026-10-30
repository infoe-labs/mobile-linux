import { useEffect, useState } from 'react';
import { vm } from '../vm/V86Controller';
import { bytes64, decode, encode, parseEntries, unbase64, type Entry } from '../vm/protocol';
import { download } from '../storage/BackupManager';
import type { Act } from '../app/actions';
export default function Files({ act, onDirty }: { act: Act; onDirty: (value: boolean) => void }) {
  const [path, setPath] = useState('/root');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState('');
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [draftPath, setDraftPath] = useState('/root');
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  const full = (name: string) => (path === '/' ? '' : path) + '/' + name;
  const refresh = async (target = path) => {
    setBusy(true);
    try {
      setEntries(parseEntries(await vm.bridge!.request('LIST', target)));
      setPath(target);
      setDraftPath(target);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (vm.bridge?.ready) void act(() => refresh());
  }, []); // panel lifetime only
  const open = async (entry: Entry) => {
    if (dirty && !confirm('Discard unsaved file changes?')) return;
    if (entry.type === 'directory') {
      await refresh(full(entry.name));
      setSelected('');
      setDirty(false);
    } else {
      const name = full(entry.name);
      const payload = await vm.bridge!.request('READ', name);
      setContent(decode(payload));
      setSelected(name);
      setDirty(false);
    }
  };
  if (!vm.bridge?.ready)
    return (
      <div className="panel-body">
        <p>Boot Alpine to browse its real filesystem.</p>
      </div>
    );
  return (
    <div className="panel-body">
      <p className="muted">Live guest filesystem · file transfers up to 1 MiB</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void act(() => refresh(draftPath));
        }}
      >
        <input
          aria-label="Directory path"
          value={draftPath}
          onChange={(e) => setDraftPath(e.target.value)}
        />
        <button disabled={busy}>Go</button>
        <button
          type="button"
          onClick={() => act(() => refresh(path.slice(0, path.lastIndexOf('/')) || '/'))}
        >
          Up
        </button>
      </form>
      <div className="row">
        <button
          onClick={() => {
            const name = prompt('New directory name');
            if (name && !name.includes('/'))
              void act(async () => {
                await vm.bridge!.request('MKDIR', full(name));
                await refresh();
              });
          }}
        >
          New folder
        </button>
        <button
          onClick={() => {
            const name = prompt('New text file name');
            if (name && !name.includes('/'))
              void act(async () => {
                if (entries.some((e) => e.name === name) && !confirm('Overwrite this guest file?'))
                  return;
                await vm.bridge!.request('WRITE', full(name), '');
                await refresh();
              });
          }}
        >
          New file
        </button>
        <label className="file-button">
          Import
          <input
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void act(async () => {
                  if (file.size > 1048576) throw new Error('Import limit: 1 MiB.');
                  if (
                    entries.some((x) => x.name === file.name) &&
                    !confirm('Overwrite this guest file?')
                  )
                    return;
                  await vm.bridge!.request(
                    'WRITE',
                    full(file.name),
                    bytes64(new Uint8Array(await file.arrayBuffer())),
                  );
                  await refresh();
                });
              e.target.value = '';
            }}
          />
        </label>
      </div>
      <input
        aria-label="Filter this directory"
        placeholder="Filter this directory"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <ul className="file-list">
        {entries
          .filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((e) => (
            <li key={e.name}>
              <button onClick={() => act(() => open(e))}>
                <span>
                  {e.type === 'directory' ? '▸' : '·'} {e.name}
                </span>
                <small>
                  {e.mode} · {e.size.toLocaleString()} B
                </small>
              </button>
              <div className="file-actions">
                {e.type !== 'directory' && (
                  <button
                    aria-label={'Export ' + e.name}
                    onClick={() =>
                      act(async () => {
                        const payload = await vm.bridge!.request('READ', full(e.name));
                        download(new Blob([unbase64(payload) as BlobPart]), e.name);
                      })
                    }
                  >
                    Export
                  </button>
                )}
                <button
                  aria-label={'Rename ' + e.name}
                  onClick={() => {
                    const name = prompt('New name', e.name);
                    if (name && !name.includes('/'))
                      void act(async () => {
                        await vm.bridge!.request('RENAME', full(e.name), encode(full(name)));
                        await refresh();
                      });
                  }}
                >
                  Rename
                </button>
                <button
                  className="danger"
                  aria-label={'Delete ' + e.name}
                  onClick={() => {
                    if (confirm('Permanently delete this guest entry and its contents?'))
                      void act(async () => {
                        await vm.bridge!.request('DELETE', full(e.name));
                        await refresh();
                      });
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
      </ul>
      {selected && (
        <div className="editor">
          <h3>
            {selected}
            {dirty ? ' · unsaved' : ''}
          </h3>
          <textarea
            aria-label="Guest text file"
            spellCheck={false}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setDirty(true);
            }}
          />
          <div className="row">
            <button
              onClick={() =>
                act(async () => {
                  if (new TextEncoder().encode(content).length > 1048576)
                    throw new Error('Text file exceeds 1 MiB.');
                  await vm.bridge!.request('WRITE', selected, encode(content));
                  setDirty(false);
                  await refresh();
                })
              }
            >
              Save to Alpine
            </button>
            <button
              onClick={() =>
                act(async () => {
                  const data = await vm.bridge!.request('READ', selected);
                  download(new Blob([unbase64(data) as BlobPart]), selected.split('/').at(-1)!);
                })
              }
            >
              Export
            </button>
            <button
              onClick={() => {
                const name = prompt('New name', selected.split('/').at(-1));
                if (name && !name.includes('/'))
                  void act(async () => {
                    await vm.bridge!.request('RENAME', selected, encode(full(name)));
                    setSelected('');
                    await refresh();
                  });
              }}
            >
              Rename
            </button>
            <button
              className="danger"
              onClick={() => {
                if (confirm('Delete this guest file?'))
                  void act(async () => {
                    await vm.bridge!.request('DELETE', selected);
                    setSelected('');
                    setDirty(false);
                    await refresh();
                  });
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
