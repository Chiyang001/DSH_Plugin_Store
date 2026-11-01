import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const nav = label => page.locator('.store-nav-item').filter({ hasText: label }).click();
try {
  await mkdir('test-results', { recursive: true });
  await page.route(/\/src\/preview\.tsx(?:\?.*)?$/, route => route.fulfill({ contentType: 'application/javascript', body: "import '/tests/fixture.tsx';" }));
  await page.goto(process.env.STORE_URL || 'http://127.0.0.1:5173');
  await page.locator('.store-card').first().waitFor();
  assert.equal(await page.locator('.store-card .official-tag').count(), 0);
  assert.equal((await page.locator('.store-daily-shortcut').allInnerTexts()).some(text => text.includes('DeepSeek')), false);
  await page.getByRole('textbox', { name: '搜索插件' }).fill('priority-fixture-001');
  for (const sort of ['recommended', 'stars', 'newest']) {
    await page.getByRole('combobox', { name: '插件排序' }).selectOption(sort);
    assert.equal(await page.locator('.store-card').count(), 2);
    assert.equal(await page.locator('.store-card').last().locator('.official-tag').count(), 1);
    await page.getByRole('button', { name: '换一批', exact: true }).click();
    assert.equal(await page.locator('.store-card').last().locator('.official-tag').count(), 1);
  }
  await page.getByRole('combobox', { name: '插件来源' }).selectOption('official');
  assert.equal(await page.locator('.store-card').count(), 1);
  assert.equal(await page.locator('.store-card .official-tag').count(), 1);
  await nav('今日推荐');
  for (let i = 0; i < 4; i++) {
    assert.equal(await page.locator('.store-daily-card').count(), 6);
    assert.equal((await page.locator('.store-daily-category').allInnerTexts()).some(text => text.includes('DeepSeek 官方')), false);
    await page.getByRole('button', { name: '换一批', exact: true }).click();
  }
  await nav('已安装');
  const hide = page.getByRole('checkbox', { name: '隐藏官方插件' });
  assert.equal(await hide.isChecked(), true);
  assert.equal(await page.locator('.store-installed-row').count(), 1);
  await hide.uncheck();
  assert.equal(await page.locator('.store-installed-row').count(), 2);
  await page.reload(); await nav('已安装');
  assert.equal(await hide.isChecked(), false);
  assert.equal(await page.locator('.store-installed-row').count(), 2);
  await hide.check();
  assert.equal(await page.locator('.store-installed-row').count(), 1);
  assert.deepEqual(await page.evaluate(() => window.__storeCalls), []);
  await page.screenshot({ path: 'test-results/store-hide-official-desktop.png', animations: 'disabled' });
  for (const width of [320, 390, 740]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await hide.isVisible(), true);
    assert.equal(await page.locator('.store-main').evaluate(e => e.scrollWidth > e.clientWidth + 1), false, `Installed controls overflow at ${width}px`);
  }
  assert.deepEqual(errors, []);
  console.log('Community priority UI passed: official entries last, official filter remains available, no official daily picks, persisted installed visibility and no enable/disable calls.');
} catch (error) { await page.screenshot({ path: 'test-results/community-ui-error.png' }); throw error; }
finally { await browser.close(); }
