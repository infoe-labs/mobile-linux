import { V86 } from 'v86';
import { PersistentDisk } from '../storage/PersistentDisk';
import { GuestBridge } from './GuestBridge';
import { canTransition, type VMState } from './state';
import { createIndexedStore } from '../lib/storage.js';
import { appConfig } from '../../app.config.js';
export const RUNTIME = '0.5.472';
const base = import.meta.env.BASE_URL + 'vm/';
export const snapshots = createIndexedStore({
  appId: appConfig.appId,
  basePath: import.meta.env.BASE_URL,
  namespace: 'snapshots',
  version: 1,
});
export type Snapshot = {
  format: 1;
  runtime: string;
  image: string;
  memory: number;
  name: string;
  date: number;
  state: ArrayBuffer;
  disk: ArrayBuffer;
};
export class V86Controller extends EventTarget {
  state: VMState = 'uninitialized';
  message = 'Your private Linux workspace.';
  progress = 0;
  emulator?: V86;
  disk?: PersistentDisk;
  bridge?: GuestBridge;
  memory = 128;
  image = '';
  startedAt = 0;
  bootMs = 0;
  private bootTimer?: ReturnType<typeof setTimeout>;
  private output = new Set<(data: Uint8Array) => void>();
  private buffered: number[] = [];
  private lockRelease?: () => void;
  subscribeOutput(fn: (data: Uint8Array) => void) {
    this.output.add(fn);
    return () => this.output.delete(fn);
  }
  private status(state: VMState, message: string) {
    if (this.state !== state && !canTransition(this.state, state))
      throw new Error('Invalid VM transition.');
    this.state = state;
    this.message = message;
    this.dispatchEvent(new Event('change'));
  }
  private fail(message: string) {
    clearTimeout(this.bootTimer);
    this.emulator?.stop();
    this.status('failed', message);
  }
  async start(memory: number) {
    if (this.state !== 'uninitialized') return;
    try {
      if (!navigator.locks)
        throw new Error('This browser lacks Web Locks required for safe disk ownership.');
      let acquired!: () => void;
      const held = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      await new Promise<void>((resolve, reject) => {
        navigator.locks
          .request(
            `alpine-pocket:${import.meta.env.BASE_URL}:vm`,
            { ifAvailable: true },
            async (lock) => {
              if (!lock) {
                reject(new Error('Another tab owns this VM. Close it before starting.'));
                return;
              }
              this.lockRelease = acquired;
              resolve();
              await held;
            },
          )
          .catch(reject);
      });
      this.memory = memory;
      this.status('downloading', 'Checking local boot assets…');
      const manifest = await fetch(base + 'assets.json').then((r) => {
        if (!r.ok) throw new Error('Build VM assets first (npm run assets).');
        return r.json();
      });
      this.image = manifest.image;
      const assets: Record<string, ArrayBuffer> = {};
      const names = Object.keys(manifest.assets);
      for (const [i, name] of names.entries()) {
        const response = await fetch(base + name);
        if (!response.ok)
          throw new Error('Boot asset unavailable. Complete installation online first.');
        const data = await response.arrayBuffer();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), (n) =>
          n.toString(16).padStart(2, '0'),
        ).join('');
        if (hash !== manifest.assets[name].sha256)
          throw new Error('Boot asset checksum mismatch. Reinstall app assets; disk is preserved.');
        assets[name] = data;
        this.progress = Math.round(((i + 1) / names.length) * 100);
        this.dispatchEvent(new Event('change'));
      }
      this.status('preparing', 'Opening the persistent Alpine disk…');
      const seed = await new Response(
        new Blob([assets['rootfs.img.gzip.bin']])
          .stream()
          .pipeThrough(new DecompressionStream('gzip')),
      ).arrayBuffer();
      this.disk = await PersistentDisk.open(seed, this.image, () =>
        this.fail('Disk write failed. VM paused; storage may be full. Export a recovery backup.'),
      );
      this.bridge = new GuestBridge(
        (text) => this.emulator?.serial_send_bytes(1, new TextEncoder().encode(text)),
        () => {
          clearTimeout(this.bootTimer);
          this.bootMs = performance.now() - this.startedAt;
          if (this.state === 'booting') this.status('running', 'Alpine is ready.');
        },
      );
      this.startedAt = performance.now();
      this.emulator = new V86({
        wasm_path: base + 'v86.wasm',
        memory_size: memory * 1024 * 1024,
        vga_memory_size: 1024 * 1024,
        bios: { buffer: assets['seabios.bin'] },
        vga_bios: { buffer: assets['vgabios.bin'] },
        bzimage: { buffer: assets.vmlinuz },
        initrd: { buffer: assets['initramfs.gzip.bin'] },
        hda: this.disk as any,
        cmdline:
          'quiet loglevel=3 console=ttyS0,115200 earlyprintk=serial,ttyS0,115200 root=/dev/sda rw init=/init tsc=reliable random.trust_cpu=on mitigations=off',
        uart1: true,
        autostart: false,
        disable_keyboard: true,
        disable_mouse: true,
        acpi: false,
      });
      this.emulator.add_listener('serial0-output-byte', (byte: number) => {
        this.buffered.push(byte);
        if (this.buffered.length === 1)
          queueMicrotask(() => {
            const chunk = new Uint8Array(this.buffered);
            this.buffered = [];
            for (const fn of this.output) fn(chunk);
          });
      });
      this.emulator.add_listener('serial1-output-byte', (byte: number) =>
        this.bridge?.accept(byte),
      );
      this.emulator.add_listener('emulator-loaded', () => {
        this.status('booting', 'Booting the Linux kernel…');
        this.emulator!.run();
      });
      this.bootTimer = setTimeout(
        () => this.fail('Guest readiness timed out. Disk preserved; reload to retry.'),
        180000,
      );
    } catch (error) {
      this.fail(
        error instanceof Error
          ? error.message
          : 'VM allocation or boot failed. Try less guest RAM.',
      );
      this.lockRelease?.();
    }
  }
  send(data: string) {
    if (this.state === 'running')
      this.emulator?.serial_send_bytes(0, new TextEncoder().encode(data));
  }
  async pause() {
    if (this.state !== 'running') return;
    await this.bridge!.request('SYNC');
    await this.emulator!.stop();
    await this.disk!.flush();
    this.status('paused', 'VM paused. Guest disk writes committed.');
  }
  resume() {
    if (this.state !== 'paused') return;
    this.emulator!.run();
    this.status('running', 'Alpine is ready.');
  }
  async stop() {
    if (this.state === 'running') await this.pause();
    if (this.state !== 'paused') return;
    this.bridge?.dispose();
    this.status('stopped', 'VM stopped. Reload to boot from disk.');
  }
  async snapshot(name: string) {
    if (this.state === 'running') await this.pause();
    if (this.state !== 'paused') throw new Error('Pause VM before saving.');
    this.status('saving', 'Saving disk and machine state…');
    try {
      const state = await this.emulator!.save_state();
      await this.disk!.flush();
      const snap: Snapshot = {
        format: 1,
        runtime: RUNTIME,
        image: this.image,
        memory: this.memory,
        name: name.slice(0, 80),
        date: Date.now(),
        state,
        disk: this.disk!.buffer.slice(0),
      };
      const index = ((await snapshots.get('index')) as string[] | undefined) ?? [];
      const id = crypto.randomUUID();
      await snapshots.set(id, snap, { ttlMs: null });
      await snapshots.set(
        id + ':meta',
        { name: snap.name, date: snap.date, bytes: state.byteLength + snap.disk.byteLength },
        { ttlMs: null },
      );
      await snapshots.set('index', [...index, id], { ttlMs: null });
      this.status('paused', 'Snapshot saved. Resume when ready.');
      return id;
    } catch {
      this.status('paused', 'Snapshot failed. Previous snapshots preserved.');
      throw new Error('Snapshot could not be saved.');
    }
  }
  async restore(snap: Snapshot) {
    if (this.state === 'running') await this.pause();
    if (this.state !== 'paused') throw new Error('Start and pause VM before restoring.');
    if (
      snap.format !== 1 ||
      snap.runtime !== RUNTIME ||
      snap.image !== this.image ||
      snap.memory !== this.memory ||
      !(snap.state instanceof ArrayBuffer) ||
      !(snap.disk instanceof ArrayBuffer) ||
      snap.disk.byteLength !== this.disk!.byteLength
    )
      throw new Error('Incompatible snapshot. Match image, runtime, and guest RAM.');
    this.status('restoring', 'Restoring snapshot…');
    try {
      await this.emulator!.restore_state(snap.state);
      await this.disk!.replace(snap.disk);
      this.status('paused', 'Snapshot restored. Resume when ready.');
    } catch {
      this.fail('Restore failed. Reload before using VM; export backups if needed.');
      throw new Error('Snapshot restore failed.');
    }
  }
  async resize(rows: number, cols: number) {
    if (this.state === 'running') await this.bridge?.request('RESIZE', '/', `${rows},${cols}`);
  }
}
export const vm = new V86Controller();
