import { useEffect, useRef, useState } from 'react';
import { importAPKs } from '../lib/packages/import';
import { terminal } from '../terminal/TerminalController';
import { vm } from '../vm/V86Controller';
import { cachePackages, deletePackageCache, prunePackageCache } from '../lib/packages/cache';
export default function PackagePanel() {
  const [prompt, setPrompt] = useState(false);
  const seenMissing = useRef(0);
  const [, refresh] = useState(0);
  const [imported, setImported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      if (vm.packages.missing.size > seenMissing.current) {
        seenMissing.current = vm.packages.missing.size;
        setPrompt(true);
      }
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
    <details
      className={prompt ? 'package-request p-4 text-sm' : 'p-2 text-sm'}
      open={prompt || undefined}
      role={prompt ? 'dialog' : undefined}
      aria-labelledby={prompt ? 'package-request-title' : undefined}
    >
      <summary>Packages: Go, curl, git</summary>
      {prompt && (
        <div>
          <h2 id="package-request-title">Packages need downloading</h2>
          <p>
            Alpine could not fetch these archives. Download them in your browser, choose the files
            below, then install them in Alpine.
          </p>
          <button autoFocus onClick={() => setPrompt(false)}>
            Back to terminal
          </button>
        </div>
      )}
      {vm.packages.missing.size > 0 && (
        <section aria-label="Missing package downloads">
          <p>
            These packages are outside the bundle. Download them, then select the downloaded files
            below. Include their dependencies.
          </p>
          {[...vm.packages.missing].map(([name, url]) => (
            <p key={name}>
              <a href={url} target="_blank" rel="noopener noreferrer">
                Download {name}
              </a>
            </p>
          ))}
        </section>
      )}
      <label>
        Import downloaded APK files
        <input
          aria-label="Import downloaded APK files"
          type="file"
          accept=".apk"
          multiple
          disabled={busy || vm.state !== 'running'}
          onChange={async (event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (!files.length) return;
            setBusy(true);
            try {
              await importAPKs(vm.bridge!, files, setMessage);
              setImported(true);
              setMessage('APKs imported. Install them below; Alpine checks their signatures.');
            } catch {
              setMessage(
                'Import failed. Check guest disk space and restart Alpine with the updated app if necessary.',
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {imported && (
        <button
          disabled={busy || vm.state !== 'running'}
          onClick={() => terminal.send('apk add --no-network /root/.pocket-apks/*.apk\r')}
        >
          Install imported APKs in terminal
        </button>
      )}
      <p>
        Browser downloads stay in your device Downloads folder. Imported archives stay in
        /root/.pocket-apks; remove them after installation when no longer needed.
      </p>
      <p>
        Run apk update, then apk add go. Choose 512 MB RAM before booting for Go compilation. Run
        apk update after an app update. The bundle also includes busybox-extras for telnet. Node.js
        and npm are bundled too: run apk add --no-cache nodejs npm. Only the bundled repositories
        are available.
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
        Download offline bundle (~146 MiB)
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
