import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(process.env.STORE_URL || 'http://127.0.0.1:5173');
  await page.locator('.store-card').first().waitFor();
  const firstBatch = await page.locator('.store-card h3').allTextContents();
  await page.getByRole('button', { name: '换一批', exact: true }).click();
  assert.notDeepEqual(await page.locator('.store-card h3').allTextContents(), firstBatch);
  assert.ok(await page.locator('.store-plugin-mark.has-logo img').count() > 5);
  const avatar = page.locator('.store-profile img');
  await avatar.waitFor(); assert.ok(await avatar.evaluate(e => e.complete && e.naturalWidth > 0));
  await page.getByRole('button', { name: '今日推荐', exact: true }).click();
  await page.getByRole('heading', { name: '今天，给工作加一点新能力。' }).waitFor();
  assert.ok(await page.locator('.store-daily-card').count() >= 4);
  const firstDaily = await page.locator('.store-daily-card h3').allTextContents();
  await page.getByRole('button', { name: '换一批', exact: true }).click();
  assert.notDeepEqual(await page.locator('.store-daily-card h3').allTextContents(), firstDaily);
  await page.screenshot({ path: 'test-results/store-today-desktop.png', animations: 'disabled' });
  await page.getByRole('button', { name: '发现', exact: true }).click();
  assert.equal(await page.locator('.store-sidebar').getByRole('button', { name: '分类', exact: true }).count(), 0);
  assert.equal(await page.getByRole('group', { name: '插件分类', exact: true }).getByRole('button').count(), 10);
  await page.getByRole('button', { name: '按分类探索', exact: true }).click();
  await page.getByRole('group', { name: '插件分类', exact: true }).getByRole('button', { name: '知识与记忆', exact: true }).click();
  assert.ok(await page.locator('.store-card').count() > 0);
  await page.getByRole('heading', { name: '发现插件.' }).waitFor();
  await page.screenshot({ path: 'test-results/store-category-filter-desktop.png', animations: 'disabled' });
  await page.getByRole('button', { name: '发现', exact: true }).click();
  const initial = await page.locator('.store-card').count();
  if (await page.getByRole('button', { name: '继续发现' }).isVisible()) {
    await page.getByRole('button', { name: '继续发现' }).click();
    assert.ok(await page.locator('.store-card').count() > initial);
  }
  for (const width of [320, 360, 390, 600, 740]) {
    await page.setViewportSize({ width, height: 844 });
    const nav = page.getByRole('navigation', { name: '商店移动导航' });
    await nav.waitFor({ state: 'visible' });
    assert.equal(await page.locator('.store-sidebar').isVisible(), false);
    assert.equal(await nav.getByRole('button').count(), 4);
    assert.equal(await nav.getByRole('button', { name: '分类', exact: true }).count(), 0);
    await nav.getByRole('button', { name: '发现', exact: true }).click();
    await page.getByRole('group', { name: '插件分类', exact: true }).getByRole('button', { name: '知识与记忆', exact: true }).click();
    await page.getByRole('heading', { name: '发现插件.' }).waitFor();
    assert.ok(await page.locator('.store-card').count() > 0);
    const horizontal = await page.locator('.store-main').evaluate(e => e.scrollWidth > e.clientWidth + 1);
    assert.equal(horizontal, false, `Category overflow at ${width}px`);
    const position = await nav.boundingBox(); assert.ok(position && position.y + position.height <= 845);
    if (width === 390) await page.screenshot({ path: 'test-results/store-category-filter-mobile.png', animations: 'disabled' });
    await nav.getByRole('button', { name: '今日', exact: true }).click();
    await page.getByRole('heading', { name: '今天，给工作加一点新能力。' }).waitFor();
    assert.equal(await page.locator('.store-main').evaluate(e => e.scrollWidth > e.clientWidth + 1), false, `Daily overflow at ${width}px`);
    if (width === 390) await page.screenshot({ path: 'test-results/store-today-mobile.png', animations: 'disabled' });
    await nav.getByRole('button', { name: '更多商店功能' }).click();
    await page.getByRole('heading', { name: '你的商店' }).waitFor();
    await page.locator('.store-mobile-more').getByRole('button', { name: '我的收藏', exact: false }).click();
    await page.getByRole('heading', { name: '我的收藏.' }).waitFor();
    await nav.getByRole('button', { name: '发现', exact: true }).click();
    await page.locator('.store-card').first().getByRole('button', { name: '查看', exact: false }).click();
    const dialog = page.locator('dialog'); await dialog.waitFor();
    const bounds = await dialog.boundingBox(); assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
    await page.keyboard.press('Escape');
  }
  // Responsive behavior must follow a narrow embedded panel, even in a wide browser.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.dsh-store').evaluate(e => { e.style.width = '620px'; });
  await page.getByRole('navigation', { name: '商店移动导航' }).waitFor({ state: 'visible' });
  assert.equal(await page.locator('.store-sidebar').isVisible(), false);
  assert.equal(await page.locator('.store-main').evaluate(e => e.scrollWidth > e.clientWidth + 1), false);
  assert.deepEqual(errors, []);
  console.log('Discovery UI passed: original images, developer logo, daily picks, category filters on Discover, pagination, four-button bottom navigation, 320/360/390/600/740px and narrow embedded panels.');
} catch (error) { await page.screenshot({ path: 'test-results/discovery-ui-error.png' }); throw error; }
finally { await browser.close(); }
