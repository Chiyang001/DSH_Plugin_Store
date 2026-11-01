import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverGithub } from '../src/network';

const sha = 'a'.repeat(40);
function repo(name: string, stars = 10) {
  return { full_name: `author/${name}`, name, description: 'DeepSeek Harness 插件', default_branch: 'main', owner: { login: 'author' }, stargazers_count: stars, pushed_at: '2026-10-31T00:00:00Z', topics: ['dsh-plugin'], archived: false, fork: false };
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
async function withFetch<T>(handler: (url: URL) => Response | Promise<Response>, action: () => Promise<T>): Promise<T> {
  const saved = globalThis.fetch;
  globalThis.fetch = async input => handler(new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url));
  try { return await action(); } finally { globalThis.fetch = saved; }
}
function bundleResponse(url: URL) {
  if (url.hostname === 'api.github.com' && url.pathname.includes('/commits/')) return json({ sha });
  const name = url.pathname.split('/')[2];
  return json({ name: `dsh-${name}`, version: '1.0.0', description: 'tool', dsh: { bundle: { patch: './cordis.patch.yml' } }, icon: './icon.svg' });
}

test('discovery uses complementary searches, interleaves sources and deduplicates repositories', async () => {
  const searches: URL[] = []; const manifests: URL[] = [];
  const pages = [[repo('common'), repo('topic')], [repo('common'), repo('name')], [repo('chinese')], [repo('recent')]];
  const result = await withFetch(url => {
    if (url.pathname === '/search/repositories') { const index = searches.length; searches.push(url); return json({ items: pages[index] }); }
    if (url.hostname === 'raw.githubusercontent.com') manifests.push(url);
    return bundleResponse(url);
  }, () => discoverGithub());
  assert.equal(searches.length, 4);
  assert.equal(new Set(searches.map(url => url.searchParams.get('q'))).size, 4);
  assert.ok(searches.some(url => url.searchParams.get('q')?.includes('插件')));
  assert.ok(searches.some(url => url.searchParams.get('sort') === 'updated'));
  assert.equal(result.searches, 4); assert.equal(result.scanned, 5); assert.equal(result.plugins.length, 5);
  assert.equal(manifests.filter(url => url.pathname === '/author/common/main/package.json').length, 1);
  assert.equal(manifests.filter(url => url.pathname === `/author/common/${sha}/package.json`).length, 1);
  assert.ok(result.plugins.every(plugin => plugin.commit === sha && plugin.spec?.endsWith(`.git#${sha}`)));
  assert.ok(result.plugins.every(plugin => plugin.logo?.includes(`/${sha}/icon.svg`)));
});

test('verification is bounded to 32 candidates and optional pages rotate all searches', async () => {
  let searches = 0; let commitLookups = 0; const requestedPages: string[] = [];
  const result = await withFetch(url => {
    if (url.pathname === '/search/repositories') {
      const group = searches++; requestedPages.push(url.searchParams.get('page')!);
      return json({ items: Array.from({ length: 24 }, (_, i) => repo(`route${group}-${i}`)) });
    }
    if (url.pathname.includes('/commits/')) commitLookups++;
    return bundleResponse(url);
  }, () => discoverGithub(undefined, { page: 2 }));
  assert.equal(result.scanned, 32); assert.equal(result.plugins.length, 32);
  assert.equal(commitLookups + searches, 36);
  assert.deepEqual(requestedPages, ['2', '2', '2', '2']);
  for (let group = 0; group < 4; group++) assert.equal(result.plugins.filter(plugin => plugin.id.startsWith(`dsh-route${group}-`)).length, 8);
});

test('failed or malformed searches preserve successful sources and report their own warnings', async () => {
  let searches = 0;
  const result = await withFetch(url => {
    if (url.pathname === '/search/repositories') {
      const index = searches++;
      if (index === 0) return json({ message: 'rate limit' }, 403);
      if (index === 1) return json({ unexpected: true });
      return json({ items: index === 2 ? [repo('survivor')] : [] });
    }
    return bundleResponse(url);
  }, () => discoverGithub());
  assert.equal(result.plugins.length, 1); assert.equal(result.plugins[0].id, 'dsh-survivor');
  assert.equal(result.warnings.length, 2); assert.match(result.warnings[0], /限流/); assert.match(result.warnings[1], /无效/);
});

test('non-bundles use no commit lookup and pinned manifests are revalidated', async () => {
  let searchIndex = 0; const commits: string[] = [];
  const result = await withFetch(url => {
    if (url.pathname === '/search/repositories') return json({ items: searchIndex++ === 0 ? [repo('ordinary'), repo('changed'), repo('valid')] : [] });
    if (url.pathname.includes('/commits/')) { commits.push(url.pathname); return json({ sha }); }
    if (url.pathname.includes('/ordinary/')) return json({ name: 'ordinary-project' });
    if (url.pathname === `/author/changed/${sha}/package.json`) return json({ name: 'dsh-changed', dsh: { bundle: { patch: [] } } });
    return bundleResponse(url);
  }, () => discoverGithub());
  assert.equal(result.plugins.length, 1); assert.equal(result.plugins[0].id, 'dsh-valid');
  assert.equal(commits.length, 2); assert.ok(commits.every(url => !url.includes('/ordinary/')));
});

test('all failed searches are recoverable, while caller cancellation still aborts discovery', async () => {
  let calls = 0;
  await withFetch(() => { calls++; return json({}, 503); }, async () => {
    const result = await discoverGithub();
    assert.equal(result.plugins.length, 0); assert.equal(result.warnings.length, 4); assert.equal(result.scanned, 0);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(discoverGithub(controller.signal), { name: 'AbortError' });
    assert.equal(calls, 4);
  });
});
