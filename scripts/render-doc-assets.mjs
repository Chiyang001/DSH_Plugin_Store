import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const assets = new URL('../docs/assets/', import.meta.url);
await mkdir(assets, { recursive: true });
const developer = (await readFile(new URL('../developer.png', import.meta.url))).toString('base64');
const icon = (await readFile(new URL('../icon.svg', import.meta.url), 'utf8')).match(/<g[\s\S]*<\/g>/)[0];
// Fit the entire supplied artwork; the clip only rounds the outside frame.
const branding = `<svg xmlns="http://www.w3.org/2000/svg" width="352" height="132" viewBox="0 0 352 132">
<title>炽阳001 | Harness 插件商店</title>
<desc>左侧按原图的 1:1 比例完整显示开发者 logo，仅四角圆角处理；右侧为软件 logo，中间以竖线分隔。</desc>
<defs><clipPath id="developer-rounded"><rect x="36" y="16" width="100" height="100" rx="14"/></clipPath></defs>
<image href="data:image/png;base64,${developer}" x="36" y="16" width="100" height="100" preserveAspectRatio="xMidYMid meet" clip-path="url(#developer-rounded)"/>
<path d="M176 24v84" stroke="#b6a17c" stroke-width="1.5"/>
<svg x="216" y="16" width="100" height="100" viewBox="0 0 40 40" fill="none">${icon}</svg>
</svg>\n`;
await writeFile(new URL('brand-lockup.svg', assets), branding);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const brand = await browser.newPage({ viewport: { width: 352, height: 132 }, deviceScaleFactor: 2 });
  await brand.setContent(branding);
  await brand.locator('body').evaluate(e => { e.style.margin = '0'; e.style.background = 'transparent'; });
  await brand.locator('svg').first().screenshot({ path: fileURLToPath(new URL('brand-lockup-full.png', assets)), omitBackground: true });
  await brand.close();
  if (!process.argv.includes('--branding-only')) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
    await page.goto(process.env.STORE_URL || 'http://127.0.0.1:5173');
    await page.getByRole('heading', { name: '发现插件.' }).waitFor();
    await page.locator('.store-card').first().waitFor();
    // Give original remote plugin images a bounded opportunity to finish loading.
    await page.waitForFunction(() => [...document.querySelectorAll('.store-plugin-mark img')].every(e => e.complete), null, { timeout: 6000 }).catch(() => {});
    await page.screenshot({ path: fileURLToPath(new URL('discover.png', assets)), animations: 'disabled' });
    await page.locator('.store-nav-item').filter({ hasText: '今日推荐' }).click();
    await page.getByRole('figure', { name: '每日诗词' }).waitFor();
    await page.screenshot({ path: fileURLToPath(new URL('daily.png', assets)), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('navigation', { name: '商店移动导航' }).waitFor({ state: 'visible' });
    await page.screenshot({ path: fileURLToPath(new URL('mobile.png', assets)), animations: 'disabled' });
    await page.close();
  }
  console.log(process.argv.includes('--branding-only') ? 'Rendered README branding with full developer artwork.' : 'Rendered README branding and public preview screenshots.');
} finally { await browser.close(); }
