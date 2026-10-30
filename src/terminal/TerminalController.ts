import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { safeInsertion } from './input';
import { vm } from '../vm/V86Controller';
export class TerminalController extends EventTarget {
  readonly term = new Terminal({
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 14,
    screenReaderMode: true,
    scrollback: 4000,
    cursorBlink: true,
    allowProposedApi: false,
    theme: {
      background: '#10161b',
      foreground: '#d5dfe5',
      cursor: '#8dd8bd',
      selectionBackground: '#36554e',
    },
  });
  readonly fit = new FitAddon();
  readonly search = new SearchAddon();
  ctrl = false;
  alt = false;
  shift = false;
  private attached = false;
  constructor() {
    super();
    this.term.loadAddon(this.fit);
    this.term.loadAddon(this.search);
    vm.subscribeOutput((data) => this.term.write(data));
    this.term.onData((data) => this.send(data));
    this.term.onResize(({ rows, cols }) => void vm.resize(rows, cols).catch(() => {}));
    vm.addEventListener('change', () => {
      if (vm.state === 'running') void vm.resize(this.term.rows, this.term.cols).catch(() => {});
    });
    this.term.attachCustomKeyEventHandler((event) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'KeyC') {
        if (event.type === 'keydown') void this.copy();
        return false;
      }
      return true;
    });
  }
  mount(element: HTMLElement) {
    if (!this.attached) {
      this.term.open(element);
      this.attached = true;
    }
    this.fit.fit();
  }
  resize() {
    try {
      this.fit.fit();
    } catch {
      /* hidden terminal */
    }
  }
  send(data: string) {
    if (this.shift && data.length === 1) data = data.toUpperCase();
    if (this.ctrl && data.length === 1) {
      const code = data.toUpperCase().charCodeAt(0);
      if (code >= 64 && code <= 95) data = String.fromCharCode(code - 64);
      else if (data === ' ') data = '\0';
    }
    if (this.alt) data = '\x1b' + data;
    this.ctrl = this.alt = this.shift = false;
    this.dispatchEvent(new Event('modifiers'));
    vm.send(data);
  }
  key(data: string) {
    this.send(data);
    this.term.focus();
  }
  async copy() {
    const text = this.term.getSelection();
    if (text) await navigator.clipboard.writeText(text);
  }
  async paste() {
    this.term.paste(await navigator.clipboard.readText());
    this.term.focus();
  }
  insert(text: string) {
    this.term.paste(safeInsertion(text));
    this.term.focus();
  }
}
export const terminal = new TerminalController();
