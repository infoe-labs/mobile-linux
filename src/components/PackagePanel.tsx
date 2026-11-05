import { useEffect, useState } from 'react';
import { vm } from '../vm/V86Controller';
import { cachePackages, deletePackageCache, prunePackageCache } from '../lib/packages/cache';
export default function PackagePanel() {
  const [, refresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      if (!timer)
        timer = setTimeout(() => {
          timer = undefined;
          refresh((n) => n + 1);
        }, 150);
    };
    vm.packages.addEventListener('change', update);
    void prunePackageCache().catch(() => {});
    const cleanup = setInterval(() => void prunePackageCache().catch(() => {}), 3600000);
    return () => {
      vm.packages.removeEventListener('change', update);
      clearTimeout(timer);
      clearInterval(cleanup);
    };
  }, []);
  return (
    <details className="p-2 text-sm">
      <summary>Packages: Go, curl, git</summary>
      <p>
        Run apk update, then apk add go. Choose 512 MB RAM before booting for Go compilation. Run
        apk update after an app update. The bundle also includes busybox-extras for telnet. Only the
        bundled repositories are available.
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await cachePackages(setMessage);
          } catch {
            setMessage(
              'Package caching failed. Check network and storage; delete the partial cache before retrying.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Download offline bundle (~122 MiB)
      </button>
      <button
        disabled={busy}
        onClick={async () => {
          try {
            await deletePackageCache();
            setMessage('Download cache deleted. Installed guest packages are preserved.');
          } catch {
            setMessage('Cache deletion failed.');
          }
        }}
      >
        Delete package download cache
      </button>
      {message && <p role="status">{message}</p>}
      <p role="status">
        {vm.packages.message}{' '}
        {vm.packages.total > 0 &&
          `${(vm.packages.received / 1048576).toFixed(1)} / ${(vm.packages.total / 1048576).toFixed(1)} MiB`}
      </p>
    </details>
  );
}
