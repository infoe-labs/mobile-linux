import { useEffect, useState } from 'react';
import { downloads } from '../lib/downloads/requests';
import { importFiles } from '../lib/packages/import';
import { vm } from '../vm/V86Controller';
export default function BrowserDownload() {
  const [url, setURL] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const changed = () => {
      setURL(downloads.url);
      setMessage('');
    };
    downloads.addEventListener('change', changed);
    return () => downloads.removeEventListener('change', changed);
  }, []);
  if (!url) return null;
  const parsed = new URL(url);
  const repository =
    parsed.hostname === 'github.com' && /^\/[\w.-]+\/[\w.-]+(?:\.git)?\/?$/.test(parsed.pathname);
  const source = repository
    ? parsed.origin + parsed.pathname.replace(/(?:\.git)?\/?$/, '') + '/archive/HEAD.tar.gz'
    : url;
  const transfer = async (files: File[]) => {
    if (!vm.bridge || vm.state !== 'running') throw new Error('Boot Linux before importing.');
    const safe = files.map(
      (file) =>
        new File(
          [file],
          file.name.replace(/[^a-zA-Z0-9+_.-]/g, '_').replace(/^[^a-zA-Z0-9]+/, '') ||
            'download.bin',
        ),
    );
    const paths = await importFiles(vm.bridge, safe, setMessage, '/root/Downloads');
    setMessage('Imported into Alpine: ' + paths.join(', '));
  };
  return (
    <section className="package-request p-4" role="dialog" aria-labelledby="browser-download-title">
      <h2 id="browser-download-title">Allow browser download</h2>
      <p>
        Linux requested an HTTPS resource. Approve a browser fetch or download it yourself, then
        select the saved file.
      </p>
      <p className="break-all">{source}</p>
      {repository && <p>This downloads a source archive without Git history or submodules.</p>}
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const response = await fetch(source, {
              credentials: 'omit',
              redirect: 'error',
              cache: 'no-store',
              signal: AbortSignal.timeout(60000),
            });
            if (!response.ok || !response.body) throw new Error();
            const reader = response.body.getReader();
            const chunks: ArrayBuffer[] = [];
            let size = 0;
            try {
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                size += value.length;
                if (size > 128 * 1048576) throw new Error();
                chunks.push(value.slice().buffer);
                setMessage(`Downloading ${size} bytes`);
              }
            } finally {
              await reader.cancel().catch(() => {});
            }
            await transfer([
              new File(
                chunks,
                repository
                  ? 'source.tar.gz'
                  : new URL(source).pathname.split('/').at(-1) || 'download.bin',
              ),
            ]);
          } catch {
            setMessage(
              'Browser fetch failed or was blocked by CORS. Use the download link, then select the saved file. Check guest disk space if import failed.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Fetch and import into Alpine
      </button>
      <p>
        <a href={source} target="_blank" rel="noopener noreferrer">
          Download in browser
        </a>
      </p>
      <label>
        Import downloaded files
        <input
          aria-label="Import browser downloaded files"
          type="file"
          multiple
          disabled={busy}
          onChange={async (event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (!files.length) return;
            setBusy(true);
            try {
              await transfer(files);
            } catch {
              setMessage('Import failed. Check file size, guest disk space, and Linux state.');
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <p>
        Files stay in /root/Downloads and device Downloads until you delete them. Original commands
        remain failed; inspect imported files before using them.
      </p>
      <p role="status">{message}</p>
      <button disabled={busy} onClick={() => downloads.clear()}>
        Close download request
      </button>
    </section>
  );
}
