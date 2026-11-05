import test from 'node:test';
import assert from 'node:assert/strict';
import { SSHTransport, bridgeURL } from '../src/lib/ssh/SSHTransport.ts';
const id = 'a'.repeat(32);
function frame(transport, op, data = '', session = id) {
  for (const byte of new TextEncoder().encode(`APSSH1\t${session}\t${op}\t${data}\n`))
    transport.accept(byte);
}
test('SSH requires explicit approval, validates destination, and expires/cancels without a socket', () => {
  const sent = [],
    transport = new SSHTransport((line) => sent.push(line));
  frame(transport, 'O', 'ssh.example.test:22');
  assert.equal(transport.state, 'approval');
  assert.equal(sent.length, 0);
  frame(transport, 'O', 'other.example.test:22', 'b'.repeat(32));
  assert.match(sent[0], /\tC\t/);
  transport.disconnect();
  assert.equal(transport.state, 'idle');
  frame(transport, 'O', '-oProxyCommand=bad:22');
  assert.equal(transport.state, 'idle');
  for (const url of [
    'ws://example.test',
    'wss://user:secret@example.test',
    'wss://example.test/?token=secret',
    'wss://example.test/#secret',
  ])
    assert.throws(() => bridgeURL(url));
  assert.equal(bridgeURL('wss://bridge.example.test'), 'wss://bridge.example.test/');
});
test('SSH binary transport preserves bytes, bounds queues, and ignores stale sessions', () => {
  const original = globalThis.WebSocket;
  let socket;
  const capture = (value) => {
    socket = value;
  };
  globalThis.WebSocket = class {
    readyState = 1;
    bufferedAmount = 0;
    sent = [];
    constructor() {
      capture(this);
    }
    send(value) {
      this.sent.push(value);
    }
    close() {
      this.closed = true;
    }
  };
  const sent = [],
    transport = new SSHTransport((line) => sent.push(line));
  try {
    frame(transport, 'O', 'ssh.example.test:22');
    transport.connect('wss://bridge.example.test', 'synthetic-token');
    socket.onopen();
    assert.equal(JSON.parse(socket.sent[0]).host, 'ssh.example.test');
    socket.onmessage({ data: '{"ready":true}' });
    assert.equal(transport.state, 'connected');
    frame(transport, 'D', 'AAH/', 'b'.repeat(32));
    assert.equal(socket.sent.length, 1);
    frame(transport, 'D', 'AAH/');
    assert.deepEqual(socket.sent[1], new Uint8Array([0, 1, 255]));
    socket.onmessage({ data: new Uint8Array(1000).buffer });
    assert.equal(sent.filter((line) => line.includes('\tD\t')).length, 1);
    frame(transport, 'A');
    assert.equal(sent.filter((line) => line.includes('\tD\t')).length, 2);
    socket.onmessage({ data: new Uint8Array(65537).buffer });
    assert.equal(transport.state, 'idle');
    assert.equal(socket.closed, true);
  } finally {
    transport.disconnect();
    globalThis.WebSocket = original;
  }
});

test('remote close drains already received bytes before closing the guest transport', () => {
  const original = globalThis.WebSocket;
  let socket;
  const capture = (value) => {
    socket = value;
  };
  globalThis.WebSocket = class {
    readyState = 1;
    bufferedAmount = 0;
    constructor() {
      capture(this);
    }
    send() {}
    close() {}
  };
  const sent = [],
    transport = new SSHTransport((line) => sent.push(line));
  try {
    frame(transport, 'O', 'ssh.example.test:22');
    transport.connect('wss://bridge.example.test', 'synthetic-token');
    socket.onmessage({ data: '{"ready":true}' });
    socket.onmessage({ data: new Uint8Array(900).buffer });
    socket.onclose();
    assert.equal(transport.state, 'connected');
    frame(transport, 'A');
    assert.equal(transport.state, 'connected');
    frame(transport, 'A');
    assert.equal(transport.state, 'idle');
    assert.equal(sent.filter((line) => line.includes('\tD\t')).length, 2);
    assert.match(sent.at(-1), /\tC\t/);
  } finally {
    transport.disconnect();
    globalThis.WebSocket = original;
  }
});
