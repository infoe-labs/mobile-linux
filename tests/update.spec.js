import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
const base = process.env.BASE_PATH || '/';
test('a waiting app update pauses Linux and reloads from one enabled button', async ({
  page,
  browserName,
}) => {
  test.setTimeout(180000);
  const original = readFileSync('dist/sw.js');
  try {
    await page.goto(base);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect(page.getByRole('button', { name: 'Update & reload', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Boot Alpine' }).click();
    await expect(page.locator('.status')).toHaveText('● local', { timeout: 90000 });
    writeFileSync(
      'dist/sw.js',
      Buffer.concat([original, Buffer.from(`\n// synthetic update ${browserName}\n`)]),
    );
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
    });
    const update = page.getByRole('button', { name: 'Update & reload', exact: true });
    await expect(update).toBeEnabled({ timeout: 30000 });
    await update.click();
    await expect(page.getByRole('button', { name: 'Boot Alpine' })).toBeVisible({ timeout: 45000 });
    await expect(update).toHaveCount(0);
  } finally {
    writeFileSync('dist/sw.js', original);
  }
});
