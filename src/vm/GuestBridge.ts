import { requestLine, type Operation } from './protocol.ts';
export class GuestBridge {
  ready = false;
  private line = '';
  private next = 1;
  private pending = new Map<
    number,
    {
      resolve: (s: string) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private send: (text: string) => void;
  private onReady: () => void;
  constructor(send: (text: string) => void, onReady: () => void) {
    this.send = send;
    this.onReady = onReady;
  }
  accept(byte: number) {
    if (byte === 13) return;
    if (byte !== 10) {
      if (this.line.length < 2800000) this.line += String.fromCharCode(byte);
      else this.line = '';
      return;
    }
    const [magic, id, status, payload = ''] = this.line.split('\t');
    this.line = '';
    if (magic !== 'AP1' || !/^\d+$/.test(id)) return;
    if (id === '0' && status === 'READY' && payload === '1') {
      this.ready = true;
      this.onReady();
      return;
    }
    const p = this.pending.get(Number(id));
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(Number(id));
    if (status === 'OK') p.resolve(payload);
    else p.reject(new Error('Guest operation failed. Check permissions, path, and file size.'));
  }
  request(op: Operation, path = '/', data = '', signal?: AbortSignal): Promise<string> {
    if (!this.ready) return Promise.reject(new Error('Guest bridge is not ready.'));
    if (signal?.aborted) return Promise.reject(new Error('Request cancelled.'));
    const id = this.next++,
      line = requestLine(id, op, path, data);
    return new Promise((resolve, reject) => {
      const cancel = () => {
        const p = this.pending.get(id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(id);
        clean();
        reject(new Error('Guest request cancelled or timed out.'));
      };
      const timer = setTimeout(cancel, 45000);
      signal?.addEventListener('abort', cancel, { once: true });
      const clean = () => signal?.removeEventListener('abort', cancel);
      this.pending.set(id, {
        timer,
        resolve: (s) => {
          clean();
          resolve(s);
        },
        reject: (e) => {
          clean();
          reject(e);
        },
      });
      this.send(line);
    });
  }
  dispose() {
    this.ready = false;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('VM stopped.'));
    }
    this.pending.clear();
  }
}
