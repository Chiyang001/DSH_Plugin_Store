import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyRecommendations, mergeCatalog, pluginCompatibility, safeLogo, shanghaiDay } from '../src/model';
import { parseIndex } from '../src/network';
import type { Bundle, Category, Plugin } from '../src/types';
const logo = 'data:image/png;base64,iVBORw0KGgo=';
test('real Host logos take priority, repository icons survive missing Host metadata', () => {
  const original: Plugin = { id: 'test', name: 'test', description: 'test', author: 'author', category: 'coding', origin: 'github', url: 'https://github.com/a/b', tags: [], color: 'blue', icon: 'code', logo, logoSource: 'https://example.com/icon.png', verified: true };
  const bundle: Bundle = { name: 'test', official: false, installed: true, enabled: true, availability: 'profile', optional: false, removable: true, updatable: false, rows: [] };
  assert.equal(mergeCatalog([original], [bundle])[0].logo, logo);
  const hostLogo = 'data:image/png;base64,aG9zdA==';
  assert.equal(mergeCatalog([original], [{ ...bundle, meta: { icon: hostLogo } }])[0].logo, hostLogo);
  assert.equal(mergeCatalog([original], [bundle])[0].author, 'author');
});
test('only supported data images and credential-free HTTPS images are accepted', () => {
  assert.equal(safeLogo(logo), logo);
  assert.equal(safeLogo('https://example.com/icon.svg'), 'https://example.com/icon.svg');
  for (const value of ['javascript:alert(1)', 'data:text/html;base64,AAAA', 'file:///secret.png', 'https://user:secret@example.com/icon.png', 'http://example.com/icon.png']) assert.equal(safeLogo(value), undefined);
});
test('index icons resolve relative to the exact subscribed index URL', () => {
  const [plugin] = parseIndex({ format: 1, plugins: [{ name: 'dsh-logo', icon: './icons/logo.svg', versions: [{ version: '1.0.0', source: { type: 'npm' } }] }] }, 'source', 'https://example.com/market/index.json');
  assert.equal(plugin.logo, 'https://example.com/market/icons/logo.svg');
  assert.equal(plugin.logoKind, 'index');
});
test('daily picks are stable per China day, diverse and change across dates', () => {
  const groups: Category[] = ['coding', 'knowledge', 'productivity', 'creative', 'integration', 'interface'];
  const plugins: Plugin[] = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, name: `Plugin ${i}`, description: 'Useful tool', author: 'author', category: groups[i % groups.length], origin: i % 4 === 0 ? 'official' : 'github', url: 'https://github.com/a/b', spec: 'test@1.0.0', verified: true, tags: [], color: 'blue', icon: 'code' }));
  const result = dailyRecommendations(plugins, '2026-10-31');
  assert.deepEqual(result, dailyRecommendations(plugins, '2026-10-31'));
  assert.notDeepEqual(result, dailyRecommendations(plugins, '2026-11-01'));
  assert.equal(new Set(result.map(p => p.id)).size, 6);
  assert.ok(new Set(result.map(p => p.category)).size >= 4);
  assert.ok(result.every(p => p.origin !== 'official'));
  for (let batch = 0; batch < 8; batch++) assert.ok(dailyRecommendations(plugins, '2026-11-01', 6, undefined, batch).every(p => p.origin !== 'official'));
  assert.equal(shanghaiDay(new Date('2026-10-31T16:01:00Z')), '2026-11-01');
  assert.equal(shanghaiDay(new Date('2026-10-31T15:59:00Z')), '2026-10-31');
});

test('daily picks never use official packages to fill an undersized community pool', () => {
  const base: Plugin = { id: 'community', name: 'Community', description: 'tool', author: 'author', category: 'coding', origin: 'github', url: '', spec: 'community@1.0.0', verified: true, tags: [], color: 'blue', icon: 'code' };
  const official = { ...base, id: '@deepseek-ai/builtin', origin: 'official' as const, featured: true };
  assert.deepEqual(dailyRecommendations([official], '2026-11-01'), []);
  assert.deepEqual(dailyRecommendations([official, base], '2026-11-01').map(p => p.id), ['community']);
  assert.deepEqual(dailyRecommendations([{ ...official, origin: 'index' }], '2026-11-01'), []);
});
test('daily picks exclude known version mismatches and keep unknown compatibility honest', () => {
  const plugin: Plugin = { id: 'old', name: 'Old', description: 'tool', author: 'author', category: 'coding', origin: 'github', url: '', spec: 'old@1.0.0', tags: [], color: 'blue', icon: 'code', verified: true, engines: '^0.1.0' };
  assert.equal(pluginCompatibility(plugin, '0.2.1-rc.5'), 'incompatible');
  assert.equal(pluginCompatibility({ ...plugin, engines: '>=0.2.0-rc.2' }, '0.2.1-rc.5'), 'compatible');
  assert.equal(pluginCompatibility({ ...plugin, engines: undefined }, '0.2.1-rc.5'), 'unknown');
  assert.equal(dailyRecommendations([plugin], '2026-10-31', 6, '0.2.1-rc.5').length, 0);
});
