import { useEffect, useState } from 'react';
import { vm } from '../vm/V86Controller';
import { ai } from '../ai/AIManager';
import { capabilities } from '../ai/CapabilityDetector';
import { requestPersistence, storageEstimate } from '../lib/storage';
import type { Act } from '../app/actions';
export default function Diagnostics({ act }: { act: Act }) {
  const [data, setData] = useState<any>();
  const [storage, setStorage] = useState<any>();
  useEffect(() => {
    void act(async () => {
      setData(await capabilities());
      setStorage(await storageEstimate());
    });
  }, []);
  return (
    <>
      <h3>Storage & diagnostics</h3>
      <p>
        Guest RAM: {vm.memory} MB · Disk: 64 MiB · Boot:{' '}
        {vm.bootMs ? (vm.bootMs / 1000).toFixed(1) + 's' : 'not completed'}
        <br />
        AI: {ai.state} · WebGPU: {data ? String(data.webgpu) : 'checking'}
        <br />
        Origin storage:{' '}
        {storage
          ? `${((storage.usage ?? 0) / 1048576).toFixed(1)} / ${((storage.quota ?? 0) / 1048576).toFixed(0)} MB`
          : 'unavailable'}
      </p>
      {storage && storage.quota - storage.usage < 200 * 1048576 && (
        <p role="alert">
          Low available storage. Export backups before installing models or saving snapshots.
        </p>
      )}
      <button
        onClick={() =>
          act(async () => {
            const granted = await requestPersistence();
            alert(
              granted
                ? 'Browser granted persistent storage. Keep backups.'
                : 'Browser did not grant persistent storage. Keep backups.',
            );
          })
        }
      >
        Request storage protection
      </button>
    </>
  );
}
