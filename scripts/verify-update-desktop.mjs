import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

// Reload the already-linked artifact through the local diagnostic connection; no UI import flow.
const port = (await fs.readFile(path.join(process.env.APPDATA, '@deepseek-ai/dsh-desktop/DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0];
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const { version } = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
try {
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('dsh-app://app/'));
  if (!page) throw new Error('Harness desktop is not open.');
  const session = await page.context().newCDPSession(page);
  await session.send('Page.reload', { ignoreCache: true });
  await page.getByRole('button', { name: '插件商店', exact: true }).click({ timeout: 25000 });
  await page.locator('.dsh-store').waitFor();
  await page.locator('.store-loading').waitFor({ state: 'hidden' });
  const store = page.locator('.dsh-store');
  await store.locator('.store-nav-item').filter({ hasText: '发现' }).click();
  const categories = (await store.locator('.store-filter-tabs button').count()) - 1;
  if (categories !== 9) throw new Error(`Wrong category count: ${categories}`);
  await store.locator('.store-nav-item').filter({ hasText: '今日推荐' }).click();
  await store.locator('.store-daily-card').first().waitFor();
  const summary = await store.evaluate((e, version) => ({
    connected: e.querySelector('.store-footer')?.textContent?.includes('已连接 DeepSeek Harness'),
    version: e.querySelector('.store-footer')?.textContent?.includes(`v${version}`),
    recommendations: e.querySelectorAll('.store-daily-card').length,
    originalIcons: e.querySelectorAll('.store-daily-card .has-logo img').length,
    developerLogo: [...e.querySelectorAll('.store-developer-logo')].some(img => img.complete && img.naturalWidth > 0),
    error: e.querySelector('.store-error')?.textContent || null,
  }), version);
  if (!summary.connected || !summary.version || !summary.developerLogo || summary.error || !summary.recommendations) throw new Error(JSON.stringify(summary));
  await fs.mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/store-updated-desktop.png', animations: 'disabled' });
  console.log(JSON.stringify({ categories, ...summary }));
} finally { await browser.close(); }
