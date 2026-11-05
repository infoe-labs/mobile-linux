import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createBridge } from './server.mjs';

test('TLS bridge enforces origin, token and fixed destination, forwarding only binary bytes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pocket-bridge-test-'));
  let dials = 0;
  const tcp = createServer((socket) => {
    dials++;
    socket.on('error', () => {});
    socket.pipe(socket);
  });
  tcp.listen(0, '127.0.0.1');
  await once(tcp, 'listening');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      join(dir, 'key'),
      '-out',
      join(dir, 'cert'),
      '-days',
      '1',
      '-subj',
      '/CN=bridge.example.test',
    ],
    { stdio: 'ignore' },
  );
  const token = 'synthetic-test-token-0000000000000000';
  const origin = 'https://app.example.test';
  const port = tcp.address().port;
  const { server, wss } = createBridge({
    key: readFileSync(join(dir, 'key')),
    cert: readFileSync(join(dir, 'cert')),
    origin,
    token,
    host: 'ssh.example.test',
    port,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `wss://127.0.0.1:${server.address().port}/`;
  const open = async (allowedOrigin = origin) => {
    const ws = new WebSocket(url, { origin: allowedOrigin, rejectUnauthorized: false });
    await once(ws, 'open');
    return ws;
  };
  try {
    await assert.rejects(open('https://untrusted.example.test'));
    for (const request of [
      { token: 'wrong', host: 'ssh.example.test', port },
      { token, host: 'other.example.test', port },
    ]) {
      const ws = await open();
      const closed = once(ws, 'close');
      ws.send(JSON.stringify(request));
      await closed;
    }
    assert.equal(dials, 0);
    const ws = await open();
    let reply = once(ws, 'message');
    ws.send(JSON.stringify({ token, host: 'ssh.example.test', port }));
    assert.equal((await reply)[0].toString(), '{"ready":true}');
    reply = once(ws, 'message');
    const bytes = Buffer.from([0, 1, 255, 10]);
    ws.send(bytes);
    assert.deepEqual((await reply)[0], bytes);
    assert.equal(dials, 1);
    const closed = once(ws, 'close');
    ws.send('not-binary');
    await closed;
  } finally {
    for (const ws of wss.clients) ws.terminate();
    await new Promise((resolve) => wss.close(resolve));
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => tcp.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
