import { test, expect } from '@playwright/test';
// Keep the synthetic HTTPS route outside service-worker interception.
test.use({ serviceWorkers: 'block', actionTimeout: 30000 });
const base = process.env.BASE_PATH || '/';
test('failed guest HTTPS requires approval before host download and imports real bytes', async ({
  page,
}) => {
  test.setTimeout(180000);
  let requests = 0;
  await page.goto(base);
  await page.getByRole('button', { name: 'Boot Alpine' }).click();
  await expect(page.locator('.status')).toHaveText('● local', { timeout: 90000 });
  await page.route('https://download.example.test/file.txt', async (route) => {
    requests++;
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*' },
      body: 'synthetic download content',
    });
  });
  const input = page.locator('.xterm-helper-textarea');
  await input.focus();
  await input.pressSequentially('apk add curl && curl https://download.example.test/file.txt', {
    delay: 2,
  });
  await input.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Allow browser download' })).toBeVisible({
    timeout: 60000,
  });
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Fetch and import into Alpine' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Imported into Alpine:' })).toBeVisible({
    timeout: 30000,
  });
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Close download request' }).click();
  await input.focus();
  await input.pressSequentially('cat /root/Downloads/*', { delay: 2 });
  await input.press('Enter');
  await expect(page.locator('.xterm-accessibility-tree')).toContainText(
    'synthetic download content',
    { timeout: 30000 },
  );
  await input.pressSequentially(
    'apk add git && git clone https://github.com/example/repository.git',
    { delay: 2 },
  );
  await input.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Allow browser download' })).toBeVisible({
    timeout: 60000,
  });
  await expect(page.getByRole('link', { name: 'Download in browser' })).toHaveAttribute(
    'href',
    'https://github.com/example/repository/archive/HEAD.tar.gz',
  );
  expect(requests).toBe(1);
});
