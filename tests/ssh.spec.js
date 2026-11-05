import { test, expect } from '@playwright/test';
import ssh2 from 'ssh2';
const { Server } = ssh2;
import { generateKeyPairSync } from 'node:crypto';
import { connect, createServer } from 'node:net';
const base = process.env.BASE_PATH || '/';
test.setTimeout(180000);
test('guest ssh asks permission, verifies host key and runs a real encrypted session', async ({
  page,
}) => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  let authenticated = false;
  let interactiveInput = false;
  let wrongHost = false;
  let unexpectedAuthentication = false;
  const clients = new Set();
  const rawSockets = new Set();
  const sshServer = new Server({ hostKeys: [privateKey] }, (client) => {
    clients.add(client);
    client.on('error', () => {});
    client.on('close', () => clients.delete(client));
    client.on('authentication', (ctx) => {
      if (
        ctx.method === 'password' &&
        ctx.username === 'tester' &&
        ctx.password === 'synthetic-password'
      ) {
        authenticated = true;
        ctx.accept();
      } else ctx.reject(['password']);
    });
    client.on('ready', () =>
      client.on('session', (accept) => {
        const session = accept();
        session.on('pty', (accept) => accept?.());
        session.on('shell', (accept) => {
          const stream = accept();
          stream.write('SSH_INTERACTIVE_READY\n');
          let input = '';
          stream.on('data', (data) => {
            input += data.toString();
            if (!interactiveInput && input.includes('synthetic-input')) {
              interactiveInput = true;
              stream.end('SSH_INTERACTIVE_OK\n');
            }
          });
        });
        session.on('exec', (accept) => {
          const stream = accept();
          stream.end('SSH_INTEGRATION_OK\n');
        });
      }),
    );
  });
  const wrongKey = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  }).privateKey;
  const wrongServer = new Server({ hostKeys: [wrongKey] }, (client) => {
    clients.add(client);
    client.on('error', () => {});
    client.on('authentication', (ctx) => {
      unexpectedAuthentication = true;
      ctx.reject();
    });
  });
  const server = createServer((socket) => {
    rawSockets.add(socket);
    (wrongHost ? wrongServer : sshServer).injectSocket(socket);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const sockets = new Set();
  let attempts = 0;
  const installBridge = () =>
    page.routeWebSocket('wss://bridge.example.test/', (ws) => {
      attempts++;
      let tcp;
      ws.onMessage((message) => {
        if (!tcp) {
          const auth = JSON.parse(message.toString());
          expect(auth).toEqual({
            host: 'ssh.example.test',
            port: 22,
            token: 'synthetic-bridge-token',
          });
          tcp = connect(server.address().port, '127.0.0.1', () => ws.send('{"ready":true}'));
          sockets.add(tcp);
          tcp.on('data', (bytes) => ws.send(bytes));
          tcp.on('error', () => ws.close());
          tcp.on('close', () => ws.close());
        } else tcp.write(message);
      });
      ws.onClose(() => tcp?.destroy());
    });
  const type = async (text) => {
    const input = page.locator('.xterm-helper-textarea');
    await input.focus();
    await input.pressSequentially(text, { delay: 2 });
    await input.press('Enter');
  };
  try {
    await page.goto(base);
    await page.getByRole('button', { name: 'Boot Alpine' }).click();
    await expect(page.locator('.status')).toHaveText('● local', { timeout: 90000 });
    await installBridge();
    await type('ssh tester@ssh.example.test echo test > /root/ssh-result');
    await expect(page.getByRole('heading', { name: 'Allow SSH connection' })).toBeVisible({
      timeout: 30000,
    });
    expect(attempts).toBe(0);
    await page.getByRole('button', { name: 'Cancel SSH' }).click();
    await expect(page.getByRole('heading', { name: 'Allow SSH connection' })).toBeHidden();
    await type('ssh tester@ssh.example.test echo test > /root/ssh-result');
    await expect(page.getByRole('heading', { name: 'Allow SSH connection' })).toBeVisible({
      timeout: 30000,
    });
    await page.getByLabel('SSH bridge URL').fill('wss://bridge.example.test/');
    await page.getByLabel('Bridge access token').fill('synthetic-bridge-token');
    await page.getByRole('button', { name: 'Allow connection', exact: true }).click();
    await expect(page.getByText('SSH connected', { exact: true })).toBeVisible();
    // Dropbear's fingerprint confirmation and password prompt use /dev/tty.
    await expect(page.locator('.xterm-accessibility-tree')).toContainText('continue connecting', {
      timeout: 30000,
    });
    await type('y');
    await expect(page.locator('.xterm-accessibility-tree')).toContainText('password:', {
      timeout: 30000,
    });
    await type('synthetic-password');
    await expect.poll(() => authenticated, { timeout: 30000 }).toBe(true);
    await expect(page.getByRole('button', { name: 'Disconnect SSH' })).toBeHidden({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await page.getByRole('button', { name: /· ssh-result/ }).click();
    await expect(page.getByLabel('Guest text file')).toHaveValue('SSH_INTEGRATION_OK\n', {
      timeout: 30000,
    });
    await page.getByLabel('Close panel').click();
    await type('clear');
    await expect(page.locator('.xterm-accessibility-tree')).not.toContainText('password:');
    await type('ssh tester@ssh.example.test');
    await page.getByLabel('SSH bridge URL').fill('wss://bridge.example.test/');
    await page.getByLabel('Bridge access token').fill('synthetic-bridge-token');
    await page.getByRole('button', { name: 'Allow connection', exact: true }).click();
    // Wait for the new password prompt, not a previous scrollback row.
    await expect(page.locator('.xterm-accessibility-tree')).toContainText('password:');
    await type('synthetic-password');
    await expect(page.locator('.xterm-accessibility-tree')).toContainText('SSH_INTERACTIVE_READY', {
      timeout: 30000,
    });
    await type('synthetic-input');
    await expect.poll(() => interactiveInput, { timeout: 30000 }).toBe(true);
    await expect(page.getByRole('button', { name: 'Disconnect SSH' })).toBeHidden({
      timeout: 30000,
    });
    wrongHost = true;
    await type('ssh tester@ssh.example.test');
    await expect(page.getByRole('heading', { name: 'Allow SSH connection' })).toBeVisible({
      timeout: 30000,
    });
    await page.getByLabel('SSH bridge URL').fill('wss://bridge.example.test/');
    await page.getByLabel('Bridge access token').fill('synthetic-bridge-token');
    await page.getByRole('button', { name: 'Allow connection', exact: true }).click();
    await expect(page.locator('.xterm-accessibility-tree')).toContainText('mismatch', {
      timeout: 30000,
    });
    await expect(page.getByRole('button', { name: 'Disconnect SSH' })).toBeHidden({
      timeout: 30000,
    });
    expect(unexpectedAuthentication).toBe(false);
  } finally {
    for (const socket of sockets) socket.destroy();
    for (const socket of rawSockets) socket.destroy();
    for (const client of clients) client.end();
    server.close();
  }
});
