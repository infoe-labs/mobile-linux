import { test, expect } from '@playwright/test';
const base = process.env.BASE_PATH || '/';
test('optional model generates offline after an explicit download', async ({ page, context }) => {
  test.skip(
    process.env.RUN_AI !== '1',
    'Optional 185 MB model download; run explicitly with RUN_AI=1.',
  );
  test.setTimeout(300000);
  await page.goto(base);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((r) =>
        navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }),
      );
  });
  await page.getByRole('button', { name: 'Boot Alpine' }).click();
  await expect(page.locator('.status')).toHaveText('● local', { timeout: 90000 });
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await page.getByRole('button', { name: 'Download / load' }).click();
  await page.waitForFunction(
    () => /^(ready|failed)/.test(document.querySelector('.model [role=status]').textContent),
    {},
    { timeout: 180000 },
  );
  await expect(page.locator('.model [role=status]')).toHaveText(/^ready/);
  await page.getByRole('button', { name: 'Unload / cancel' }).click();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Download / load' }).click();
  await page.waitForFunction(
    () => /^(ready|failed)/.test(document.querySelector('.model [role=status]').textContent),
    {},
    { timeout: 90000 },
  );
  await expect(page.locator('.model [role=status]')).toHaveText(/^ready/);
  await page.getByLabel('Local assistant prompt').fill('Print hello using echo.');
  await page.getByRole('button', { name: 'Generate locally' }).click();
  await expect(page.getByLabel('AI suggestion')).not.toHaveValue('', { timeout: 120000 });
  await page.getByRole('button', { name: 'Unload / cancel' }).click();
  await expect(page.locator('.model [role=status]')).toHaveText('unloaded');
});
