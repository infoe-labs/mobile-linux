import { test, expect } from '@playwright/test';
const base = process.env.BASE_PATH || '/';
test('downloaded APKs import and install with real guest apk verification', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto(base);
  await page.getByRole('button', { name: 'Boot Alpine' }).click();
  await expect(page.locator('.status')).toHaveText('● local', { timeout: 90000 });
  await page.getByText('Packages: Go, curl, git', { exact: true }).click();
  await page
    .getByLabel('Import downloaded APK files')
    .setInputFiles([
      'public/packages/main/x86/busybox-extras-1.37.0-r30.apk',
      'public/packages/main/x86/ssl_client-1.37.0-r30.apk',
    ]);
  await expect(page.getByRole('status').filter({ hasText: 'APKs imported.' })).toBeVisible({
    timeout: 60000,
  });
  await page.getByRole('button', { name: 'Install imported APKs in terminal' }).click();
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('Executing busybox', {
    timeout: 60000,
  });
  const input = page.locator('.xterm-helper-textarea');
  await input.focus();
  await input.pressSequentially('command -v telnet && echo IMPORT_"OK"', { delay: 2 });
  await input.press('Enter');
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('IMPORT_OK', {
    timeout: 30000,
  });
  await input.pressSequentially('apk add python3', { delay: 2 });
  await input.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Packages need downloading' })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByRole('link', { name: /Download python3-/ }).first()).toHaveAttribute(
    'href',
    /^https:\/\/dl-cdn\.alpinelinux\.org\/alpine\/v3\.23\//,
  );
});
