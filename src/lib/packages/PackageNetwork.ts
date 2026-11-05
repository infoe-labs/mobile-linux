import { packageResource } from './cache';
/** A static repository transport, not an internet gateway. apk verifies Alpine signatures. */
export class PackageNetwork extends EventTarget {
  message = 'Bundled repositories: Go, curl, git and busybox-extras (plus dependencies).';
  missing = new Map<string, string>();
  received = 0;
  total = 0;
  private catalog?: Promise<Map<string, { bytes: number; sha256: string }>>;
  private update(message: string) {
    this.message = message;
    this.dispatchEvent(new Event('change'));
  }
  fetch = async (input: string | URL | Request): Promise<Response> => {
    try {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      );
      if (
        url.hostname !== 'packages.pocket.invalid' ||
        !/^\/(main|community)\/x86\/(APKINDEX\.tar\.gz|[a-zA-Z0-9+_.-]+\.apk)$/.test(
          url.pathname,
        ) ||
        url.search
      )
        return new Response('Only the bundled Alpine package repositories are available.', {
          status: 403,
        });
      const path = url.pathname.slice(1);
      this.catalog ??= packageResource('catalog.json').then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        return new Map(
          data.files.map((file: { path: string; bytes: number; sha256: string }) => [
            file.path,
            file,
          ]),
        );
      });
      const record = (await this.catalog).get(path);
      if (
        !record ||
        !Number.isSafeInteger(record.bytes) ||
        record.bytes < 1 ||
        record.bytes > 128 * 1024 * 1024
      ) {
        if (path.endsWith('.apk'))
          this.missing.set(
            path.split('/').at(-1)!,
            'https://dl-cdn.alpinelinux.org/alpine/v3.23/' + path,
          );
        this.update(
          'This package is not included in the static bundle. Supported packages: go, curl, git, busybox-extras.',
        );
        return new Response(this.message, { status: 404 });
      }
      this.received = 0;
      this.total = record.bytes;
      this.update('Downloading ' + path.split('/').at(-1));
      const response = await packageResource(path);
      if (!response.ok || !response.body) throw new Error();
      const reader = response.body.getReader();
      let received = 0;
      const bytes = new Uint8Array(record.bytes);
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (received + value.length > bytes.length) {
          await reader.cancel();
          throw new Error();
        }
        bytes.set(value, received);
        received += value.length;
        this.received = received;
        this.dispatchEvent(new Event('change'));
      }
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (n) =>
        n.toString(16).padStart(2, '0'),
      ).join('');
      if (received !== record.bytes || hash !== record.sha256) throw new Error();
      this.update('Downloaded; Alpine verifies and installs the package.');
      return new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } });
    } catch {
      this.catalog = undefined;
      this.update(
        'Package download failed or did not match the bundle checksum. Check connection and available memory, then retry apk.',
      );
      return new Response(this.message, { status: 502 });
    }
  };
}
