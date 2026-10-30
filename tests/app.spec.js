import { test, expect } from '@playwright/test';
const base = process.env.BASE_PATH || '/';
test.setTimeout(180000);
async function boot(page) {
  await page.getByRole('button', { name: 'Boot Alpine' }).click();
  await expect(page.locator('.status')).toHaveText('● local', { timeout: 90000 });
}
async function command(page, text) {
  const input = page.locator('.xterm-helper-textarea');
  await input.focus();
  await input.pressSequentially(text, { delay: 1 });
  await input.press('Enter');
}
async function files(page) {
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await expect(page.getByLabel('Directory path')).toHaveValue('/root');
}
test('real Alpine commands, shared files, durable disk, snapshots, and offline cold boot', async ({
  page,
  context,
}) => {
  const external = [];
  page.on('request', (r) => {
    if (new URL(r.url()).origin !== 'http://127.0.0.1:4173') external.push(r.url());
  });
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(base);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
    localStorage.setItem('unrelated-app', 'keep');
  });
  await boot(page);
  await page.getByRole('button', { name: 'Compose', exact: true }).click();
  await page.getByLabel('Command draft').fill('una');
  await page.getByRole('button', { name: 'Suggest', exact: true }).click();
  await expect(page.getByRole('button', { name: 'uname', exact: true })).toBeVisible({
    timeout: 45000,
  });
  await page.getByRole('button', { name: 'Compose', exact: true }).click();
  await command(page, 'uname -a > /root/probe; cat /etc/os-release >> /root/probe; sync');
  await files(page);
  await page.getByRole('button', { name: /· probe/ }).click();
  await expect(page.getByLabel('Guest text file')).toHaveValue(
    /Linux alpine-pocket.*\ni686|Linux alpine-pocket/s,
    { timeout: 20000 },
  );
  await expect(page.getByLabel('Guest text file')).toHaveValue(/VERSION_ID=3.23.7/);
  await page.getByLabel('Guest text file').fill('persisted from the real guest file editor\n');
  await page.getByRole('button', { name: 'Save to Alpine' }).click();
  await expect(page.getByRole('heading', { name: '/root/probe', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByLabel('Close panel').click();
  // Destroy the active VM without saving RAM. Guest sync + committed IDB blocks survive.
  await page.reload();
  await boot(page);
  await files(page);
  await page.getByRole('button', { name: /· probe/ }).click();
  await expect(page.getByLabel('Guest text file')).toHaveValue(
    'persisted from the real guest file editor\n',
  );
  await page.getByLabel('Close panel').click();
  await page.getByRole('button', { name: 'System', exact: true }).click();
  // Handle the naming prompt specifically.
  page.removeAllListeners('dialog');
  page.on('dialog', (dialog) =>
    dialog.type() === 'prompt' ? dialog.accept('Synthetic checkpoint') : dialog.accept(),
  );
  await page.getByRole('button', { name: 'Save snapshot', exact: true }).click();
  await expect(page.getByText('Synthetic checkpoint', { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Resume', exact: true }).last().click();
  await page.getByLabel('Close panel').click();
  await command(page, 'printf changed > /root/probe; sync');
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByText('Snapshot restored. Resume when ready.')).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Resume', exact: true }).last().click();
  await page.getByLabel('Close panel').click();
  await context.setOffline(true);
  await page.reload();
  await boot(page);
  await files(page);
  await page.getByRole('button', { name: /· probe/ }).click();
  await expect(page.getByLabel('Guest text file')).toHaveValue(
    'persisted from the real guest file editor\n',
  );
  expect(await page.evaluate(() => localStorage.getItem('unrelated-app'))).toBe('keep');
  expect(external).toEqual([]);
});
test('manifest, narrow layout, and Apple metadata support subpath installation', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  const manifest = await (await request.get(base + 'manifest.webmanifest')).json();
  expect(manifest.scope).toBe(base);
  expect(manifest.start_url).toBe(base);
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) expect((await request.get(base + icon.src)).ok()).toBe(true);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    'content',
    'yes',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Boot Alpine' })).toBeVisible();
});
