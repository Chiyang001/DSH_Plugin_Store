import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  await mkdir('test-results', { recursive: true });
  await page.clock.install({ time: new Date('2026-11-01T15:59:30Z') });
  await page.goto(process.env.STORE_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: '今日推荐', exact: true }).click();
  const poem = page.getByRole('figure', { name: '每日诗词' });
  await poem.waitFor();
  const first = await poem.innerText();
  assert.ok(first.includes('行到水穷处，坐看云起时。'));
  assert.ok(first.includes('王维《终南别业》'));
  assert.equal((await page.locator('.store-daily-intro').innerText()).includes('推荐是发现线索'), false);
  await page.getByRole('button', { name: '换一批', exact: true }).click();
  assert.equal(await poem.innerText(), first);
  await page.reload();
  await page.getByRole('button', { name: '今日推荐', exact: true }).click();
  assert.equal(await poem.innerText(), first);
  await page.screenshot({ path: 'test-results/store-poetry-desktop.png', animations: 'disabled' });
  await page.clock.fastForward(61_000);
  await page.waitForFunction(text => document.querySelector('.store-daily-poem')?.innerText !== text, first);
  assert.notEqual(await poem.innerText(), first);
  assert.equal(await page.locator('.store-calendar strong').innerText(), '02');
  for (const width of [320, 390, 740]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.locator('.store-main').evaluate(e => e.scrollWidth > e.clientWidth + 1), false, `Poem overflow at ${width}px`);
    assert.ok(await poem.locator('figcaption').isVisible());
    if (width === 390) await page.screenshot({ path: 'test-results/store-poetry-mobile.png', animations: 'disabled' });
  }
  assert.deepEqual(errors, []);
  console.log('Daily poetry UI passed: author/title, stable through reload and recommendation changes, automatic Shanghai midnight rollover and narrow layouts.');
} catch (error) { await page.screenshot({ path: 'test-results/poetry-ui-error.png' }); throw error; }
finally { await browser.close(); }
