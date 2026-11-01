import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1560, height: 1040 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
page.on('console', message => { if (message.type() === 'error') console.log('Browser error:', message.text()); });
try {
  if (!process.env.DSH_TEST_URL) throw new Error('Set DSH_TEST_URL to the isolated test Host URL.');
  await page.goto(process.env.DSH_TEST_URL);
  await page.waitForTimeout(4000);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/native-initial.png' });
  console.log((await page.locator('body').innerText()).slice(0, 3000));
  const onboarding = page.getByRole('button', { name: '继续', exact: true });
  if (await onboarding.isVisible()) await onboarding.click();
  await page.keyboard.press('Escape');
  const store = page.getByRole('button', { name: '插件商店', exact: true });
  await store.waitFor({ timeout: 20000 });
  await store.click();
  await page.locator('.dsh-store').waitFor();
  await page.locator('.store-loading').waitFor({ state: 'hidden' });
  await page.screenshot({ path: 'test-results/store-native.png', animations: 'disabled' });
  const error = await page.locator('.store-error').count();
  if (error) throw new Error(await page.locator('.store-error').innerText());
  await page.locator('.store-nav-item').filter({ hasText: '已安装' }).click();
  await page.locator('.store-installed-row').first().waitFor();
  await page.screenshot({ path: 'test-results/store-native-installed.png', animations: 'disabled' });
  if (process.env.DSH_TEST_FIXTURE === '1') {
    const row = page.locator('.store-installed-row').filter({ hasText: 'dsh-store-native-test-fixture' });
    await row.getByRole('button', { name: '已启用' }).click();
    await page.getByRole('status').filter({ hasText: /已在 Harness 中生效|重启 DeepSeek Harness/ }).waitFor();
    await row.getByRole('button', { name: '启用', exact: true }).click();
    await page.getByRole('status').filter({ hasText: /已在 Harness 中生效|重启 DeepSeek Harness/ }).waitFor();
    await row.getByRole('button', { name: '卸载 dsh-store-native-test-fixture' }).click();
    await page.getByRole('button', { name: '确认卸载' }).click();
    await row.waitFor({ state: 'hidden' });
    console.log('Native management passed: disabled, enabled and uninstalled the isolated no-op fixture through real Host RPC.');
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Native smoke passed: loaded real DSH sidebar entry and ${await page.locator('.store-installed-row').count()} Host bundles without browser errors.`);
} catch (error) { await page.screenshot({ path: 'test-results/native-error.png' }); throw error; }
finally { await browser.close(); }
