import V86 from 'v86';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const path = 'public/vm/';
const bytes = (name) => {
  const b = readFileSync(path + name);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const disk = gunzipSync(readFileSync(path + 'rootfs.img.gzip.bin'));
const emulator = new V86({
  wasm_path: path + 'v86.wasm',
  bios: { buffer: bytes('seabios.bin') },
  vga_bios: { buffer: bytes('vgabios.bin') },
  bzimage: { buffer: bytes('vmlinuz') },
  initrd: { buffer: bytes('initramfs.gzip.bin') },
  hda: { buffer: disk.buffer.slice(disk.byteOffset, disk.byteOffset + disk.byteLength) },
  memory_size: 128 * 1024 * 1024,
  uart1: true,
  autostart: true,
  disable_keyboard: true,
  acpi: false,
  cmdline:
    'console=ttyS0,115200 earlyprintk=serial,ttyS0,115200 root=/dev/sda rw init=/init tsc=reliable random.trust_cpu=on mitigations=off',
});
let output = '',
  control = '',
  sent = false;
emulator.add_listener('serial0-output-byte', (byte) => {
  const char = String.fromCharCode(byte);
  output += char;
  process.stdout.write(char);
  if (sent && output.includes('\r\nPOCKET_BOOT_VERIFIED\r\n')) {
    clearTimeout(timer);
    emulator.stop();
    process.exit(output.includes('Alpine Linux') && output.includes('Linux alpine-pocket') ? 0 : 1);
  }
});
emulator.add_listener('serial1-output-byte', (byte) => {
  control += String.fromCharCode(byte);
  if (control.includes('READY') && !sent) {
    sent = true;
    setTimeout(
      () => emulator.serial0_send('uname -a; cat /etc/os-release; echo POCKET_BOOT_VERIFIED\n'),
      1000,
    );
  }
});
const timer = setTimeout(() => {
  emulator.stop();
  console.error('Boot verification timed out.');
  process.exit(1);
}, 180000);
