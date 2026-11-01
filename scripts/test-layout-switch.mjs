import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
try {
  await page.goto(process.env.STORE_URL || 'http://127.0.0.1:5173');
  const grid = page.locator('.store-card-grid');
  await grid.waitFor();
  await page.getByRole('button', { name: '列表视图', exact: true }).click();
  assert.equal(await grid.evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length), 1);
  await page.reload();
  await grid.waitFor();
  assert.equal(await page.getByRole('button', { name: '列表视图', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.locator('.dsh-store').evaluate(e => { e.style.width = '620px'; });
  assert.equal(await page.getByRole('button', { name: '列表视图', exact: true }).isVisible(), false);
  assert.equal(await page.locator('.store-main').evaluate(e => e.scrollWidth > e.clientWidth + 1), false);
  await page.locator('.dsh-store').evaluate(e => { e.style.width = ''; });
  await page.getByRole('button', { name: '卡片视图', exact: true }).click();
  assert.equal(await grid.evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length), 3);
  await page.getByRole('textbox', { name: '搜索插件' }).fill('memory');
  await page.getByRole('button', { name: '清除搜索' }).click();
  assert.equal(await page.getByRole('textbox', { name: '搜索插件' }).inputValue(), '');
  console.log('Layout controls passed: persistent list/grid preference, narrow panel fallback and clear search.');
} finally { await browser.close(); }
