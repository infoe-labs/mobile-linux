/** COM3 carries encrypted SSH bytes, never shell input or terminal escape triggers. */
export type SSHRequest = { id: string; host: string; port: number };
export function bridgeURL(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'wss:' || url.username || url.password || url.search || url.hash)
    throw new Error('Use a wss:// bridge URL without credentials, query, or fragment.');
  return url.href;
}
export class SSHTransport extends EventTarget {
  request?: SSHRequest;
  state: 'idle' | 'approval' | 'connecting' | 'connected' = 'idle';
  message = '';
  private line = '';
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private queue: Uint8Array[] = [];
  private queued = 0;
  private waiting = false;
  private closing = false;
  private ackTimer?: ReturnType<typeof setTimeout>;
  private send: (line: string) => void;
  constructor(send: (line: string) => void) {
    super();
    this.send = send;
  }
  private changed() {
    this.dispatchEvent(new Event('change'));
  }
  private frame(op: string, data = '', id = this.request?.id) {
    if (id) this.send(`APSSH1\t${id}\t${op}\t${data}\n`);
  }
  accept(byte: number) {
    if (byte === 13) return;
    if (byte !== 10) {
      if (this.line.length >= 2048) {
        this.line = '';
        this.disconnect('SSH transport frame rejected.');
      } else this.line += String.fromCharCode(byte);
      return;
    }
    const [magic, id, op, data = ''] = this.line.split('\t');
    this.line = '';
    if (magic !== 'APSSH1' || !/^[a-f0-9]{32}$/.test(id)) return;
    if (op === 'O') {
      const split = data.lastIndexOf(':');
      const host = data.slice(0, split),
        port = Number(data.slice(split + 1));
      if (
        this.state !== 'idle' ||
        !/^[a-zA-Z0-9:][a-zA-Z0-9.:-]{0,252}$/.test(host) ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535
      ) {
        this.frame('C', '', id);
        return;
      }
      this.request = { id, host, port };
      this.state = 'approval';
      this.message = '';
      this.timer = setTimeout(() => this.disconnect('SSH connection request expired.'), 110000);
      this.changed();
      return;
    }
    if (id !== this.request?.id) return;
    if (op === 'C') {
      this.disconnect();
      return;
    }
    if (this.state !== 'connected') return;
    if (op === 'A') {
      clearTimeout(this.ackTimer);
      this.waiting = false;
      this.drain();
    } else if (op === 'D') {
      try {
        if (!data || data.length > 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error();
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        if (this.socket?.readyState !== 1 || this.socket.bufferedAmount > 1048576)
          throw new Error();
        this.socket.send(bytes);
        this.frame('A');
      } catch {
        this.disconnect('SSH transport interrupted.');
      }
    }
  }
  connect(endpoint: string, token: string) {
    if (this.state !== 'approval' || !this.request) return;
    const url = bridgeURL(endpoint);
    if (!token || token.length > 512) throw new Error('Enter a bridge access token.');
    const socket = new WebSocket(url);
    this.socket = socket;
    clearTimeout(this.timer);
    this.state = 'connecting';
    this.message = '';
    const request = this.request;
    socket.binaryType = 'arraybuffer';
    this.timer = setTimeout(() => this.disconnect('Bridge connection timed out.'), 15000);
    socket.onopen = () => {
      socket.send(JSON.stringify({ token, host: request.host, port: request.port }));
      token = '';
      socket.onopen = null;
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      if (this.state === 'connecting') {
        if (event.data !== '{"ready":true}') {
          this.disconnect('Bridge refused the connection.');
          return;
        }
        clearTimeout(this.timer);
        this.state = 'connected';
        this.frame('Y');
        this.changed();
        return;
      }
      if (
        !(event.data instanceof ArrayBuffer) ||
        event.data.byteLength > 65536 ||
        this.queued + event.data.byteLength > 1048576
      ) {
        this.disconnect('SSH transport capacity exceeded.');
        return;
      }
      const bytes = new Uint8Array(event.data);
      for (let offset = 0; offset < bytes.length; offset += 768) {
        const frame = bytes.slice(offset, offset + 768);
        this.queue.push(frame);
        this.queued += frame.length;
      }
      this.drain();
    };
    socket.onerror = () => this.disconnect('Unable to reach the secure SSH bridge.');
    socket.onclose = () => {
      if (this.state !== 'connected') {
        this.disconnect('Bridge connection closed.');
        return;
      }
      this.closing = true;
      this.drain();
    };
    this.changed();
  }
  private drain() {
    if (this.waiting) return;
    if (!this.queue.length) {
      if (this.closing) this.disconnect('SSH connection closed.');
      return;
    }
    const bytes = this.queue.shift()!;
    this.queued -= bytes.length;
    this.waiting = true;
    this.frame('D', btoa(String.fromCharCode(...bytes)));
    this.ackTimer = setTimeout(() => this.disconnect('SSH guest stopped responding.'), 60000);
  }
  disconnect(message = '') {
    clearTimeout(this.timer);
    clearTimeout(this.ackTimer);
    this.frame('C');
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      socket.close();
    }
    this.request = undefined;
    this.state = 'idle';
    this.message = message;
    this.queue = [];
    this.queued = 0;
    this.waiting = false;
    this.closing = false;
    this.changed();
  }
}
