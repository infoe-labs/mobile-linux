import { test, expect } from '@playwright/test';
const base = process.env.BASE_PATH || '/';
async function command(page, text) {
  const input = page.locator('.xterm-helper-textarea');
  await input.focus();
  await input.pressSequentially(text, { delay: 1 });
  await input.press('Enter');
}
async function boot(page) {
  await page.getByRole('button', { name: 'Boot Alpine' }).click();
  await expect(page.locator('.status')).toHaveText('● local', { timeout: 90000 });
}
test('signed static repositories install curl and git, fail honestly and persist offline', async ({
  page,
  context,
}) => {
  test.setTimeout(300000);
  const external = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4173')
      external.push(new URL(request.url()).origin);
  });
  await page.goto(base);
  await boot(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await command(page, 'apk update >/root/package-errors 2>&1; echo UPDATE_FAILED:$?');
  await expect(page.locator('.xterm-accessibility-tree')).toContainText(/UPDATE_FAILED:[1-9]/, {
    timeout: 45000,
  });
  await context.setOffline(false);
  await page.getByText('Packages: Go, curl, git', { exact: true }).click();
  await page.getByRole('button', { name: /Download offline bundle/ }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Package bundle available offline' }),
  ).toBeVisible({ timeout: 120000 });
  await page.getByText('Packages: Go, curl, git', { exact: true }).click();
  await context.setOffline(true);
  await command(
    page,
    'apk update && apk add curl git busybox-extras && command -v telnet && curl --version && git --version; echo PACKAGES_DONE:$?',
  );
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('PACKAGES_DONE:0', {
    timeout: 180000,
  });
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await page.getByRole('button', { name: 'Pause & sync', exact: true }).click();
  await expect(page.locator('.status')).toHaveText('paused');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await boot(page);
  await command(page, 'apk info -e curl git && curl --version && git --version; echo PERSISTED:$?');
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('PERSISTED:0', {
    timeout: 30000,
  });
  expect(external).toEqual([]);
});
test('Go installs and compiles Hello World in the emulator', async ({ page }) => {
  test.skip(process.env.RUN_PACKAGES !== '1', 'Explicit large-toolchain validation');
  test.setTimeout(1200000);
  await page.goto(base);
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await page.getByLabel('Guest RAM').selectOption('512');
  await page.getByLabel('Close panel').click();
  await boot(page);
  await command(page, 'apk update && apk add go && go version; echo GO_INSTALLED:$?');
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('GO_INSTALLED:0', {
    timeout: 300000,
  });
  await command(
    page,
    `printf '%s\\n' 'package main' 'import "fmt"' 'func main() { fmt.Println("Hello from Alpine Go!") }' > /tmp/hello.go; go run /tmp/hello.go > /root/go-result; echo GO_COMPILED:$?`,
  );
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('GO_COMPILED:0', {
    timeout: 900000,
  });
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await page.getByRole('button', { name: /· go-result/ }).click();
  await expect(page.getByLabel('Guest text file')).toHaveValue('Hello from Alpine Go!\n');
  await page.getByLabel('Close panel').click();
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await page.getByRole('button', { name: 'Pause & sync', exact: true }).click();
  await expect(page.locator('.status')).toHaveText('paused');
  await page.reload();
  await boot(page);
  await command(page, 'go version && apk info -e go gcc musl-dev; echo GO_PERSISTED:$?');
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('GO_PERSISTED:0', {
    timeout: 30000,
  });
});
