import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const address = process.env.STORE_URL || 'http://127.0.0.1:5173';
const mirror = 'https://registry.npmmirror.com/';
const custom = 'http://npm.internal:4873/team/';
const sources = () => page.locator('.store-nav-item').filter({ hasText: '插件源' }).click();
const save = () => page.getByRole('button', { name: '保存安装源' }).click();
async function installCommunity(registry) {
  await page.locator('.store-nav-item').filter({ hasText: '发现' }).click();
  const callsBefore = await page.evaluate(() => window.__storeCalls.filter(call => call[0] === 'install').length);
  await page.locator('.store-card').filter({ hasText: 'GitHub 社区' }).first().getByRole('button', { name: '安装', exact: true }).click();
  assert.ok((await page.locator('dialog').innerText()).includes(registry));
  assert.equal(await page.evaluate(() => window.__storeCalls.filter(call => call[0] === 'install').length), callsBefore);
  await page.getByRole('button', { name: '确认安装' }).click();
  await page.locator('dialog').waitFor({ state: 'hidden' });
  const calls = await page.evaluate(() => window.__storeCalls);
  assert.equal(calls.filter(call => call[0] === 'inspect').at(-1)[2].registry, registry);
  assert.equal(calls.filter(call => call[0] === 'install').at(-1)[2].registry, registry);
}
try {
  await mkdir('test-results', { recursive: true });
  await page.route(/\/src\/preview\.tsx(?:\?.*)?$/, route => route.fulfill({ contentType: 'application/javascript', body: "import '/tests/fixture.tsx';" }));
  await page.goto(address);
  await sources();
  assert.equal(await page.getByRole('radio', { checked: true }).count(), 1);
  assert.equal(await page.getByRole('radio', { name: '中国大陆镜像源', exact: false }).isChecked(), true);
  await installCommunity(mirror);
  await sources();
  await page.getByRole('radio', { name: 'npm 官方源', exact: false }).check();
  await save();
  await page.reload(); await sources();
  assert.equal(await page.getByRole('radio', { name: 'npm 官方源', exact: false }).isChecked(), true);
  await installCommunity('https://registry.npmjs.org/');
  await sources();
  await page.getByRole('radio', { name: '自定义地址', exact: true }).check();
  await page.getByRole('textbox', { name: '自定义安装源地址' }).fill('https://user:secret@npm.example.com/');
  await save();
  await page.getByRole('alert').filter({ hasText: '不能包含账号' }).waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('chiyang.dsh-store.install-registry')).mode), 'official');
  await page.getByRole('textbox', { name: '自定义安装源地址' }).fill(custom.slice(0, -1));
  await save();
  await page.reload(); await sources();
  assert.equal(await page.getByRole('textbox', { name: '自定义安装源地址' }).inputValue(), custom);
  assert.equal(await page.getByRole('radio', { checked: true }).count(), 1);
  await installCommunity(custom);
  await sources();
  // An index can point to private packages unavailable on the chosen public mirror.
  await page.route('https://registry-test.example/index.json', route => route.fulfill({ json: { format: 1, plugins: [{ name: 'dsh-private-test', title: '私有源插件测试', versions: [{ version: '1.0.0', source: { type: 'npm', registry: 'https://private.example/npm/' } }] }] }, headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.getByRole('button', { name: '添加订阅源' }).click();
  await page.getByRole('textbox', { name: '源名称' }).fill('私有订阅');
  await page.getByRole('textbox', { name: '索引地址' }).fill('https://registry-test.example/index.json');
  await page.getByRole('button', { name: '连接订阅源' }).click();
  await page.getByRole('heading', { name: '私有订阅' }).waitFor();
  await page.locator('.store-nav-item').filter({ hasText: '发现' }).click();
  await page.getByRole('textbox', { name: '搜索插件' }).fill('私有源插件测试');
  await page.locator('.store-card').getByRole('button', { name: '安装', exact: true }).click();
  assert.ok((await page.locator('dialog').innerText()).includes('https://private.example/npm/'));
  await page.getByRole('button', { name: '确认安装' }).click();
  await page.locator('dialog').waitFor({ state: 'hidden' });
  const calls = await page.evaluate(() => window.__storeCalls);
  assert.equal(calls.filter(call => call[0] === 'inspect').at(-1)[2].registry, 'https://private.example/npm/');
  assert.equal(calls.filter(call => call[0] === 'install').at(-1)[2].registry, 'https://private.example/npm/');
  await sources();
  await page.screenshot({ path: 'test-results/store-registry-desktop.png', animations: 'disabled' });
  for (const width of [320, 390, 740]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.locator('.store-main').evaluate(e => e.scrollWidth > e.clientWidth + 1), false, `Registry overflow at ${width}px`);
    if (width === 390) await page.screenshot({ path: 'test-results/store-registry-mobile.png', animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.dsh-store').evaluate(e => { e.style.width = '620px'; });
  assert.equal(await page.locator('.store-main').evaluate(e => e.scrollWidth > e.clientWidth + 1), false);
  assert.deepEqual(errors, []);
  console.log('Registry UI passed: one default mirror, persisted official/custom choices, validation, actual inspect/install arguments, explicit private registries and narrow layouts.');
} catch (error) { await page.screenshot({ path: 'test-results/registry-ui-error.png' }); throw error; }
finally { await browser.close(); }
