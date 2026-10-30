import Files from './screens/Files';
import Snapshots from './screens/Snapshots';
import Diagnostics from './screens/Diagnostics';
import Assistant from './screens/Assistant';
import { Button } from './components/ui/button';
import { useEffect, useRef, useState } from 'react';
import { vm } from './vm/V86Controller';
import { terminal } from './terminal/TerminalController';
import { CommandDraft } from './terminal/CommandDraft';
import { MobileKeyboard } from './terminal/MobileKeyboard';
import { ai } from './ai/AIManager';
import { pwa } from './lib/pwa';
import { promptInstall, subscribeInstall } from './lib/install';
import { createLocalStore } from './lib/storage';
import { appConfig } from '../app.config';
const preferences = createLocalStore({
  appId: appConfig.appId,
  basePath: import.meta.env.BASE_URL,
  namespace: 'preferences',
  version: 1,
});
function pref<T>(key: string, fallback: T): T {
  try {
    return preferences.get(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function useEvents(target: EventTarget) {
  const [, set] = useState(0);
  useEffect(() => {
    const update = () => set((n) => n + 1);
    target.addEventListener('change', update);
    return () => target.removeEventListener('change', update);
  }, [target]);
}
export default function App() {
  useEvents(vm);
  useEvents(ai);
  useEvents(pwa.events);
  const host = useRef<HTMLDivElement>(null);
  const [panel, setPanelState] = useState('');
  const [fileDirty, setFileDirty] = useState(false);
  const setPanel = (next: string) => {
    if (fileDirty && !confirm('Discard unsaved file edits?')) return;
    setFileDirty(false);
    setPanelState(next);
  };
  const [notice, setNotice] = useState('');
  const [memory, setMemory] = useState(pref('memory', 128));
  const [font, setFont] = useState(pref('font', 14));
  const [theme, setTheme] = useState(pref('theme', 'dark'));
  const [search, setSearch] = useState('');
  const [extra, setExtra] = useState(true);
  const [compose, setCompose] = useState(false);
  const [install, setInstall] = useState({ canPrompt: false, installed: false });
  const act = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Operation failed. Data has been preserved.');
    }
  };
  useEffect(() => {
    terminal.mount(host.current!);
    const observer = new ResizeObserver(() => terminal.resize());
    observer.observe(host.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    terminal.term.options.fontSize = font;
    terminal.resize();
    try {
      preferences.set('font', font, { ttlMs: null });
    } catch {
      /* preferences are optional */
    }
  }, [font]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    terminal.term.options.theme =
      theme === 'light'
        ? { background: '#f5f7f7', foreground: '#182c34', cursor: '#147c61' }
        : { background: '#10161b', foreground: '#d5dfe5', cursor: '#8dd8bd' };
    try {
      preferences.set('theme', theme, { ttlMs: null });
    } catch {
      /* optional */
    }
  }, [theme]);
  useEffect(() => subscribeInstall(setInstall), []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      document.documentElement.style.setProperty(
        '--app-height',
        `${viewport?.height ?? window.innerHeight}px`,
      );
      terminal.resize();
    };
    resize();
    viewport?.addEventListener('resize', resize);
    return () => viewport?.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (fileDirty || ['running', 'saving', 'restoring'].includes(vm.state)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [fileDirty]);
  return (
    <main className="app">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          aria-label="Alpine Pocket terminal"
          onClick={() => setPanel('')}
        >
          <span className="mountain">Λ</span>
          <span>
            alpine<span className="muted"> pocket</span>
          </span>
        </a>
        <span className={'status ' + (vm.state === 'running' ? 'live' : '')}>
          {vm.state === 'running' ? '● local' : vm.state}
        </span>
        <div className="top-actions">
          <button
            aria-label="Search terminal"
            onClick={() => setPanel(panel === 'search' ? '' : 'search')}
          >
            ⌕
          </button>
          <button
            aria-label="System settings"
            onClick={() => setPanel(panel === 'System' ? '' : 'System')}
          >
            ☷
          </button>
        </div>
      </header>
      {notice && (
        <div role="alert" className="notice">
          {notice}
          <button onClick={() => setNotice('')} aria-label="Dismiss message">
            ×
          </button>
        </div>
      )}
      {pwa.update && (
        <div className="notice">
          App update available. Pause Linux and unload AI first.
          <button
            disabled={vm.state !== 'paused' || ai.state !== 'unloaded' || fileDirty}
            onClick={() => act(() => pwa.applyUpdate())}
          >
            Update & reload
          </button>
        </div>
      )}
      {panel === 'search' && (
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            terminal.search.findNext(search);
          }}
        >
          <input
            autoFocus
            placeholder="Search terminal output"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button>Find next</button>
          <button type="button" onClick={() => setPanel('')}>
            Close
          </button>
        </form>
      )}
      <section className="workspace" aria-label="Linux terminal workspace">
        <div ref={host} className="terminal" data-testid="terminal" />
        {vm.state === 'uninitialized' && (
          <div className="welcome">
            <div className="eyebrow">A COMPUTER THAT GOES WITH YOU</div>
            <h1>
              Alpine Linux.
              <br />
              In your pocket.
            </h1>
            <p>
              A real kernel. Your own filesystem.
              <br />
              Entirely in this browser.
            </p>
            <Button className="primary" onClick={() => act(() => vm.start(memory))}>
              Boot Alpine <span>↗</span>
            </Button>
            <small>
              About 19 MB of boot assets · {memory} MB guest RAM
              <br />
              No guest internet connection. No account.
            </small>
          </div>
        )}
        {['downloading', 'preparing', 'booting'].includes(vm.state) && (
          <div className="boot-banner" role="status">
            {vm.message}
            {vm.state === 'downloading' && <progress max="100" value={vm.progress} />}
          </div>
        )}
        {vm.state === 'failed' && (
          <div className="boot-banner error" role="alert">
            {vm.message}
            <button onClick={() => location.reload()}>Reload to retry</button>
          </div>
        )}
        {vm.state === 'paused' && (
          <div className="paused">
            Linux is paused <button onClick={() => vm.resume()}>Resume</button>
          </div>
        )}
      </section>
      {compose && <CommandDraft />}
      <div className="terminal-tools">
        <button aria-pressed={compose} onClick={() => setCompose(!compose)}>
          Compose
        </button>
        <button onClick={() => act(() => terminal.copy())}>Copy selection</button>
        <button onClick={() => act(() => terminal.paste())}>Paste</button>
        <button title="Use real ash completion" onClick={() => terminal.key('\t')}>
          Complete ↹
        </button>
        <button aria-pressed={extra} onClick={() => setExtra(!extra)}>
          Keys {extra ? '⌄' : '⌃'}
        </button>
      </div>
      {extra && <MobileKeyboard />}
      <nav className="navigation" aria-label="Workspace navigation">
        {['Terminal', 'Files', 'Assistant', 'System'].map((item, i) => (
          <button
            key={item}
            aria-current={panel === item || (!panel && i === 0) ? 'page' : undefined}
            onClick={() => {
              setPanel(item === 'Terminal' ? '' : panel === item ? '' : item);
            }}
          >
            <span aria-hidden="true">{['›_', '▤', '✳', '⚙'][i]}</span>
            {item}
          </button>
        ))}
      </nav>
      {['Files', 'Assistant', 'System'].includes(panel) && (
        <div className="scrim" onClick={() => setPanel('')}>
          <section
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={panel}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setPanel('');
              if (e.key === 'Tab') {
                const nodes = [
                  ...e.currentTarget.querySelectorAll<HTMLElement>(
                    'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]',
                  ),
                ];
                const first = nodes[0],
                  last = nodes.at(-1);
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>{panel}</h2>
              <button autoFocus aria-label="Close panel" onClick={() => setPanel('')}>
                ×
              </button>
            </header>
            {panel === 'Files' && <Files act={act} onDirty={setFileDirty} />}
            {panel === 'Assistant' && <Assistant act={act} />}
            {panel === 'System' && (
              <div className="panel-body">
                <h3>Machine</h3>
                <p className="muted">{vm.message}</p>
                <div className="row">
                  <button disabled={vm.state !== 'running'} onClick={() => act(() => vm.pause())}>
                    Pause & sync
                  </button>
                  <button disabled={vm.state !== 'paused'} onClick={() => vm.resume()}>
                    Resume
                  </button>
                  <button
                    disabled={!['running', 'paused'].includes(vm.state)}
                    onClick={() => {
                      if (
                        confirm(
                          'Stop Linux? Guest disk is synced first; unsaved editor buffers will be lost.',
                        )
                      )
                        void act(() => vm.stop());
                    }}
                  >
                    Stop
                  </button>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          'Restart from the persistent disk? Unsaved editor buffers will be lost.',
                        )
                      )
                        void act(async () => {
                          if (vm.state === 'running') await vm.pause();
                          if (vm.state === 'paused') await vm.stop();
                          location.reload();
                        });
                    }}
                  >
                    Restart
                  </button>
                </div>
                <label>
                  Guest RAM{' '}
                  <select
                    value={memory}
                    disabled={vm.state !== 'uninitialized'}
                    onChange={(e) => {
                      setMemory(Number(e.target.value));
                      try {
                        preferences.set('memory', Number(e.target.value), { ttlMs: null });
                      } catch {
                        /* optional */
                      }
                    }}
                  >
                    {[96, 128, 192, 256].map((n) => (
                      <option key={n} value={n}>
                        {n} MB
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Terminal font{' '}
                  <input
                    type="range"
                    min="11"
                    max="24"
                    value={font}
                    onChange={(e) => setFont(Number(e.target.value))}
                  />
                  <span>{font}px</span>
                </label>
                <label>
                  Appearance{' '}
                  <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                    <option>dark</option>
                    <option>light</option>
                  </select>
                </label>
                <Snapshots act={act} />
                <Diagnostics act={act} />
                <h3>Erase guest data</h3>
                <button
                  className="danger"
                  disabled={!['running', 'paused'].includes(vm.state)}
                  onClick={() => {
                    if (
                      confirm(
                        'Permanently erase the entire Linux disk? Snapshots and other apps are preserved. Export a backup first.',
                      )
                    )
                      void act(async () => {
                        if (vm.state === 'running') await vm.pause();
                        await vm.stop();
                        await vm.disk!.reset();
                        location.reload();
                      });
                  }}
                >
                  Reset guest disk
                </button>
                <h3>Install & offline</h3>
                <p>
                  {pwa.ready
                    ? 'App shell cached. Boot assets are cached with this build.'
                    : 'App shell not yet cached. Complete an online visit to the production build.'}
                </p>
                {!install.installed && (
                  <>
                    <button
                      disabled={!install.canPrompt}
                      onClick={() => act(() => promptInstall())}
                    >
                      Install app
                    </button>
                    <p>
                      iPhone: Safari → Share → Add to Home Screen. Android: Chrome menu → Install
                      app.
                    </p>
                  </>
                )}
                <h3>Privacy & licenses</h3>
                <p>
                  Commands and files stay in this browser. AI is optional; downloading a model
                  contacts Hugging Face. No guest network, analytics, remote shell, or inference
                  service.
                </p>
                <p>
                  Disk and snapshots remain until deleted or browser eviction. Storage is
                  unencrypted and shared with this origin’s other apps. Export backups regularly.
                </p>
                <a
                  href={import.meta.env.BASE_URL + 'sources/index.html'}
                  target="_blank"
                  rel="noreferrer"
                >
                  Corresponding sources
                </a>{' '}
                ·{' '}
                <a
                  href={import.meta.env.BASE_URL + 'THIRD_PARTY_NOTICES.md'}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open source notices
                </a>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
