import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

// Read-only diagnostics plus opening the already-installed store panel. No installation through the UI.
const portFile = path.join(process.env.APPDATA, '@deepseek-ai/dsh-desktop/DevToolsActivePort');
const port = (await fs.readFile(portFile, 'utf8')).split(/\r?\n/)[0];
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
try {
  const page = browser.contexts().flatMap(context => context.pages()).find(p => p.url().startsWith('dsh-app://app/'));
  if (!page) throw new Error('Desktop page not found.');
  await page.getByRole('button', { name: '插件商店', exact: true }).click({ timeout: 20000 });
  await page.locator('.dsh-store').waitFor({ timeout: 20000 });
  await page.locator('.store-loading').waitFor({ state: 'hidden' });
  if (await page.locator('.store-error').count()) throw new Error(await page.locator('.store-error').innerText());
  const summary = await page.locator('.dsh-store').evaluate(element => ({
    heading: element.querySelector('h1')?.textContent,
    cards: element.querySelectorAll('.store-card').length,
    connected: element.querySelector('.store-footer')?.textContent?.includes('已连接 DeepSeek Harness'),
    preview: !!element.querySelector('.store-preview-note'),
  }));
  if (!summary.connected || summary.preview || !summary.cards) throw new Error(JSON.stringify(summary));
  await fs.mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/store-user-desktop.png', animations: 'disabled' });
  console.log(JSON.stringify(summary));
} finally {
  // CDP browser.close disconnects the client; the user's application stays open.
  await browser.close();
}
