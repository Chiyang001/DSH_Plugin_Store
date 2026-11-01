import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogBatch, filterPlugins, mergeCatalog, outcome } from '../src/model';
import { httpsUrl, parseIndex, fetchJson } from '../src/network';
import type { Bundle, Plugin } from '../src/types';
const plugin: Plugin = { id: 'demo', name: '记忆助手', description: '跨会话搜索', author: 'alice', category: 'knowledge', origin: 'github', url: 'https://github.com/alice/demo', tags: ['memory'], color: 'purple', icon: 'brain', stars: 42 };
const bundle: Bundle = { name: 'demo', official: false, availability: 'profile', enabled: true, installed: true, optional: false, removable: true, updatable: true, version: '1.2.3', rows: [], meta: { title: { zh: '宿主名称' } } };
test('search combines Chinese, author, source and category filters', () => {
  assert.equal(filterPlugins([plugin], { query: 'ALICE', category: 'knowledge', origin: 'github', sort: 'stars' }).length, 1);
  assert.equal(filterPlugins([plugin], { query: '记忆', category: 'coding', origin: 'all', sort: 'recommended' }).length, 0);
  assert.equal(filterPlugins([plugin], { query: 'memory', category: 'all', origin: 'official', sort: 'recommended' }).length, 0);
});
test('search matches separate terms, repository addresses, category labels and bilingual intent', () => {
  const p = { ...plugin, name: 'Memory Keeper', description: 'Cross-session memory', url: 'https://github.com/alice/dsh-keeper' };
  const options = { category: 'all' as const, origin: 'all', sort: 'recommended' };
  for (const query of ['记忆 alice', 'memory keeper', 'dsh-keeper', '知识与记忆', 'Ｍｅｍｏｒｙ']) assert.equal(filterPlugins([p], { ...options, query }).length, 1, query);
  assert.equal(filterPlugins([p], { ...options, query: 'memory unrelated' }).length, 0);
});

test('official plugins remain last across sorting, searches, batch rotation and official-only filters', () => {
  const official: Plugin = { ...plugin, id: '@deepseek-ai/official', name: 'Official', origin: 'official', stars: 999999, featured: true, updatedAt: '2099-01-01' };
  const community = { ...plugin, id: 'community', updatedAt: '2026-01-01' };
  const subscribed: Plugin = { ...plugin, id: 'private', origin: 'index' };
  for (const sort of ['recommended', 'stars', 'newest']) {
    const result = filterPlugins([official, community, subscribed], { query: '搜索', category: 'all', origin: 'all', sort });
    assert.equal(result.at(-1)?.id, official.id);
    for (let batch = 0; batch < 8; batch++) assert.equal(catalogBatch(result, batch).at(-1)?.id, official.id);
    assert.equal(filterPlugins(result, { query: '', category: 'all', origin: 'all', sort, hideOfficial: true }).length, 2);
    assert.deepEqual(filterPlugins(result, { query: '', category: 'all', origin: 'official', sort }), [official]);
  }
});
test('Host inventory wins over stale catalog versions and deduplicates the package', () => {
  const items = mergeCatalog([{ ...plugin, version: '0.1.0' }], [bundle]);
  assert.equal(items.length, 1); assert.equal(items[0].version, '1.2.3'); assert.equal(items[0].name, '宿主名称');
});
test('restart-required and overridden are never presented as applied', () => {
  assert.match(outcome({ changed: true, application: 'restart-required' }).message, /重启/);
  assert.equal(outcome({ changed: true, application: 'overridden' }).ok, false);
  assert.equal(outcome({ changed: false, application: 'failed', error: { code: 'denied', reason: '权限不足' } }).message, '权限不足');
});
const index = (source: unknown) => ({ format: 1, title: 'test', plugins: [{ name: 'dsh-demo', title: { zh: '测试插件' }, metadata: { keywords: ['memory'] }, versions: [{ version: '1.0.0', source }] }] });
test('native format-1 index installs the declared exact npm version', () => {
  const [p] = parseIndex(index({ type: 'npm' }), '自定义');
  assert.equal(p.spec, 'dsh-demo@1.0.0'); assert.equal(p.origin, 'index'); assert.equal(p.sourceName, '自定义');
});
test('Git index pins the commit and preserves the monorepo package path', () => {
  const [p] = parseIndex(index({ type: 'git', url: 'https://github.com/alice/demo', commit: 'a'.repeat(40), path: 'packages/plugin' }), 'Git');
  assert.equal(p.spec, `git+https://github.com/alice/demo.git#${'a'.repeat(40)}&path:/packages/plugin`);
  assert.throws(() => parseIndex(index({ type: 'git', url: 'https://github.com/alice/demo', commit: 'main' }), 'bad'), /40/);
  assert.throws(() => parseIndex(index({ type: 'git', url: 'https://github.com/alice/demo', commit: 'a'.repeat(40), path: '../bad' }), 'bad'), /子目录/);
});
test('invalid indexes and credentials are rejected; explicit registries are preserved', () => {
  assert.throws(() => parseIndex({ formatVersion: 1, plugins: [] }, 'bad'), /format/);
  assert.throws(() => httpsUrl('http://example.com/index.json'), /HTTPS/);
  assert.throws(() => httpsUrl('https://user:pass@example.com/index.json'), /HTTPS/);
  assert.equal(parseIndex(index({ type: 'npm', registry: 'https://example.com/' }), 'source')[0].registry, 'https://example.com/');
  assert.throws(() => parseIndex(index({ type: 'npm', registry: 'https://user:secret@example.com/' }), 'bad'), /HTTPS/);
});
test('oversized network responses are stopped instead of parsed', async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async () => new Response('x'.repeat(2 * 1024 * 1024 + 1));
  try { await assert.rejects(fetchJson('https://example.com/index.json'), /2 MB/); } finally { globalThis.fetch = saved; }
});
