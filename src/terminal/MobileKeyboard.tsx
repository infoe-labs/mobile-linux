import { useEffect, useState } from 'react';
import { terminal } from './TerminalController';
export function MobileKeyboard() {
  const [, render] = useState(0);
  useEffect(() => {
    const update = () => render((n) => n + 1);
    terminal.addEventListener('modifiers', update);
    return () => terminal.removeEventListener('modifiers', update);
  }, []);
  return (
    <div className="keyboard" aria-label="Terminal accessory keys">
      {(['ctrl', 'alt', 'shift'] as const).map((key) => (
        <button
          key={key}
          aria-pressed={terminal[key]}
          onClick={() => {
            terminal[key] = !terminal[key];
            render((n) => n + 1);
          }}
        >
          {key}
        </button>
      ))}
      {Object.entries({
        Esc: '\x1b',
        Tab: '\t',
        '←': '\x1b[D',
        '↓': '\x1b[B',
        '↑': '\x1b[A',
        '→': '\x1b[C',
        '⌫': '\x7f',
        '↵': '\r',
        '/': '/',
        '|': '|',
        '~': '~',
        '-': '-',
        _: '_',
        ';': ';',
        '&': '&',
      }).map(([label, value]) => (
        <button
          key={label}
          aria-label={
            (
              {
                '⌫': 'Backspace',
                '↵': 'Enter',
                '←': 'Left',
                '→': 'Right',
                '↑': 'Up',
                '↓': 'Down',
              } as Record<string, string>
            )[label] || label
          }
          onClick={() => {
            terminal.key(value);
            render((n) => n + 1);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
