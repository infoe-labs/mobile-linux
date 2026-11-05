import { test, expect } from '@playwright/test';
const base = process.env.BASE_PATH || '/';
async function command(page, text) {
  const input = page.locator('.xterm-helper-textarea');
  await input.focus();
  await input.pressSequentially(text, { delay: 2 });
  await input.press('Enter');
}
test('real Node and npm install, execute JavaScript and survive restart', async ({ page }) => {
  test.setTimeout(300000);
  await page.goto(base);
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await page.getByLabel('Guest RAM').selectOption('512');
  await page.getByLabel('Close panel').click();
  await page.getByRole('button', { name: 'Boot Alpine' }).click();
  await expect(page.locator('.status')).toHaveText('● local', { timeout: 90000 });
  await command(
    page,
    'apk add --no-cache nodejs npm && node --version && npm --version; echo NODE_INSTALLED:$?',
  );
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('NODE_INSTALLED:0', {
    timeout: 180000,
  });
  await command(page, `node -e 'console.log("NODE_" + "EXECUTED:" + (20 + 22))'`);
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('NODE_EXECUTED:42', {
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await page.getByRole('button', { name: 'Pause & sync', exact: true }).click();
  await expect(page.locator('.status')).toHaveText('paused');
  await page.reload();
  await page.getByRole('button', { name: 'Boot Alpine' }).click();
  await expect(page.locator('.status')).toHaveText('● local', { timeout: 90000 });
  await command(
    page,
    'apk info -e nodejs npm && node --version && npm --version; echo NODE_PERSISTED:$?',
  );
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('NODE_PERSISTED:0', {
    timeout: 30000,
  });
});
