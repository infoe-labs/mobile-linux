import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { vm } from '../../vm/V86Controller';
import { terminal } from '../../terminal/TerminalController';
export default function SSHConnection() {
  const transport = vm.ssh;
  const [, refresh] = useState(0);
  const [endpoint, setEndpoint] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const update = () => {
      refresh((n) => n + 1);
      if (transport.state === 'idle') {
        setEndpoint('');
        setToken('');
        setError('');
      }
    };
    transport.addEventListener('change', update);
    const unload = () => transport.disconnect();
    window.addEventListener('pagehide', unload);
    return () => {
      transport.removeEventListener('change', update);
      window.removeEventListener('pagehide', unload);
    };
  }, [transport]);
  if (transport.state === 'idle')
    return transport.message ? <p role="status">{transport.message}</p> : null;
  if (transport.state !== 'approval')
    return (
      <div className="flex flex-wrap items-center gap-2 p-2" role="status">
        <span>
          {transport.state === 'connected' ? 'SSH connected' : 'Connecting to SSH bridge…'}
        </span>
        <Button className="" onClick={() => transport.disconnect('SSH disconnected.')}>
          Disconnect SSH
        </Button>
      </div>
    );
  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="ssh-title"
      className="ssh-approval space-y-3 border p-4"
    >
      <h2 id="ssh-title">Allow SSH connection</h2>
      <p>
        Alpine requested {transport.request?.host}:{transport.request?.port}. Connect through a
        bridge you control on that machine.
      </p>
      <p>
        The bridge sees connection metadata. SSH verifies the server and encrypts the session inside
        Alpine. Verify its host-key fingerprint in the terminal.
      </p>
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            transport.connect(endpoint, token);
            setToken('');
            setError('');
            terminal.term.focus();
          } catch {
            setError(
              'Enter a valid wss:// URL without a query or credentials, and a bridge token.',
            );
          }
        }}
      >
        <label>
          SSH bridge URL
          <input
            aria-label="SSH bridge URL"
            type="url"
            required
            placeholder="wss://ssh.example.com:8443/"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          Bridge access token
          <input
            aria-label="Bridge access token"
            type="password"
            required
            maxLength={512}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
        </label>
        <Button className="" type="submit">
          Allow connection
        </Button>
        <Button
          className=""
          type="button"
          onClick={() => transport.disconnect('SSH connection cancelled.')}
        >
          Cancel SSH
        </Button>
      </form>
      <p>
        Bridge settings are kept only for this attempt. SSH host keys and any keys you save in
        Alpine remain on its unencrypted disk and in backups. Phone backgrounding may disconnect the
        session.
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
