import { createServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

// Fixed destination only: never turn a browser-supplied hostname into a TCP dial.
export function createBridge({ cert, key, origin, token, host, port = 22, tcpHost = '127.0.0.1' }) {
  if (
    !origin ||
    new URL(origin).origin !== origin ||
    !host ||
    !token ||
    token.length < 32 ||
    token.length > 512 ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw new Error('Invalid bridge configuration.');
  const server = createServer({ cert, key }, (_req, res) => {
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    if (req.headers.origin !== origin || req.url !== '/' || wss.clients.size >= 8) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });
  wss.on('connection', (ws) => {
    let tcp,
      authenticated = false,
      ready = false;
    const timeout = setTimeout(() => ws.close(1008), 10000);
    const lifetime = setTimeout(() => ws.close(1000), 8 * 60 * 60 * 1000);
    const pressure = setInterval(() => {
      if (ws.bufferedAmount > 1048576) ws.close(1008);
      else if (ready && ws.bufferedAmount < 65536) tcp?.resume();
    }, 50);
    const close = () => {
      clearTimeout(timeout);
      clearTimeout(lifetime);
      clearInterval(pressure);
      tcp?.destroy();
    };
    ws.on('error', close);
    ws.on('close', close);
    ws.on('message', (data, binary) => {
      if (!authenticated) {
        try {
          if (binary || data.length > 2048) throw new Error();
          const request = JSON.parse(data.toString());
          const supplied = Buffer.from(typeof request.token === 'string' ? request.token : '');
          const expected = Buffer.from(token);
          if (
            supplied.length !== expected.length ||
            !timingSafeEqual(supplied, expected) ||
            request.host !== host ||
            request.port !== port
          )
            throw new Error();
          authenticated = true;
          tcp = connect({ host: tcpHost, port });
          tcp.setTimeout(15 * 60 * 1000, () => ws.close(1000));
          tcp.on('connect', () => {
            clearTimeout(timeout);
            ready = true;
            ws.send('{"ready":true}');
          });
          tcp.on('data', (bytes) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            ws.send(bytes, { binary: true });
            if (ws.bufferedAmount > 65536) tcp.pause();
          });
          tcp.on('error', () => ws.close(1011));
          tcp.on('close', () => ws.close(1000));
        } catch {
          ws.close(1008);
        }
      } else {
        if (!ready || !binary || tcp.writableLength + data.length > 1048576) {
          ws.close(1008);
          return;
        }
        tcp.write(data);
      }
    });
  });
  return { server, wss };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { server } = createBridge({
      cert: readFileSync(process.env.BRIDGE_CERT_FILE),
      key: readFileSync(process.env.BRIDGE_KEY_FILE),
      token: readFileSync(process.env.BRIDGE_TOKEN_FILE, 'utf8').trim(),
      origin: process.env.BRIDGE_ORIGIN,
      host: process.env.BRIDGE_SSH_HOST,
      port: Number(process.env.BRIDGE_SSH_PORT || 22),
      tcpHost: process.env.BRIDGE_TCP_HOST || '127.0.0.1',
    });
    server.on('error', () => {
      console.error('Bridge listener failed.');
      process.exitCode = 1;
    });
    server.listen(
      Number(process.env.BRIDGE_PORT || 8443),
      process.env.BRIDGE_BIND || '127.0.0.1',
      () => console.log('SSH bridge ready.'),
    );
  } catch {
    console.error('Bridge configuration failed. Check local settings and TLS files.');
    process.exitCode = 1;
  }
}
