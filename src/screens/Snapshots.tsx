import { useEffect, useState } from 'react';
import { vm, snapshots, type Snapshot } from '../vm/V86Controller';
import { download, exportSnapshot, importSnapshot } from '../storage/BackupManager';
import type { Act } from '../app/actions';
export default function Snapshots({ act }: { act: Act }) {
  const [items, setItems] = useState<
    { id: string; snap: { name: string; date: number; bytes: number } }[]
  >([]);
  const refresh = async () => {
    const ids = ((await snapshots.get('index')) as string[] | undefined) ?? [];
    const result = [];
    for (const id of ids) {
      const snap = (await snapshots.get(id + ':meta')) as
        { name: string; date: number; bytes: number } | undefined;
      if (snap) result.push({ id, snap });
    }
    setItems(result);
  };
  useEffect(() => {
    void act(refresh);
  }, []);
  return (
    <>
      <h3>Snapshots & backups</h3>
      <p>
        Snapshots include RAM and disk. Restoring replaces current disk contents. Exact runtime,
        image, and RAM must match.
      </p>
      <div className="row">
        <button
          disabled={!['running', 'paused'].includes(vm.state)}
          onClick={() => {
            const name = prompt('Snapshot name', 'Checkpoint');
            if (name)
              void act(async () => {
                await vm.snapshot(name);
                await refresh();
              });
          }}
        >
          Save snapshot
        </button>
        <label className="file-button">
          Import snapshot
          <input
            type="file"
            accept=".snapshot"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void act(async () => {
                  const snap = await importSnapshot(file);
                  if (confirm('Replace the current VM and disk with this snapshot?'))
                    await vm.restore(snap);
                });
              e.target.value = '';
            }}
          />
        </label>
        <button
          disabled={!vm.disk}
          onClick={() =>
            act(async () => {
              if (vm.state === 'running') await vm.pause();
              if (vm.state !== 'failed') await vm.disk!.flush();
              download(new Blob([vm.disk!.buffer]), 'alpine-pocket.ext4');
            })
          }
        >
          Export disk
        </button>
        <label className="file-button">
          Restore disk
          <input
            type="file"
            accept=".ext4,.img"
            disabled={!vm.disk}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void act(async () => {
                  if (file.size !== 67108864)
                    throw new Error('Disk must be a 64 MiB Alpine Pocket image.');
                  const bytes = await file.arrayBuffer();
                  if (new DataView(bytes).getUint16(1080, true) !== 0xef53)
                    throw new Error('Invalid ext4 disk signature.');
                  if (
                    !confirm('Replace your entire guest disk and restart? Export a backup first.')
                  )
                    return;
                  if (vm.state === 'running') await vm.pause();
                  if (vm.state !== 'paused') throw new Error('VM must be paused.');
                  await vm.stop();
                  await vm.disk!.replace(bytes);
                  location.reload();
                });
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {items.map(({ id, snap }) => (
        <article className="snapshot" key={id}>
          <strong>{snap.name}</strong>
          <small>
            {new Date(snap.date).toLocaleString()} · {(snap.bytes / 1048576).toFixed(1)} MB
          </small>
          <div className="row">
            <button
              onClick={() => {
                if (confirm('Replace current disk and machine state?'))
                  void act(async () => vm.restore((await snapshots.get(id)) as Snapshot));
              }}
            >
              Restore
            </button>
            <button
              onClick={() => act(async () => exportSnapshot((await snapshots.get(id)) as Snapshot))}
            >
              Export
            </button>
            <button
              className="danger"
              onClick={() => {
                if (confirm('Permanently delete this snapshot?'))
                  void act(async () => {
                    await snapshots.remove(id);
                    await snapshots.remove(id + ':meta');
                    await snapshots.set(
                      'index',
                      items.filter((i) => i.id !== id).map((i) => i.id),
                      { ttlMs: null },
                    );
                    await refresh();
                  });
              }}
            >
              Delete
            </button>
          </div>
        </article>
      ))}
    </>
  );
}
